import {
  SyncRunResultSchema,
  type AppConfig,
  type CollectRange,
  type GitHubClient,
  type RepositorySyncResult,
  type RunSyncInput,
  type SyncRunResult,
} from "@leadboard/contracts";
import type { Pool } from "pg";
import { withTransaction } from "../db/index.js";
import { collectRepositoryActivities } from "../collectors/github.js";
import { applyRepositoryScope, ingestRepositoryActivities } from "../ingestion/index.js";
import { RepositorySync } from "../repositories/sync.js";

const LOCK_ID = "2026092701";
const REPOSITORY_CONCURRENCY = 3;

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("A repository synchronization is already running");
    this.name = "SyncAlreadyRunningError";
  }
}

export class SyncService {
  private readonly repositorySync: RepositorySync;

  constructor(private readonly pool: Pool, private readonly client: GitHubClient, private readonly config: AppConfig) {
    this.repositorySync = new RepositorySync(client);
  }

  async runSync(input: RunSyncInput): Promise<SyncRunResult> {
    const lockClient = await this.pool.connect();
    let locked = false;
    try {
      const lock = await lockClient.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock($1::bigint) AS acquired", [LOCK_ID],
      );
      if (!lock.rows[0]?.acquired) throw new SyncAlreadyRunningError();
      locked = true;
      return await this.runWithLock(input);
    } finally {
      if (locked) {
        await lockClient.query("SELECT pg_advisory_unlock($1::bigint)", [LOCK_ID]).catch(() => undefined);
      }
      lockClient.release();
    }
  }

  private async runWithLock(input: RunSyncInput): Promise<SyncRunResult> {
    const started = new Date();
    const range = await this.resolveRange(input, started);
    const run = await this.pool.query<{ id: string }>(
      `INSERT INTO sync_runs (trigger, range_from, range_to, started_at, status)
       VALUES ($1, $2, $3, $4, 'running') RETURNING id`,
      [input.trigger, range.from, range.to, started.toISOString()],
    );
    const runId = run.rows[0]!.id;
    let repositoriesOk = 0;
    let repositoriesFailed = 0;
    let errorMessage: string | null = null;
    let status: SyncRunResult["status"] = "success";

    try {
      const scope = await this.repositorySync.syncRepositories({
        org: this.config.githubOrg,
        groupProperty: this.config.groupProperty,
      });
      await applyRepositoryScope(this.pool, scope);
      const results = await this.collectScope(scope, range);
      repositoriesOk = results.ok;
      repositoriesFailed = results.failed.length;
      if (repositoriesFailed > 0) {
        status = repositoriesOk > 0 ? "partial" : "failed";
        errorMessage = results.failed.slice(0, 20).join("\n").slice(0, 4000);
      }
    } catch (error) {
      status = "failed";
      errorMessage = safeMessage(error, this.config.githubToken);
    }

    const finished = new Date();
    await this.pool.query(
      `UPDATE sync_runs SET status = $2, repositories_ok = $3,
         repositories_failed = $4, error_message = $5, finished_at = $6
       WHERE id = $1`,
      [runId, status, repositoriesOk, repositoriesFailed, errorMessage, finished.toISOString()],
    );
    return SyncRunResultSchema.parse({
      status, trigger: input.trigger, rangeFrom: range.from, rangeTo: range.to,
      repositoriesOk, repositoriesFailed,
      startedAt: started.toISOString(), finishedAt: finished.toISOString(),
    });
  }

  private async resolveRange(input: RunSyncInput, now: Date): Promise<CollectRange> {
    const to = input.to ?? now.toISOString();
    let from = input.from;
    if (!from) {
      const previous = await this.pool.query<{ range_to: Date }>(
        `SELECT max(range_to) AS range_to FROM sync_runs WHERE status = 'success'`,
      );
      const previousTo = previous.rows[0]?.range_to;
      from = previousTo
        ? new Date(previousTo.getTime() - this.config.syncOverlapMinutes * 60_000).toISOString()
        : new Date(now.getTime() - this.config.initialSyncDays * 86_400_000).toISOString();
    }
    if (Date.parse(from) >= Date.parse(to)) throw new Error("Sync range must have from earlier than to");
    return { from, to };
  }

  private async collectScope(scope: RepositorySyncResult, range: CollectRange): Promise<{ ok: number; failed: string[] }> {
    const failures: string[] = [];
    let next = 0;
    let ok = 0;
    await Promise.all(Array.from({ length: Math.min(REPOSITORY_CONCURRENCY, scope.trackedRepositories.length) }, async () => {
      while (true) {
        const index = next++;
        const repository = scope.trackedRepositories[index];
        if (!repository) return;
        try {
          const activities = await collectRepositoryActivities(this.client, repository, range);
          await withTransaction((transaction) => ingestRepositoryActivities(transaction, repository.githubId, activities));
          ok += 1;
        } catch (error) {
          failures.push(`${repository.fullName}: ${safeMessage(error, this.config.githubToken)}`);
        }
      }
    }));
    return { ok, failed: failures };
  }
}

function safeMessage(error: unknown, token?: string): string {
  const message = error instanceof Error ? error.message : "Unknown synchronization error";
  return (token ? message.replaceAll(token, "[redacted]") : message).slice(0, 500);
}

import {
  ContributorDetailSchema,
  ContributorLeaderboardResponseSchema,
  GroupsResponseSchema,
  LeaderboardMetricSchema,
  OrganizationSummaryResponseSchema,
  RepositoryStatsResponseSchema,
  TimeRangeSchema,
  type ApiErrorResponse,
  type ContributorDetail,
  type ContributorRank,
  type GroupSummary,
  type LeaderboardQuery,
  type OrganizationActivitySummary,
  type RepositoryStat,
  type SyncStatus,
  type TimeRange,
} from "@leadboard/contracts";
import { Router, type Response } from "express";
import { AnalyticsService } from "../analytics/index.js";
import { GitHubClientError } from "../github/client.js";
import { getSyncStatus as defaultGetSyncStatus, SyncAlreadyRunningError } from "../sync/index.js";

interface AnalyticsApi {
  getGroups(): Promise<GroupSummary[]>;
  getOrganizationActivitySummary(range: TimeRange): Promise<OrganizationActivitySummary>;
  getRepositoryStats(range: TimeRange, group?: string): Promise<RepositoryStat[]>;
  getContributorLeaderboard(input: LeaderboardQuery): Promise<ContributorRank[]>;
  getContributorDetail(username: string, range: TimeRange): Promise<ContributorDetail | null>;
}

export interface ApiDependencies {
  analytics: AnalyticsApi;
  getSyncStatus(): Promise<SyncStatus>;
}

function sendError(res: Response, status: number, code: string, message: string): void {
  const body: ApiErrorResponse = { error: { code, message } };
  res.status(status).json(body);
}

function singleQuery(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.length > 0 ? value : "";
}

function parseRange(value: unknown, res: Response): TimeRange | null {
  const raw = singleQuery(value);
  if (raw === "") {
    sendError(res, 400, "INVALID_RANGE", "range must be 7d, 30d, 90d or all");
    return null;
  }
  const parsed = TimeRangeSchema.safeParse(raw ?? "30d");
  if (!parsed.success) {
    sendError(res, 400, "INVALID_RANGE", "range must be 7d, 30d, 90d or all");
    return null;
  }
  return parsed.data;
}

function parseMetric(value: unknown, res: Response) {
  const raw = singleQuery(value);
  if (raw === "") {
    sendError(res, 400, "INVALID_METRIC", "metric must be total, commits, prs or issues");
    return null;
  }
  const parsed = LeaderboardMetricSchema.safeParse(raw ?? "total");
  if (!parsed.success) {
    sendError(res, 400, "INVALID_METRIC", "metric must be total, commits, prs or issues");
    return null;
  }
  return parsed.data;
}

function parseLimit(value: unknown, res: Response): number | null {
  const raw = singleQuery(value);
  if (raw === undefined) return 50;
  if (!/^[1-9]\d*$/.test(raw)) {
    sendError(res, 400, "INVALID_LIMIT", "limit must be a positive integer");
    return null;
  }
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit)) {
    sendError(res, 400, "INVALID_LIMIT", "limit must be a positive integer");
    return null;
  }
  return limit;
}

function parseGroup(value: unknown, res: Response): string | undefined | null {
  const raw = singleQuery(value);
  if (raw === "") {
    sendError(res, 400, "INVALID_GROUP", "group must be a non-empty string");
    return null;
  }
  return raw;
}

function handleServiceError(error: unknown, res: Response): boolean {
  if (error instanceof SyncAlreadyRunningError) {
    sendError(res, 409, "SYNC_ALREADY_RUNNING", "A synchronization run is already active");
    return true;
  }
  if (error instanceof GitHubClientError && error.code === "RATE_LIMITED") {
    sendError(res, 503, "GITHUB_RATE_LIMITED", "GitHub is temporarily rate limited");
    return true;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code.startsWith("08") || ["57P01", "57P02", "57P03"].includes(code)) {
      sendError(res, 503, "DATABASE_UNAVAILABLE", "Database is temporarily unavailable");
      return true;
    }
  }
  return false;
}

export function createApiRouter(dependencies: Partial<ApiDependencies> = {}): Router {
  const analytics = dependencies.analytics ?? new AnalyticsService();
  const getSyncStatus = dependencies.getSyncStatus ?? defaultGetSyncStatus;
  const router = Router();

  router.get("/organization/summary", async (req, res, next) => {
    const range = parseRange(req.query.range, res);
    if (range === null) return;
    try {
      const [summary, sync] = await Promise.all([
        analytics.getOrganizationActivitySummary(range),
        getSyncStatus(),
      ]);
      res.json(OrganizationSummaryResponseSchema.parse({
        ...summary,
        lastUpdatedAt: sync.lastSuccessfulRunAt,
        dataStatus: sync.dataStatus,
      }));
    } catch (error) {
      if (!handleServiceError(error, res)) next(error);
    }
  });

  router.get("/organization/repositories", async (req, res, next) => {
    const range = parseRange(req.query.range, res);
    if (range === null) return;
    const group = parseGroup(req.query.group, res);
    if (group === null) return;
    try {
      const items = await analytics.getRepositoryStats(range, group);
      res.json(RepositoryStatsResponseSchema.parse({ items }));
    } catch (error) {
      if (!handleServiceError(error, res)) next(error);
    }
  });

  router.get("/groups", async (_req, res, next) => {
    try {
      res.json(GroupsResponseSchema.parse({ items: await analytics.getGroups() }));
    } catch (error) {
      if (!handleServiceError(error, res)) next(error);
    }
  });

  router.get("/contributors/leaderboard", async (req, res, next) => {
    const range = parseRange(req.query.range, res);
    if (range === null) return;
    const metric = parseMetric(req.query.metric, res);
    if (metric === null) return;
    const limit = parseLimit(req.query.limit, res);
    if (limit === null) return;
    const group = parseGroup(req.query.group, res);
    if (group === null) return;
    try {
      const items = await analytics.getContributorLeaderboard({
        range, metric, limit, ...(group === undefined ? {} : { group }),
      });
      res.json(ContributorLeaderboardResponseSchema.parse({ range, metric, items }));
    } catch (error) {
      if (!handleServiceError(error, res)) next(error);
    }
  });

  router.get("/contributors/:username", async (req, res, next) => {
    const range = parseRange(req.query.range, res);
    if (range === null) return;
    try {
      const detail = await analytics.getContributorDetail(req.params.username, range);
      if (detail === null) {
        sendError(res, 404, "CONTRIBUTOR_NOT_FOUND", "Contributor not found");
        return;
      }
      res.json(ContributorDetailSchema.parse(detail));
    } catch (error) {
      if (!handleServiceError(error, res)) next(error);
    }
  });

  router.get("/sync/status", async (_req, res, next) => {
    try {
      res.json(await getSyncStatus());
    } catch (error) {
      if (!handleServiceError(error, res)) next(error);
    }
  });

  return router;
}

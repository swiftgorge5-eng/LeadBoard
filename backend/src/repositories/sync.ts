import type {
  GitHubClient,
  GitHubRepositoryRef,
  RepositorySyncInput,
  RepositorySyncResult,
  TrackedRepository,
} from "@leadboard/contracts";
import { GitHubRepositoryRefSchema } from "@leadboard/contracts";
import { FEATURED_GROUP, FEATURED_REPOSITORIES } from "./featured.js";

/** Builds one complete repository scope from the GitHub Client's paginated listing. */
export class RepositorySync {
  constructor(
    private readonly client: GitHubClient,
    private readonly featuredRepositories: readonly string[] = FEATURED_REPOSITORIES,
  ) {}

  async syncRepositories(input: RepositorySyncInput): Promise<RepositorySyncResult> {
    const repositories = await this.client.listOrgRepositories(input.org);
    const trackedRepositories: TrackedRepository[] = [];

    const scope = new Map<string, TrackedRepository>();
    const mapTracked = (repository: GitHubRepositoryRef, group: string): TrackedRepository => ({
      githubId: repository.githubId,
      nodeId: repository.nodeId,
      owner: repository.owner,
      name: repository.name,
      fullName: repository.fullName,
      defaultBranch: repository.defaultBranch,
      group,
      htmlUrl: repository.htmlUrl,
      archived: repository.archived,
    });

    const tracked = await mapWithConcurrency(repositories, 6, async (repository) => {
      if (repository.isFork || repository.isPrivate) return null;

      const properties = await this.client.getRepositoryCustomProperties(repository.owner, repository.name);
      const value = properties[input.groupProperty];
      if (typeof value !== "string") return null;

      const group = value.trim();
      if (!group || group === "untracked") return null;
      return mapTracked(repository, group);
    });
    for (const repository of tracked) {
      if (repository) scope.set(repository.githubId, repository);
    }

    // The HUST board's `osd_sig` property defines the organization scope. A small
    // curated set of public upstreams is added explicitly and never queried for
    // the HUST-only custom property.
    const featured = await Promise.all(this.featuredRepositories.map(async (fullName) => {
      const [owner, name] = fullName.split("/");
      const payload = await this.client.requestRest<unknown>("GET", `/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(name!)}`);
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error(`Invalid GitHub repository response for ${fullName}`);
      }
      const raw = payload as Record<string, unknown>;
      const ownerData = raw.owner as Record<string, unknown> | undefined;
      const parsed = GitHubRepositoryRefSchema.safeParse({
        githubId: typeof raw.id === "number" || typeof raw.id === "string" ? String(raw.id) : null,
        nodeId: raw.node_id,
        owner: ownerData?.login,
        name: raw.name,
        fullName: raw.full_name,
        defaultBranch: raw.default_branch,
        htmlUrl: raw.html_url,
        archived: raw.archived,
        isFork: raw.fork,
        isPrivate: raw.private,
      });
      if (!parsed.success) throw new Error(`Invalid GitHub repository response for ${fullName}`);
      if (parsed.data.isFork || parsed.data.isPrivate) return null;
      return mapTracked(parsed.data, FEATURED_GROUP);
    }));
    for (const repository of featured) {
      if (repository && ![...scope.values()].some((item) => item.fullName.toLowerCase() === repository.fullName.toLowerCase())) {
        scope.set(repository.githubId, repository);
      }
    }

    trackedRepositories.push(...scope.values());
    trackedRepositories.sort((left, right) => left.fullName.localeCompare(right.fullName));

    return { trackedRepositories, syncedAt: new Date().toISOString() };
  }
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!);
    }
  }));
  return results;
}

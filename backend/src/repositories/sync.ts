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

  async syncRepositories(_input: RepositorySyncInput): Promise<RepositorySyncResult> {
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

    // Track only the explicitly curated public repositories until a local SIG
    // or opt-in member scope has been agreed and configured.
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
      if (repository) scope.set(repository.githubId, repository);
    }

    trackedRepositories.push(...scope.values());
    trackedRepositories.sort((left, right) => left.fullName.localeCompare(right.fullName));

    return { trackedRepositories, syncedAt: new Date().toISOString() };
  }
}

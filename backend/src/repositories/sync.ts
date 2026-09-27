import type {
  GitHubClient,
  RepositorySyncInput,
  RepositorySyncResult,
  TrackedRepository,
} from "@leadboard/contracts";

/** Builds one complete repository scope from the GitHub Client's paginated listing. */
export class RepositorySync {
  constructor(private readonly client: GitHubClient) {}

  async syncRepositories(input: RepositorySyncInput): Promise<RepositorySyncResult> {
    const repositories = await this.client.listOrgRepositories(input.org);
    const trackedRepositories: TrackedRepository[] = [];

    for (const repository of repositories) {
      if (repository.isFork || repository.isPrivate) continue;

      const properties = await this.client.getRepositoryCustomProperties(repository.owner, repository.name);
      const value = properties[input.groupProperty];
      if (typeof value !== "string") continue;

      const group = value.trim();
      if (!group || group === "untracked") continue;

      trackedRepositories.push({
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
    }

    return { trackedRepositories, syncedAt: new Date().toISOString() };
  }
}

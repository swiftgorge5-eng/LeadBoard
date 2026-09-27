import {
  CollectRangeSchema,
  CommitActivitySchema,
  type CollectRange,
  type CommitActivity,
  type GitHubActorRef,
  type GitHubClient,
  type TrackedRepository,
} from "@leadboard/contracts";

const COMMITS_QUERY = `
  query CommitHistory($owner: String!, $name: String!, $branch: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      ref(qualifiedName: $branch) {
        target {
          ... on Commit {
            history(first: 100, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                oid
                authoredDate
                additions
                deletions
                parents { totalCount }
                url
                author {
                  user { databaseId login avatarUrl }
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface GraphQLCommit {
  oid: string;
  authoredDate: string;
  additions: number;
  deletions: number;
  parents: { totalCount: number };
  url: string | null;
  author: {
    user: { databaseId: number | null; login: string; avatarUrl: string } | null;
  } | null;
}

interface CommitHistoryResponse {
  repository: {
    ref: {
      target: {
        history: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: (GraphQLCommit | null)[];
        };
      } | null;
    } | null;
  } | null;
}

function actorRef(commit: GraphQLCommit): GitHubActorRef {
  const user = commit.author?.user;
  if (user?.databaseId == null) {
    return { githubId: null, login: null, avatarUrl: null, type: "Unknown" };
  }
  return {
    githubId: String(user.databaseId),
    login: user.login,
    avatarUrl: user.avatarUrl,
    type: "User",
  };
}

/** Reads the complete default-branch history before applying the authored-time window. */
export class CommitCollector {
  constructor(private readonly client: GitHubClient) {}

  async collectCommits(repo: TrackedRepository, range: CollectRange): Promise<CommitActivity[]> {
    const { from, to } = CollectRangeSchema.parse(range);
    const fromTime = Date.parse(from);
    const toTime = Date.parse(to);
    const activities: CommitActivity[] = [];
    const visitedCursors = new Set<string>();
    let cursor: string | null = null;

    do {
      const response: CommitHistoryResponse = await this.client.queryGraphQL<CommitHistoryResponse>(COMMITS_QUERY, {
        owner: repo.owner,
        name: repo.name,
        branch: `refs/heads/${repo.defaultBranch}`,
        cursor,
      });

      if (response.repository === null) {
        throw new Error(`GitHub repository not found: ${repo.fullName}`);
      }
      // An empty repository has no default-branch ref yet. Losing it mid-scan is an error.
      if (response.repository.ref === null) {
        if (cursor === null) return [];
        throw new Error("GitHub default branch disappeared during commit collection");
      }
      const history = response.repository.ref.target?.history;
      if (!history || !Array.isArray(history.nodes) || !history.pageInfo) {
        throw new Error("GitHub commit history response is incomplete");
      }

      for (const commit of history.nodes) {
        if (commit === null) throw new Error("GitHub commit history contains a null node");
        const authoredAt = Date.parse(commit.authoredDate);
        if (authoredAt < fromTime || authoredAt >= toTime) continue;

        activities.push(CommitActivitySchema.parse({
          kind: "commit",
          repositoryGithubId: repo.githubId,
          externalId: commit.oid,
          actor: actorRef(commit),
          occurredAt: commit.authoredDate,
          additions: commit.additions,
          deletions: commit.deletions,
          isMerge: commit.parents.totalCount > 1,
          rawUrl: commit.url,
        }));
      }

      if (!history.pageInfo.hasNextPage) break;
      const nextCursor = history.pageInfo.endCursor;
      if (!nextCursor || visitedCursors.has(nextCursor)) {
        throw new Error("GitHub commit history pagination has no new cursor");
      }
      visitedCursors.add(nextCursor);
      cursor = nextCursor;
    } while (true);

    return activities;
  }
}

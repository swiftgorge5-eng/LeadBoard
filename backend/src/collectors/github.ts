import type {
  CollectRange,
  GitHubActivity,
  GitHubActorRef,
  GitHubClient,
  TrackedRepository,
} from "@leadboard/contracts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function rows(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is JsonRecord => item !== null) : [];
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function actor(value: unknown): GitHubActorRef {
  const node = record(value);
  if (!node) return { githubId: null, login: null, avatarUrl: null, type: "Unknown" };
  const login = typeof node.login === "string" && node.login.trim() ? node.login : null;
  const rawId = node.databaseId;
  const githubId = typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId > 0
    ? String(rawId)
    : typeof rawId === "string" && /^[1-9]\d*$/.test(rawId) ? rawId : null;
  const typename = typeof node.__typename === "string" ? node.__typename : "";
  const type: GitHubActorRef["type"] = typename === "Bot" || login?.endsWith("[bot]")
    ? "Bot"
    : typename === "User" ? "User"
      : typename === "Organization" ? "Organization" : "Unknown";
  return {
    githubId,
    login,
    avatarUrl: typeof node.avatarUrl === "string" ? node.avatarUrl : null,
    type,
  };
}

function inRange(value: string | null, range: CollectRange): value is string {
  if (!value) return false;
  const time = Date.parse(value);
  return time >= Date.parse(range.from) && time < Date.parse(range.to);
}

export async function collectRepositoryActivities(
  client: GitHubClient,
  repository: TrackedRepository,
  range: CollectRange,
): Promise<GitHubActivity[]> {
  const [commits, pullRequests, issues] = await Promise.all([
    collectCommits(client, repository, range),
    collectPullRequests(client, repository, range),
    collectIssues(client, repository, range),
  ]);
  return [...commits, ...pullRequests, ...issues];
}

export async function collectCommits(
  client: GitHubClient,
  repository: TrackedRepository,
  range: CollectRange,
): Promise<GitHubActivity[]> {
  const query = `
    query CommitHistory($owner: String!, $name: String!, $since: GitTimestamp!, $until: GitTimestamp!, $after: String) {
      repository(owner: $owner, name: $name) {
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 100, since: $since, until: $until, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  oid committedDate url
                  parents(first: 2) { totalCount }
                  author { user { __typename databaseId login avatarUrl } }
                }
              }
            }
          }
        }
      }
    }`;
  const activities: GitHubActivity[] = [];
  let after: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const payload = record(await client.queryGraphQL<unknown>(query, {
      owner: repository.owner,
      name: repository.name,
      since: range.from,
      until: range.to,
      after,
    }));
    const repo = record(payload?.repository);
    if (!repo) throw new Error(`GitHub could not access ${repository.fullName}`);
    const ref = record(repo.defaultBranchRef);
    if (!ref) break;
    const target = record(ref.target);
    const history = record(target?.history);
    if (!history) throw new Error(`GitHub returned no commit history for ${repository.fullName}`);
    for (const node of rows(history.nodes)) {
      const occurredAt = timestamp(node.committedDate);
      if (!inRange(occurredAt, range) || typeof node.oid !== "string") continue;
      const author = record(node.author);
      const parents = record(node.parents);
      activities.push({
        kind: "commit",
        repositoryGithubId: repository.githubId,
        externalId: node.oid,
        occurredAt,
        actor: actor(author?.user),
        additions: count(node.additions),
        deletions: count(node.deletions),
        isMerge: count(parents?.totalCount) > 1,
        rawUrl: typeof node.url === "string" ? node.url : null,
      });
    }
    const pageInfo = record(history.pageInfo);
    hasNext = pageInfo?.hasNextPage === true;
    after = typeof pageInfo?.endCursor === "string" ? pageInfo.endCursor : null;
    if (hasNext && !after) throw new Error(`GitHub returned an invalid commit cursor for ${repository.fullName}`);
  }
  return activities;
}

export async function collectPullRequests(
  client: GitHubClient,
  repository: TrackedRepository,
  range: CollectRange,
): Promise<GitHubActivity[]> {
  const query = `
    query PullRequests($owner: String!, $name: String!, $after: String) {
      repository(owner: $owner, name: $name) {
        pullRequests(first: 100, after: $after, states: [OPEN, CLOSED, MERGED],
          orderBy: {field: UPDATED_AT, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            databaseId number state createdAt closedAt mergedAt updatedAt url
            author { __typename login avatarUrl ... on User { databaseId } ... on Organization { databaseId } }
          }
        }
      }
    }`;
  const activities: GitHubActivity[] = [];
  let after: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const payload = record(await client.queryGraphQL<unknown>(query, {
      owner: repository.owner, name: repository.name, after,
    }));
    const repo = record(payload?.repository);
    if (!repo) throw new Error(`GitHub could not access ${repository.fullName}`);
    const connection = record(repo.pullRequests);
    if (!connection) throw new Error(`GitHub returned no pull request connection for ${repository.fullName}`);
    let reachedOlderThanRange = false;
    for (const node of rows(connection.nodes)) {
      const updatedAt = timestamp(node.updatedAt);
      if (!updatedAt || Date.parse(updatedAt) < Date.parse(range.from)) {
        reachedOlderThanRange = true;
        break;
      }
      const id = node.databaseId;
      const occurredAt = timestamp(node.createdAt);
      const closedAt = timestamp(node.closedAt);
      if (!(typeof id === "number" && Number.isSafeInteger(id) && id > 0) || (!inRange(occurredAt, range) && !inRange(closedAt, range))) continue;
      const mergedAt = timestamp(node.mergedAt);
      activities.push({
        kind: "pull_request",
        repositoryGithubId: repository.githubId,
        externalId: String(id),
        number: count(node.number),
        occurredAt: occurredAt ?? closedAt!,
        state: mergedAt ? "merged" : node.state === "OPEN" ? "open" : "closed",
        closedAt,
        mergedAt,
        actor: actor(node.author),
        rawUrl: typeof node.url === "string" ? node.url : null,
      });
    }
    if (reachedOlderThanRange) break;
    const pageInfo = record(connection.pageInfo);
    hasNext = pageInfo?.hasNextPage === true;
    after = typeof pageInfo?.endCursor === "string" ? pageInfo.endCursor : null;
    if (hasNext && !after) throw new Error(`GitHub returned an invalid pull request cursor for ${repository.fullName}`);
  }
  return activities;
}

export async function collectIssues(
  client: GitHubClient,
  repository: TrackedRepository,
  range: CollectRange,
): Promise<GitHubActivity[]> {
  const query = `
    query Issues($owner: String!, $name: String!, $since: DateTime!, $after: String) {
      repository(owner: $owner, name: $name) {
        issues(first: 100, after: $after, states: [OPEN, CLOSED],
          orderBy: {field: UPDATED_AT, direction: DESC}, filterBy: {since: $since}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            databaseId number state createdAt closedAt updatedAt url
            author { __typename login avatarUrl ... on User { databaseId } ... on Organization { databaseId } }
          }
        }
      }
    }`;
  const activities: GitHubActivity[] = [];
  let after: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const payload = record(await client.queryGraphQL<unknown>(query, {
      owner: repository.owner, name: repository.name, since: range.from, after,
    }));
    const repo = record(payload?.repository);
    if (!repo) throw new Error(`GitHub could not access ${repository.fullName}`);
    const connection = record(repo.issues);
    if (!connection) throw new Error(`GitHub returned no issue connection for ${repository.fullName}`);
    for (const node of rows(connection.nodes)) {
      const id = node.databaseId;
      const occurredAt = timestamp(node.createdAt);
      const closedAt = timestamp(node.closedAt);
      if (!(typeof id === "number" && Number.isSafeInteger(id) && id > 0) || (!inRange(occurredAt, range) && !inRange(closedAt, range))) continue;
      activities.push({
        kind: "issue",
        repositoryGithubId: repository.githubId,
        externalId: String(id),
        number: count(node.number),
        occurredAt: occurredAt ?? closedAt!,
        state: node.state === "OPEN" ? "open" : "closed",
        closedAt,
        actor: actor(node.author),
        rawUrl: typeof node.url === "string" ? node.url : null,
      });
    }
    const pageInfo = record(connection.pageInfo);
    hasNext = pageInfo?.hasNextPage === true;
    after = typeof pageInfo?.endCursor === "string" ? pageInfo.endCursor : null;
    if (hasNext && !after) throw new Error(`GitHub returned an invalid issue cursor for ${repository.fullName}`);
  }
  return activities;
}

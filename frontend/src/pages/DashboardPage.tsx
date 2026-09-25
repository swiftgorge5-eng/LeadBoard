import { useEffect, useState } from "react";
import { TimeRangeSchema, type ContributorLeaderboardResponse, type GroupsResponse, type OrganizationSummaryResponse, type RepositoryStatsResponse } from "@leadboard/contracts";
import type { LeadBoardApiClient } from "../api/client";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { useFilters } from "../state/filters";

interface DashboardData {
  summary: OrganizationSummaryResponse;
  repositories: RepositoryStatsResponse;
  leaderboard: ContributorLeaderboardResponse;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DashboardData };

export function DashboardPage({ api, isMock = false }: { api: LeadBoardApiClient; isMock?: boolean }) {
  const { range, setRange, group, setGroup, metric } = useFilters();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [availableGroups, setAvailableGroups] = useState<GroupsResponse["items"]>([]);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoad({ status: "loading" });
    void Promise.all([
      api.getOrganizationSummary(range),
      api.getRepositories(range, group),
      api.getGroups(),
      api.getContributorLeaderboard({ range, metric, ...(group === undefined ? {} : { group }) }),
    ]).then(
      ([summary, repositories, groups, leaderboard]) => {
        if (active) {
          setAvailableGroups(groups.items);
          setLoad({ status: "ready", data: { summary, repositories, leaderboard } });
        }
      },
      (error: unknown) => {
        if (active) setLoad({ status: "error", message: error instanceof Error ? error.message : "数据加载失败" });
      },
    );
    return () => { active = false; };
  }, [api, range, group, metric, retry]);

  return (
    <>
      <section className="intro" aria-labelledby="dashboard-title">
        <p className="eyebrow">OPEN SOURCE, IN VIEW</p>
        <h1 id="dashboard-title">让每一份开源贡献<br />清晰可见。</h1>
        <p className="description">LeadBoard 正在建设中。这里展示 Dashboard 的基础结构和组织活动概况。</p>
        {isMock && <p className="demo-notice" role="status">当前展示模拟数据，不代表真实 GitHub 活动。</p>}
      </section>

      <section aria-label="Dashboard 筛选" className="filters">
        <label>
          时间范围
          <select value={range} onChange={(event) => setRange(TimeRangeSchema.parse(event.target.value))}>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
            <option value="90d">最近 90 天</option>
            <option value="all">已采集的全部历史</option>
          </select>
        </label>
        <label>
          分组
          <select value={group ?? ""} onChange={(event) => setGroup(event.target.value || undefined)}>
            <option value="">全部分组</option>
            {availableGroups.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>
      </section>

      <section className="dashboard-content" aria-label="Dashboard 内容">
        {load.status === "loading" && <LoadingState />}
        {load.status === "error" && <ErrorState message={load.message} onRetry={() => setRetry((value) => value + 1)} />}
        {load.status === "ready" && (
          <>
            <div className="section-heading">
              <div><p className="eyebrow">OVERVIEW</p><h2>组织活动概况</h2></div>
            </div>
            <p className="section-note">组织概况覆盖全部分组；分组选择会检查该分组是否有活动数据。</p>
            {load.data.summary.repositories === 0 && load.data.summary.total === 0 ? (
              <EmptyState />
            ) : (
              <div className="stat-grid">
                <div className="stat"><span>仓库</span><strong>{load.data.summary.repositories}</strong></div>
                <div className="stat"><span>贡献者</span><strong>{load.data.summary.contributors}</strong></div>
                <div className="stat"><span>Commit</span><strong>{load.data.summary.commits}</strong></div>
                <div className="stat"><span>PR</span><strong>{load.data.summary.prs}</strong></div>
                <div className="stat"><span>Issue</span><strong>{load.data.summary.issues}</strong></div>
                <div className="stat"><span>总活动</span><strong>{load.data.summary.total}</strong></div>
              </div>
            )}
            <div className="filter-status" aria-live="polite">
              {load.data.repositories.items.length === 0 && load.data.leaderboard.items.length === 0
                ? <EmptyState label="当前分组暂无活动数据" />
                : <p>当前筛选条件已有活动数据。详细视图将在后续任务中实现。</p>}
            </div>
          </>
        )}
      </section>
    </>
  );
}

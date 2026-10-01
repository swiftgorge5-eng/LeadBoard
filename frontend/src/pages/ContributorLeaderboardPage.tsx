import { useEffect, useState } from "react";
import {
  LeaderboardMetricSchema,
  TimeRangeSchema,
  type ContributorLeaderboardResponse,
  type GroupsResponse,
} from "@leadboard/contracts";
import { Link } from "react-router";
import type { LeadBoardApiClient } from "../api/client";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { useFilters } from "../state/filters";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; leaderboard: ContributorLeaderboardResponse; groups: GroupsResponse["items"] };

const metricLabel = {
  total: "总活动",
  commits: "Commit",
  prs: "Pull Request",
  issues: "Issue",
} as const;

export function ContributorLeaderboardPage({ api }: { api: LeadBoardApiClient }) {
  const { range, setRange, metric, setMetric, group, setGroup } = useFilters();
  const [state, setState] = useState<State>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void Promise.all([
      api.getContributorLeaderboard({ range, metric, ...(group === undefined ? {} : { group }), limit: 50 }),
      api.getGroups(),
    ]).then(
      ([leaderboard, groups]) => { if (active) setState({ status: "ready", leaderboard, groups: groups.items }); },
      (error: unknown) => {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "排行榜加载失败" });
      },
    );
    return () => { active = false; };
  }, [api, range, metric, group, retry]);

  const groups = state.status === "ready" ? state.groups : [];

  return (
    <div className="page-canvas">
      <section className="page-hero compact-hero">
        <div>
          <span className="hero-badge">CAMPUS MAKERS</span>
          <h1>校内开源达人</h1>
          <p>每一次提交、协作和讨论，都会在这里留下清晰的记录。</p>
        </div>
        <div className="hero-stamp" aria-hidden="true">🏆</div>
      </section>

      <section className="filter-card leaderboard-filters" aria-label="校内开源达人筛选">
        <div>
          <span className="filter-title">筛选榜单</span>
          <span className="filter-caption">当前按 {metricLabel[metric]} 排序</span>
        </div>
        <div className="filter-controls">
          <label>时间范围
            <select value={range} onChange={(event) => setRange(TimeRangeSchema.parse(event.target.value))}>
              <option value="7d">最近 7 天</option><option value="30d">最近 30 天</option>
              <option value="90d">最近 90 天</option><option value="all">全部历史</option>
            </select>
          </label>
          <label>排序指标
            <select value={metric} onChange={(event) => setMetric(LeaderboardMetricSchema.parse(event.target.value))}>
              <option value="total">总活动</option><option value="commits">Commit</option>
              <option value="prs">Pull Request</option><option value="issues">Issue</option>
            </select>
          </label>
          <label>分组
            <select value={group ?? ""} onChange={(event) => setGroup(event.target.value || undefined)}>
              <option value="">全部分组</option>
              {groups.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="dashboard-content">
        {state.status === "loading" && <LoadingState label="正在加载贡献者排行榜…" />}
        {state.status === "error" && <ErrorState message={state.message} onRetry={() => setRetry((value) => value + 1)} />}
        {state.status === "ready" && state.leaderboard.items.length === 0 && <EmptyState label="当前筛选下没有贡献者活动" />}
        {state.status === "ready" && state.leaderboard.items.length > 0 && (
          <>
            <div className="section-title-row">
              <div>
                <p className="section-kicker">OPEN SOURCE MAKERS</p>
                <h2>本期活跃达人</h2>
                <p>排名依据公开 GitHub 活动统计，不代表对个人能力的评价。</p>
              </div>
              <span className="count-pill">{state.leaderboard.items.length} 位贡献者</span>
            </div>

            <div className="podium-grid">
              {state.leaderboard.items.slice(0, 3).map((item) => (
                <Link className={`podium-card podium-${item.rank}`} key={item.login} to={`/contributors/${encodeURIComponent(item.login)}`}>
                  <span className="podium-rank">#{item.rank}</span>
                  {item.avatarUrl
                    ? <img className="podium-avatar" src={item.avatarUrl} alt="" />
                    : <span className="podium-avatar avatar-placeholder" aria-hidden="true">{item.login.slice(0, 1).toUpperCase()}</span>}
                  <strong className="podium-name">{item.login}</strong>
                  <span className="podium-score">{item.total}<small> 总活动</small></span>
                  <div className="podium-meta">
                    <span><b>{item.commits}</b> Commit</span>
                    <span><b>{item.prs}</b> PR</span>
                    <span><b>{item.issues}</b> Issue</span>
                  </div>
                </Link>
              ))}
            </div>

            <section className="panel ranking-panel">
              <div className="panel-heading">
                <div><p className="section-kicker">完整榜单</p><h2>校内开源达人</h2></div>
              </div>
              <div className="ranking-list">
                {state.leaderboard.items.map((item) => (
                  <Link className="ranking-row" key={item.login} to={`/contributors/${encodeURIComponent(item.login)}`}>
                    <span className={`rank-badge rank-${Math.min(item.rank, 4)}`}>{item.rank}</span>
                    {item.avatarUrl
                      ? <img className="avatar avatar-xl" src={item.avatarUrl} alt="" />
                      : <span className="avatar avatar-xl avatar-placeholder" aria-hidden="true">{item.login.slice(0, 1).toUpperCase()}</span>}
                    <span className="ranking-person">
                      <strong>{item.login}</strong>
                      <span className="tag-row">
                        <span className="tag tag-purple">{item.commits} Commit</span>
                        <span className="tag tag-blue">{item.prs} PR</span>
                        <span className="tag tag-gold">{item.issues} Issue</span>
                      </span>
                    </span>
                    <span className="ranking-metrics">
                      <span><small>Commit</small><b>{item.commits}</b></span>
                      <span><small>PR</small><b>{item.prs}</b></span>
                      <span><small>Issue</small><b>{item.issues}</b></span>
                    </span>
                    <span className="ranking-total"><strong>{item.total}</strong><small>总活动</small></span>
                    <span className="row-arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </div>
  );
}

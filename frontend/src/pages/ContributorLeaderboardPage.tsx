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
    <section className="page-section">
      <div className="section-heading">
        <div><p className="eyebrow">CONTRIBUTORS</p><h1 className="page-title">贡献者排行榜</h1></div>
        <Link to="/dashboard">返回 Dashboard</Link>
      </div>

      <div className="filters" aria-label="贡献者排行榜筛选">
        <label>时间范围
          <select value={range} onChange={(event) => setRange(TimeRangeSchema.parse(event.target.value))}>
            <option value="7d">最近 7 天</option><option value="30d">最近 30 天</option>
            <option value="90d">最近 90 天</option><option value="all">全部历史</option>
          </select>
        </label>
        <label>排序指标
          <select value={metric} onChange={(event) => setMetric(LeaderboardMetricSchema.parse(event.target.value))}>
            <option value="total">总活动</option><option value="commits">Commit</option>
            <option value="prs">PR</option><option value="issues">Issue</option>
          </select>
        </label>
        <label>分组
          <select value={group ?? ""} onChange={(event) => setGroup(event.target.value || undefined)}>
            <option value="">全部分组</option>
            {groups.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>
      </div>

      {state.status === "loading" && <LoadingState label="正在加载贡献者排行榜…" />}
      {state.status === "error" && <ErrorState message={state.message} onRetry={() => setRetry((value) => value + 1)} />}
      {state.status === "ready" && state.leaderboard.items.length === 0 && <EmptyState label="当前筛选下没有贡献者活动" />}
      {state.status === "ready" && state.leaderboard.items.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>排名</th><th>贡献者</th><th>Commit</th><th>PR</th><th>Issue</th><th>总活动</th></tr></thead>
            <tbody>
              {state.leaderboard.items.map((item) => (
                <tr key={item.login}>
                  <td className="rank-cell">#{item.rank}</td>
                  <td>
                    <Link className="contributor-link" to={`/contributors/${encodeURIComponent(item.login)}`}>
                      {item.avatarUrl
                        ? <img className="avatar" src={item.avatarUrl} alt="" />
                        : <span className="avatar avatar-placeholder" aria-hidden="true">{item.login.slice(0, 1).toUpperCase()}</span>}
                      <span>{item.login}</span>
                    </Link>
                  </td>
                  <td>{item.commits}</td><td>{item.prs}</td><td>{item.issues}</td><td><strong>{item.total}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

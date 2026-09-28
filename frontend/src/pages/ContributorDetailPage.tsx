import { useEffect, useState } from "react";
import { TimeRangeSchema, type ContributorDetail } from "@leadboard/contracts";
import { Link, useParams } from "react-router";
import type { LeadBoardApiClient } from "../api/client";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncStates";
import { useFilters } from "../state/filters";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: ContributorDetail };

export function ContributorDetailPage({ api }: { api: LeadBoardApiClient }) {
  const params = useParams();
  const username = params.username ?? "";
  const { range, setRange } = useFilters();
  const [state, setState] = useState<State>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    if (!username) {
      setState({ status: "error", message: "贡献者名称缺失" });
      return () => { active = false; };
    }
    void api.getContributorDetail(username, range).then(
      (detail) => { if (active) setState({ status: "ready", detail }); },
      (error: unknown) => {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "贡献者详情加载失败" });
      },
    );
    return () => { active = false; };
  }, [api, username, range, retry]);

  return (
    <section className="page-section">
      <div className="section-heading">
        <div><p className="eyebrow">CONTRIBUTOR DETAIL</p><h1 className="page-title">{username || "贡献者详情"}</h1></div>
        <Link to="/contributors">返回排行榜</Link>
      </div>
      <div className="filters compact-filters">
        <label>时间范围
          <select value={range} onChange={(event) => setRange(TimeRangeSchema.parse(event.target.value))}>
            <option value="7d">最近 7 天</option><option value="30d">最近 30 天</option>
            <option value="90d">最近 90 天</option><option value="all">全部历史</option>
          </select>
        </label>
      </div>

      {state.status === "loading" && <LoadingState label="正在加载贡献者详情…" />}
      {state.status === "error" && <ErrorState message={state.message} onRetry={() => setRetry((value) => value + 1)} />}
      {state.status === "ready" && (
        <>
          <div className="stat-grid contributor-summary">
            <div className="stat"><span>Commit</span><strong>{state.detail.commits}</strong></div>
            <div className="stat"><span>PR</span><strong>{state.detail.prs}</strong></div>
            <div className="stat"><span>Issue</span><strong>{state.detail.issues}</strong></div>
            <div className="stat"><span>总活动</span><strong>{state.detail.total}</strong></div>
          </div>
          <div className="section-heading subheading"><div><p className="eyebrow">REPOSITORIES</p><h2>仓库贡献</h2></div></div>
          {state.detail.repositories.length === 0 ? <EmptyState label="当前时间范围内没有仓库活动" /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>仓库</th><th>分组</th><th>Commit</th><th>PR</th><th>Issue</th><th>总活动</th></tr></thead>
                <tbody>{state.detail.repositories.map((item) => (
                  <tr key={item.githubId}><td>{item.fullName}</td><td>{item.group}</td>
                    <td>{item.commits}</td><td>{item.prs}</td><td>{item.issues}</td><td><strong>{item.total}</strong></td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { ContributorDetail, TimeRange } from "@leadboard/contracts";
import type { LeadBoardApiClient } from "../api/client";
import { useFilters } from "../state/filters";
import { ErrorState, LoadingState } from "../components/AsyncStates";

export function ContributorPage({ api }: { api: LeadBoardApiClient }) {
  const { username = "" } = useParams();
  const { range, setRange } = useFilters();
  const [detail, setDetail] = useState<ContributorDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void api.getContributorDetail(username, range).then((value) => { if (active) setDetail(value); }, (cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "贡献者信息加载失败"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, username, range]);
  return <section className="contributor-detail">
    <Link className="back-link" to="/">← 返回排行榜</Link>
    {loading && <LoadingState label="正在载入贡献者资料…" />}
    {!loading && error && <ErrorState message={error} />}
    {!loading && detail && <>
      <div className="profile-card">{detail.avatarUrl ? <img src={detail.avatarUrl} alt="" /> : <div className="avatar-fallback profile-avatar">{detail.login.slice(0, 1).toUpperCase()}</div>}<div><p className="eyebrow">CONTRIBUTOR PROFILE</p><h1>{detail.login}</h1><a href={`https://github.com/${encodeURIComponent(detail.login)}`} target="_blank" rel="noreferrer">查看 GitHub 主页 ↗</a></div><select value={range} onChange={(event) => setRange(event.target.value as TimeRange)} aria-label="选择时间范围"><option value="7d">最近 7 天</option><option value="30d">最近 30 天</option><option value="90d">最近 90 天</option><option value="all">全部历史</option></select></div>
      <div className="profile-stats"><div><strong>{detail.total.toLocaleString("zh-CN")}</strong><span>总贡献</span></div><div><strong>{detail.commits.toLocaleString("zh-CN")}</strong><span>Commits</span></div><div><strong>{detail.prs.toLocaleString("zh-CN")}</strong><span>Pull requests</span></div><div><strong>{detail.issues.toLocaleString("zh-CN")}</strong><span>Issues</span></div><div><strong>{detail.activeDays ?? "—"}</strong><span>活跃天数</span></div></div>
      <article className="profile-projects"><p className="eyebrow">PROJECT ACTIVITY</p><h2>项目贡献</h2>{detail.repositories.length ? <div className="ranking-table-wrap"><table className="ranking-table"><thead><tr><th>项目</th><th>分组</th><th>Commits</th><th>PR</th><th>Issues</th><th className="numeric">总贡献</th></tr></thead><tbody>{detail.repositories.map((repo) => <tr key={repo.githubId}><td><a className="project-link" href={`https://github.com/${repo.fullName}`} target="_blank" rel="noreferrer">{repo.fullName} ↗</a></td><td>{repo.group}</td><td>{repo.commits}</td><td>{repo.prs}</td><td>{repo.issues}</td><td className="numeric total-cell">{repo.total}</td></tr>)}</tbody></table></div> : <div className="chart-empty">当前范围内没有项目活动</div>}</article>
    </>}
  </section>;
}

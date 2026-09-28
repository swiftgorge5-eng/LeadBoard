import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ContributorLeaderboardResponse, GroupsResponse, OrganizationSummaryResponse, RepositoryStatsResponse, SyncStatus, ActivityTrendResponse } from "@leadboard/contracts";
import type { LeadBoardApiClient } from "../api/client";
import { ErrorState, LoadingState } from "../components/AsyncStates";
import { useFilters } from "../state/filters";

interface DashboardData {
  summary: OrganizationSummaryResponse;
  repositories: RepositoryStatsResponse;
  leaderboard: ContributorLeaderboardResponse;
  trend: ActivityTrendResponse;
  sync: SyncStatus;
}
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: DashboardData };
const ranges = [{ value: "7d", label: "7 天" }, { value: "30d", label: "30 天" }, { value: "90d", label: "90 天" }, { value: "all", label: "全部" }] as const;
const metrics = [{ value: "total", label: "总贡献" }, { value: "commits", label: "Commits" }, { value: "prs", label: "Pull requests" }, { value: "issues", label: "Issues" }] as const;
const format = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "尚未同步";

export function DashboardPage({ api, isMock = false }: { api: LeadBoardApiClient; isMock?: boolean }) {
  const { range, setRange, group, setGroup, metric, setMetric } = useFilters();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [availableGroups, setAvailableGroups] = useState<GroupsResponse["items"]>([]);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    setLoad({ status: "loading" });
    void Promise.all([
      api.getOrganizationSummary(range), api.getRepositories(range, group), api.getGroups(),
      api.getContributorLeaderboard({ range, metric, ...(group ? { group } : {}), limit: 100 }),
      api.getActivityTrend(range, group), api.getSyncStatus(),
    ]).then(([summary, repositories, groups, leaderboard, trend, sync]) => {
      if (active) {
        setAvailableGroups(groups.items);
        setLoad({ status: "ready", data: { summary, repositories, leaderboard, trend, sync } });
      }
    }, (error: unknown) => {
      if (active) setLoad({ status: "error", message: error instanceof Error ? error.message : "数据加载失败" });
    });
    return () => { active = false; };
  }, [api, range, group, metric, retry]);

  const data = load.status === "ready" ? load.data : null;
  const filtered = data?.leaderboard.items.filter((item) => item.login.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  const podium = filtered.slice(0, 3);
  const peak = Math.max(1, ...(data?.trend.items.map((item) => item.total) ?? []));

  return <>
    <section className="dashboard-top">
      <div className="top-copy"><p className="eyebrow">OPEN SOURCE CONTRIBUTIONS</p><h1>开源的每一步，<span>都有回响。</span></h1><p>真实记录代码、讨论与协作，让社区贡献一目了然。</p></div>
      <div className={`freshness freshness-${data?.sync.dataStatus ?? "missing"}`}><span className="freshness-dot" />{data?.sync.dataStatus === "fresh" ? `数据更新于 ${dateLabel(data.sync.lastSuccessfulRunAt)}` : data?.sync.dataStatus === "stale" ? `数据可能已过期 · ${dateLabel(data.sync.lastSuccessfulRunAt)}` : "等待首次 GitHub 数据同步"}</div>
    </section>
    {isMock && <div className="demo-notice">开发预览数据，仅供界面调试</div>}
    <section className="leaderboard-panel" aria-label="贡献者排行榜">
      <div className="leaderboard-heading"><div><p className="eyebrow">THE LEADERBOARD</p><h2>贡献者排名</h2></div><div className="range-switch" aria-label="时间范围">{ranges.map((item) => <button key={item.value} className={range === item.value ? "selected" : ""} onClick={() => setRange(item.value)}>{item.label}</button>)}</div></div>
      <div className="toolbar"><div className="metric-switch" aria-label="排名指标">{metrics.map((item) => <button key={item.value} className={metric === item.value ? "selected" : ""} onClick={() => setMetric(item.value)}>{item.label}</button>)}</div><div className="toolbar-right"><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="搜索贡献者" placeholder="搜索贡献者" value={search} onChange={(event) => setSearch(event.target.value)} /></label>{availableGroups.length > 1 && <select aria-label="选择分组" value={group ?? ""} onChange={(event) => setGroup(event.target.value || undefined)}><option value="">全部分组</option>{availableGroups.map((item) => <option key={item.name} value={item.name}>{item.label ?? item.name}</option>)}</select>}</div></div>
      {load.status === "loading" && <LoadingState label="正在读取最新排名…" />}
      {load.status === "error" && <ErrorState message={load.message} onRetry={() => setRetry((value) => value + 1)} />}
      {data && filtered.length === 0 && <div className="empty-ranking"><div className="empty-icon">↗</div><h3>{search ? "没有找到这位贡献者" : data.sync.dataStatus === "missing" ? "排行榜正在等候首次同步" : "这个时间范围内还没有活动"}</h3><p>{data.sync.dataStatus === "missing" ? "完成 GitHub 授权后，这里会展示受关注仓库的实时贡献排名。" : "试试切换时间范围或分组。"}</p></div>}
      {data && filtered.length > 0 && <>
        {podium.length > 0 && <div className="podium">{podium.map((person, index) => <Link to={`/contributors/${encodeURIComponent(person.login)}`} className={`podium-card place-${index + 1}`} key={person.login}><div className="podium-rank">{index === 0 ? "01" : `0${index + 1}`}</div>{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <div className="avatar-fallback">{person.login.slice(0, 1).toUpperCase()}</div>}<strong>{person.login}</strong><span>{format(person.total)} 次贡献</span><i>{index === 0 ? "✦" : index === 1 ? "✧" : "·"}</i></Link>)}</div>}
        <div className="ranking-table-wrap"><table className="ranking-table"><thead><tr><th>排名</th><th>贡献者</th><th>Commits</th><th>PR</th><th>Issues</th><th>活跃天数</th><th className="numeric">总贡献</th></tr></thead><tbody>{filtered.map((person) => <tr key={person.login}><td className="rank-number">{String(person.rank).padStart(2, "0")}</td><td><Link className="contributor-link" to={`/contributors/${encodeURIComponent(person.login)}`}>{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <span className="avatar-fallback small">{person.login.slice(0, 1).toUpperCase()}</span>}<strong>{person.login}</strong><span className="row-arrow">↗</span></Link></td><td>{format(person.commits)}</td><td>{format(person.prs)}</td><td>{format(person.issues)}</td><td>{person.activeDays ?? "—"}</td><td className="numeric total-cell">{format(person.total)}</td></tr>)}</tbody></table></div>
      </>}
    </section>
    <section className="overview-grid"><article className="overview-card trend-card"><div className="card-heading"><div><p className="eyebrow">COMMUNITY PULSE</p><h2>活动趋势</h2></div>{data && <strong>{format(data.summary.total)}<small> 次活动</small></strong>}</div>{data && data.trend.items.length > 0 ? <div className="trend-chart" role="img" aria-label="每日贡献活动趋势">{data.trend.items.slice(-30).map((point) => <div key={point.date} title={`${point.date} · ${format(point.total)} 次`} style={{ height: `${Math.max(4, point.total / peak * 100)}%` }} />)}</div> : <div className="chart-empty">{data?.sync.dataStatus === "missing" ? "首次同步后显示社区活动趋势" : "当前范围暂无趋势数据"}</div>}<div className="chart-axis"><span>{data?.trend.items.at(-30)?.date ?? ""}</span><span>{data?.trend.items.at(-1)?.date ?? ""}</span></div></article>
      <article className="overview-card"><div className="card-heading"><div><p className="eyebrow">PROJECTS</p><h2>活跃项目</h2></div><span className="repo-count">{data ? format(data.summary.repositories) : "—"} 个仓库</span></div><div className="repo-list">{data?.repositories.items.slice(0, 6).map((repo) => <a key={repo.githubId} href={`https://github.com/${repo.fullName}`} target="_blank" rel="noreferrer"><span><strong>{repo.fullName}</strong><small>{repo.group}</small></span><b>{format(repo.total)}</b></a>)}{data?.repositories.items.length === 0 && <div className="chart-empty">同步后展示 Linux 等受关注项目</div>}</div></article></section>
    <section className="stat-strip"><div><strong>{data ? format(data.summary.contributors) : "—"}</strong><span>贡献者</span></div><div><strong>{data ? format(data.summary.repositories) : "—"}</strong><span>追踪仓库</span></div><div><strong>{data ? format(data.summary.commits) : "—"}</strong><span>Commits</span></div><div><strong>{data ? format(data.summary.prs) : "—"}</strong><span>Pull requests</span></div><div><strong>{data ? format(data.summary.issues) : "—"}</strong><span>Issues</span></div></section>
  </>;
}

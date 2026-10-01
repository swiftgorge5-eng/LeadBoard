import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router";
import type { LeadBoardApiClient } from "./api/client";
import { ContributorDetailPage } from "./pages/ContributorDetailPage";
import { ContributorLeaderboardPage } from "./pages/ContributorLeaderboardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { IdentityVerificationPage } from "./pages/IdentityVerificationPage";
import { fetchHealth } from "./health";

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

export function App({ api, isMock = false }: { api: LeadBoardApiClient; isMock?: boolean }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void fetchHealth(controller.signal).then(
      (health) => setStatus(health.status),
      () => { if (!controller.signal.aborted) setStatus("error"); },
    );
    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard" aria-label="LeadBoard 首页">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span className="brand-copy">
            <strong>LeadBoard</strong>
            <small>复旦开源贡献可视化</small>
          </span>
        </Link>

        <nav className="topnav" aria-label="主导航">
          <NavLink className={navClass} to="/dashboard">数据概览</NavLink>
          <NavLink className={navClass} to="/contributors">贡献者</NavLink>
          <NavLink className={navClass} to="/join">加入贡献榜</NavLink>
        </nav>

        <span className={`service-pill service-${status}`} role="status">
          <span className="service-dot" aria-hidden="true" />
          {status === "loading" ? "连接中" : status === "ok" ? "服务正常" : "服务异常"}
        </span>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="侧边导航">
          <div className="side-section">
            <p className="side-label">数据</p>
            <NavLink className={navClass} to="/dashboard"><span aria-hidden="true">⌂</span> 总览</NavLink>
          </div>
          <div className="side-section">
            <p className="side-label">贡献者</p>
            <NavLink className={navClass} to="/contributors"><span aria-hidden="true">🏆</span> 贡献者榜单</NavLink>
          </div>
          <div className="side-section">
            <p className="side-label">社区</p>
            <NavLink className={navClass} to="/join"><span aria-hidden="true">✦</span> 加入贡献榜</NavLink>
            <a className="nav-link" href="https://github.com/swiftgorge5-eng/LeadBoard" target="_blank" rel="noreferrer">
              <span aria-hidden="true">↗</span> 项目仓库
            </a>
          </div>
          <div className="side-spacer" />
          <div className="side-card">
            <span className="side-card-kicker">LEADBOARD</span>
            <strong>让每一份微小贡献都被看见。</strong>
            <p>基于真实 GitHub 活动持续更新。</p>
          </div>
        </aside>

        <div className="content-shell">
          <Routes>
            <Route path="/" element={<DashboardPage api={api} isMock={isMock} />} />
            <Route path="/dashboard" element={<DashboardPage api={api} isMock={isMock} />} />
            <Route path="/contributors" element={<ContributorLeaderboardPage api={api} />} />
            <Route path="/contributors/:username" element={<ContributorDetailPage api={api} />} />
            <Route path="/join" element={<IdentityVerificationPage />} />
            <Route path="*" element={<section className="not-found"><h1>页面不存在</h1><Link to="/dashboard">返回数据概览</Link></section>} />
          </Routes>

          <footer>
            <span>LeadBoard · Fudan Open Source</span>
            <span>数据来自公开 GitHub 活动</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

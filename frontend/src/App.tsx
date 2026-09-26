import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router";
import type { LeadBoardApiClient } from "./api/client";
import { DashboardPage } from "./pages/DashboardPage";
import { fetchHealth } from "./health";

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
    <main>
      <header className="site-header">
        <Link className="wordmark" to="/dashboard">LeadBoard<span>↗</span></Link>
        <span className={`status status-${status}`} role="status">
          <span aria-hidden="true" className="dot" />
          {status === "loading" ? "正在检查后端…" : status === "ok" ? "后端已连接" : "后端暂未连接"}
        </span>
      </header>

      <Routes>
        <Route path="/" element={<DashboardPage api={api} isMock={isMock} />} />
        <Route path="/dashboard" element={<DashboardPage api={api} isMock={isMock} />} />
        <Route path="*" element={<section className="not-found"><h1>页面不存在</h1><Link to="/dashboard">返回 Dashboard</Link></section>} />
      </Routes>

      <footer><span>LeadBoard · 开源贡献统计</span><span>以真实活动为起点</span></footer>
    </main>
  );
}

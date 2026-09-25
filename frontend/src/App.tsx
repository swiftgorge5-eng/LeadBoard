import { useEffect, useState } from "react";
import { fetchHealth } from "./health";

export function App() {
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
      <header><a className="wordmark" href="/">LeadBoard<span>↗</span></a><span>PHASE 01</span></header>
      <section className="intro" aria-labelledby="title">
        <p className="eyebrow">OPEN SOURCE, IN VIEW</p>
        <h1 id="title">让每一份开源贡献<br />清晰可见。</h1>
        <p className="description">记录真实的 GitHub 活动，连接项目与贡献者。<br />LeadBoard 正在搭建，贡献榜单即将到来。</p>
        <div className={`status ${status}`} role="status">
          <span aria-hidden="true" className="dot" />
          {status === "loading" ? "正在检查服务连接…" : status === "ok" ? "后端服务已连接" : "暂未连接后端，请启动后端后刷新页面"}
        </div>
      </section>
      <section className="roadmap" aria-label="建设进度">
        <article><span className="step">01 / 已就绪</span><h2>工程基础</h2><p>共享接口与前后端运行环境。</p></article>
        <article><span className="step">02 / 待建设</span><h2>活动采集</h2><p>仓库、Commit、PR 与 Issue。</p></article>
        <article><span className="step">03 / 待建设</span><h2>贡献榜单</h2><p>贡献者、项目活动与数据新鲜度。</p></article>
      </section>
      <footer><span>LeadBoard · 开源贡献统计</span><span>以真实活动为起点</span></footer>
    </main>
  );
}

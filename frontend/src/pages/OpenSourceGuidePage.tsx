import { Link } from "react-router";

const steps = [
  {
    number: "01",
    title: "从一个真实问题开始",
    text: "别先问“我能做什么大项目”，先找一个你愿意连续使用、修复或维护的东西。一个清楚的小问题，比空泛的大愿景更容易产生第一笔贡献。",
  },
  {
    number: "02",
    title: "先读，再改",
    text: "花十分钟看 README、CONTRIBUTING、最近 Issue 和 PR。确认项目的语言、测试方式、代码风格和维护节奏，再动手会快很多。",
  },
  {
    number: "03",
    title: "让改动尽量小而完整",
    text: "第一次贡献最好做到“一件事、一个 PR、可验证”。修一个文档错误、补一个测试、解决一个边界情况，都是很好的开始。",
  },
  {
    number: "04",
    title: "把沟通也当作贡献",
    text: "描述问题、复现 Bug、补充上下文、认真回应 Review，本身就是开源协作的一部分。代码不是唯一的贡献形式。",
  },
] as const;

export function OpenSourceGuidePage() {
  return (
    <div className="page-canvas">
      <section className="page-hero guide-hero">
        <div>
          <span className="hero-badge">OPEN SOURCE · START HERE</span>
          <h1>第一次做开源，别把它想得太重。</h1>
          <p>从一个能完成的小贡献开始。LeadBoard 记录结果，但更希望你在过程中学会真实的协作方式。</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/projects">去逛校内项目</Link>
            <Link className="button button-secondary" to="/contributors">看看大家在做什么</Link>
          </div>
        </div>
      </section>

      <section className="dashboard-content guide-layout">
        <div className="guide-steps">
          {steps.map((step) => (
            <article className="guide-step-card" key={step.number}>
              <span className="guide-step-number">{step.number}</span>
              <div>
                <h2>{step.title}</h2>
                <p>{step.text}</p>
              </div>
            </article>
          ))}
        </div>

        <aside className="guide-aside">
          <section className="panel guide-checklist">
            <p className="section-kicker">BEFORE YOUR FIRST PR</p>
            <h2>提交前自查</h2>
            <ul>
              <li>Issue / PR 里把问题说清楚。</li>
              <li>只修改和目标相关的文件。</li>
              <li>能跑的测试尽量都跑一遍。</li>
              <li>说明你改了什么、为什么这样改。</li>
              <li>Review 有意见时，先理解再修改。</li>
            </ul>
          </section>
          <section className="guide-note">
            <span aria-hidden="true">✦</span>
            <div>
              <strong>一个小彩蛋</strong>
              <p>收藏你感兴趣的项目和贡献者。它们只存在你的浏览器里，不上传服务器。</p>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

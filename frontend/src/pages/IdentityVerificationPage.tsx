import { useEffect, useState, type FormEvent } from "react";
import {
  ApiErrorResponseSchema,
  EmailCodeSendResponseSchema,
  EmailCodeVerifyResponseSchema,
} from "@leadboard/contracts";

type Notice = { tone: "info" | "success" | "error"; text: string } | null;

async function postJson<T>(
  path: string,
  body: unknown,
  schema: { parse(value: unknown): T },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("NETWORK_ERROR");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(payload);
    throw new Error(parsed.success ? parsed.data.error.code : "HTTP_ERROR");
  }
  return schema.parse(payload);
}

function messageFor(code: string): string {
  switch (code) {
    case "INVALID_EMAIL":
    case "INVALID_FUDAN_EMAIL":
      return "请输入有效的复旦邮箱。";
    case "EMAIL_RESEND_TOO_SOON":
      return "发送得太快了，请稍后再试。";
    case "EMAIL_RATE_LIMITED":
    case "IP_RATE_LIMITED":
      return "请求次数过多，请稍后再试。";
    case "INVALID_VERIFICATION_CODE":
      return "验证码不正确。";
    case "VERIFICATION_CODE_EXPIRED":
      return "验证码已过期，请重新获取。";
    case "VERIFICATION_CODE_USED":
      return "这个验证码已经使用过，请重新获取。";
    case "VERIFICATION_ATTEMPTS_EXCEEDED":
      return "验证码尝试次数过多，请重新获取。";
    case "EMAIL_AUTH_NOT_CONFIGURED":
      return "邮件服务尚未配置。验证系统已经就绪，配置发信邮箱后即可使用。";
    case "EMAIL_DELIVERY_FAILED":
      return "验证码邮件暂时无法发送，请稍后再试。";
    case "NETWORK_ERROR":
      return "暂时无法连接服务器，请检查网络后重试。";
    default:
      return "操作失败，请稍后再试。";
  }
}

export function IdentityVerificationPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    if (busy || cooldown > 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await postJson(
        "/api/v1/auth/email/send-code",
        { email },
        EmailCodeSendResponseSchema,
      );
      setSent(true);
      setCooldown(result.retryAfterSeconds);
      setNotice({ tone: "success", text: "验证码已发送，请检查邮箱。验证码 10 分钟内有效。" });
    } catch (error) {
      setNotice({ tone: "error", text: messageFor(error instanceof Error ? error.message : "UNKNOWN") });
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await postJson(
        "/api/v1/auth/email/verify",
        { email, code },
        EmailCodeVerifyResponseSchema,
      );
      setVerified(true);
      setNotice({ tone: "success", text: "复旦身份验证成功。GitHub 账号绑定将在下一阶段开放。" });
    } catch (error) {
      setNotice({ tone: "error", text: messageFor(error instanceof Error ? error.message : "UNKNOWN") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-canvas">
      <section className="join-hero">
        <div className="join-copy">
          <span className="hero-badge">FUDAN IDENTITY</span>
          <h1>把你的开源贡献<br />带回校园。</h1>
          <p>验证复旦邮箱后，你的身份可以用于后续 GitHub 账号绑定与贡献归属。</p>
          <div className="join-steps" aria-label="加入贡献榜步骤">
            <div className="join-step join-step-active"><span>1</span><div><strong>验证邮箱</strong><small>确认复旦身份</small></div></div>
            <div className="join-step"><span>2</span><div><strong>绑定 GitHub</strong><small>下一阶段开放</small></div></div>
            <div className="join-step"><span>3</span><div><strong>进入贡献榜</strong><small>持续记录开源成长</small></div></div>
          </div>
          <div className="privacy-card">
            <span className="privacy-icon" aria-hidden="true">◇</span>
            <div><strong>隐私设计</strong><p>我们只保存不可逆的邮箱指纹，不把完整邮箱作为排行榜身份长期保存。</p></div>
          </div>
        </div>

        <div className="verify-card">
          <div className="verify-card-head">
            <span className="verify-icon" aria-hidden="true">✦</span>
            <div><p>加入 LeadBoard</p><h2>{verified ? "身份验证完成" : sent ? "输入邮箱验证码" : "验证复旦邮箱"}</h2></div>
          </div>

          {verified ? (
            <div className="verified-state" role="status">
              <span className="verified-mark" aria-hidden="true">✓</span>
              <h2>验证完成</h2>
              <p>这个复旦身份已经可以用于后续 GitHub 账号绑定。</p>
              <div className="success-band">欢迎加入 LeadBoard · 下一步功能即将开放</div>
            </div>
          ) : (
            <>
              <form onSubmit={sendCode}>
                <label className="form-field">
                  <span>复旦邮箱</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@fudan.edu.cn"
                    autoComplete="email"
                    required
                    disabled={busy || sent}
                  />
                  <small>支持 fudan.edu.cn 及其子域邮箱</small>
                </label>
                <button className="primary-button" type="submit" disabled={busy || cooldown > 0 || sent}>
                  {busy && !sent ? "正在发送…" : cooldown > 0 ? `${cooldown} 秒后可重发` : sent ? "验证码已发送" : "发送验证码"}
                </button>
              </form>

              {sent && (
                <form className="verification-form" onSubmit={verify}>
                  <label className="form-field">
                    <span>6 位验证码</span>
                    <input
                      className="code-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      required
                      autoFocus
                    />
                    <small>验证码 10 分钟内有效</small>
                  </label>
                  <button className="primary-button" type="submit" disabled={busy || code.length !== 6}>
                    {busy ? "正在验证…" : "验证身份"}
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy || cooldown > 0}
                    onClick={() => {
                      setSent(false);
                      setCode("");
                      setNotice(null);
                    }}
                  >
                    {cooldown > 0 ? `${cooldown} 秒后可重新发送` : "更换邮箱 / 重新发送"}
                  </button>
                </form>
              )}

              {notice && (
                <p className={`verify-notice verify-notice-${notice.tone}`} role="status">
                  {notice.text}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

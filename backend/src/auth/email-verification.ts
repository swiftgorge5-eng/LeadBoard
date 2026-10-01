import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { getDbPool, withTransaction } from "../db/index.js";

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const EMAIL_HOURLY_LIMIT = 5;
const IP_HOURLY_LIMIT = 20;
const MAX_ATTEMPTS = 5;

export interface VerificationEmailSender {
  sendVerificationCode(input: {
    to: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<void>;
}

export interface EmailVerificationApi {
  sendCode(email: string, requesterIp: string): Promise<{
    sent: true;
    retryAfterSeconds: number;
    expiresInSeconds: number;
  }>;
  verifyCode(email: string, code: string): Promise<{ verified: true; memberId: string }>;
}

export class EmailAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "EmailAuthError";
  }
}

export class UnavailableEmailVerificationApi implements EmailVerificationApi {
  async sendCode(): Promise<never> {
    throw new EmailAuthError("EMAIL_AUTH_NOT_CONFIGURED", 503, "邮箱验证服务尚未配置");
  }

  async verifyCode(): Promise<never> {
    throw new EmailAuthError("EMAIL_AUTH_NOT_CONFIGURED", 503, "邮箱验证服务尚未配置");
  }
}

export interface EmailVerificationOptions {
  sender: VerificationEmailSender;
  hmacSecret: string;
  allowedDomains: string[];
  now?: () => Date;
  generateCode?: () => string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

function isAllowedDomain(domain: string, allowedDomains: string[]): boolean {
  return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

function hmacFingerprint(secret: string, prefix: string, value: string): string {
  return createHmac("sha256", secret).update(`${prefix}:${value}`).digest("hex");
}

function hashCode(code: string, salt: string): Buffer {
  return scryptSync(code, salt, 32);
}

function safeCodeMatches(code: string, salt: string, expectedHex: string): boolean {
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  const actual = hashCode(code, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function lockFingerprint(client: PoolClient, fingerprint: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [fingerprint]);
}

export class EmailVerificationService implements EmailVerificationApi {
  private readonly now: () => Date;
  private readonly generateCode: () => string;
  private readonly domains: string[];

  constructor(private readonly options: EmailVerificationOptions) {
    if (options.hmacSecret.length < 32) {
      throw new Error("EMAIL_HMAC_SECRET must be at least 32 characters");
    }
    this.domains = options.allowedDomains.map((domain) => domain.trim().toLowerCase()).filter(Boolean);
    if (this.domains.length === 0) throw new Error("At least one Fudan email domain is required");
    this.now = options.now ?? (() => new Date());
    this.generateCode = options.generateCode ?? (() => String(randomInt(0, 1_000_000)).padStart(6, "0"));
  }

  async sendCode(rawEmail: string, requesterIp: string): Promise<{
    sent: true;
    retryAfterSeconds: number;
    expiresInSeconds: number;
  }> {
    const email = normalizeEmail(rawEmail);
    const domain = emailDomain(email);
    if (!email.includes("@") || !isAllowedDomain(domain, this.domains)) {
      throw new EmailAuthError("INVALID_FUDAN_EMAIL", 400, "请输入有效的复旦邮箱");
    }

    const now = this.now();
    const fingerprint = hmacFingerprint(this.options.hmacSecret, "email", email);
    const ipFingerprint = hmacFingerprint(this.options.hmacSecret, "ip", requesterIp || "unknown");
    const hourStart = new Date(now.getTime() - 60 * 60_000);
    const code = this.generateCode();
    if (!/^\d{6}$/.test(code)) throw new Error("Verification code generator must return six digits");
    const salt = randomBytes(16).toString("hex");
    const codeHash = hashCode(code, salt).toString("hex");
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

    const challengeId = await withTransaction(async (client) => {
      await lockFingerprint(client, fingerprint);

      const latest = await client.query<{ created_at: Date }>(
        `SELECT created_at
           FROM email_verification_challenges
          WHERE email_fingerprint=$1
            AND delivery_status IN ('pending','sent')
          ORDER BY created_at DESC
          LIMIT 1`,
        [fingerprint],
      );
      const latestAt = latest.rows[0]?.created_at;
      if (latestAt && now.getTime() - latestAt.getTime() < RESEND_COOLDOWN_MS) {
        const seconds = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - (now.getTime() - latestAt.getTime())) / 1000));
        throw new EmailAuthError("EMAIL_RESEND_TOO_SOON", 429, `请在 ${seconds} 秒后重新发送`);
      }

      const emailCount = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM email_verification_challenges
          WHERE email_fingerprint=$1
            AND created_at >= $2
            AND delivery_status IN ('pending','sent')`,
        [fingerprint, hourStart],
      );
      if ((emailCount.rows[0]?.count ?? 0) >= EMAIL_HOURLY_LIMIT) {
        throw new EmailAuthError("EMAIL_RATE_LIMITED", 429, "该邮箱发送过于频繁，请稍后再试");
      }

      const ipCount = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM email_verification_challenges
          WHERE requester_ip_fingerprint=$1
            AND created_at >= $2
            AND delivery_status IN ('pending','sent')`,
        [ipFingerprint, hourStart],
      );
      if ((ipCount.rows[0]?.count ?? 0) >= IP_HOURLY_LIMIT) {
        throw new EmailAuthError("IP_RATE_LIMITED", 429, "请求过于频繁，请稍后再试");
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO email_verification_challenges
           (email_fingerprint, email_domain, requester_ip_fingerprint, code_hash, code_salt,
            expires_at, attempt_count, delivery_status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,0,'pending',$7)
         RETURNING id::text`,
        [fingerprint, domain, ipFingerprint, codeHash, salt, expiresAt, now],
      );
      return inserted.rows[0]!.id;
    });

    try {
      await this.options.sender.sendVerificationCode({ to: email, code, expiresInMinutes: 10 });
      await getDbPool().query(
        "UPDATE email_verification_challenges SET delivery_status='sent', sent_at=$2 WHERE id=$1",
        [challengeId, this.now()],
      );
    } catch {
      await getDbPool().query(
        "UPDATE email_verification_challenges SET delivery_status='failed' WHERE id=$1",
        [challengeId],
      ).catch(() => undefined);
      throw new EmailAuthError("EMAIL_DELIVERY_FAILED", 503, "验证码邮件暂时无法发送，请稍后再试");
    }

    return { sent: true, retryAfterSeconds: 60, expiresInSeconds: 600 };
  }

  async verifyCode(rawEmail: string, code: string): Promise<{ verified: true; memberId: string }> {
    const email = normalizeEmail(rawEmail);
    const domain = emailDomain(email);
    if (!email.includes("@") || !isAllowedDomain(domain, this.domains)) {
      throw new EmailAuthError("INVALID_FUDAN_EMAIL", 400, "请输入有效的复旦邮箱");
    }
    if (!/^\d{6}$/.test(code)) {
      throw new EmailAuthError("INVALID_VERIFICATION_CODE", 400, "请输入 6 位数字验证码");
    }

    const now = this.now();
    const fingerprint = hmacFingerprint(this.options.hmacSecret, "email", email);

    const result = await withTransaction(async (client) => {
      await lockFingerprint(client, fingerprint);
      const found = await client.query<{
        id: string;
        code_hash: string;
        code_salt: string;
        expires_at: Date;
        attempt_count: number;
        used_at: Date | null;
      }>(
        `SELECT id::text, code_hash, code_salt, expires_at, attempt_count, used_at
           FROM email_verification_challenges
          WHERE email_fingerprint=$1
            AND delivery_status IN ('pending','sent')
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [fingerprint],
      );
      const challenge = found.rows[0];
      if (!challenge) return { kind: "invalid" as const };
      if (challenge.used_at) return { kind: "used" as const };
      if (challenge.expires_at.getTime() <= now.getTime()) return { kind: "expired" as const };
      if (challenge.attempt_count >= MAX_ATTEMPTS) return { kind: "locked" as const };

      if (!safeCodeMatches(code, challenge.code_salt, challenge.code_hash)) {
        const nextAttempts = challenge.attempt_count + 1;
        await client.query(
          "UPDATE email_verification_challenges SET attempt_count=$2 WHERE id=$1",
          [challenge.id, nextAttempts],
        );
        return { kind: nextAttempts >= MAX_ATTEMPTS ? "locked" as const : "invalid" as const };
      }

      await client.query(
        "UPDATE email_verification_challenges SET used_at=$2 WHERE id=$1",
        [challenge.id, now],
      );
      const member = await client.query<{ id: string }>(
        `INSERT INTO members
           (email_fingerprint, email_domain, verification_status, verified_at, last_reverified_at, created_at, updated_at)
         VALUES ($1,$2,'verified',$3,$3,$3,$3)
         ON CONFLICT (email_fingerprint) DO UPDATE SET
           email_domain=EXCLUDED.email_domain,
           verification_status='verified',
           verified_at=COALESCE(members.verified_at, EXCLUDED.verified_at),
           last_reverified_at=EXCLUDED.last_reverified_at,
           updated_at=EXCLUDED.updated_at
         RETURNING id::text`,
        [fingerprint, domain, now],
      );
      return { kind: "verified" as const, memberId: member.rows[0]!.id };
    });

    switch (result.kind) {
      case "verified": return { verified: true, memberId: result.memberId };
      case "used": throw new EmailAuthError("VERIFICATION_CODE_USED", 400, "该验证码已使用，请重新获取");
      case "expired": throw new EmailAuthError("VERIFICATION_CODE_EXPIRED", 400, "验证码已过期，请重新获取");
      case "locked": throw new EmailAuthError("VERIFICATION_ATTEMPTS_EXCEEDED", 429, "验证码尝试次数过多，请重新获取");
      default: throw new EmailAuthError("INVALID_VERIFICATION_CODE", 400, "验证码错误");
    }
  }
}

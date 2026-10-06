import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDbPool } from "../src/db/index.js";
import {
  EmailAuthError,
  EmailVerificationService,
  type VerificationEmailSender,
} from "../src/auth/index.js";

const pool = getDbPool();
let now = new Date("2026-10-01T12:00:00.000Z");
let nextCode = "123456";

class FakeSender implements VerificationEmailSender {
  sent: Array<{ to: string; code: string; expiresInMinutes: number }> = [];
  fail = false;

  async sendVerificationCode(input: { to: string; code: string; expiresInMinutes: number }): Promise<void> {
    if (this.fail) throw new Error("fixture delivery failure");
    this.sent.push(input);
  }
}

function service(sender: FakeSender) {
  return new EmailVerificationService({
    sender,
    hmacSecret: "fixture-secret-that-is-longer-than-thirty-two-characters",
    allowedDomains: ["fudan.edu.cn", "m.fudan.edu.cn"],
    now: () => new Date(now),
    generateCode: () => nextCode,
  });
}

async function expectAuthError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("Expected EmailAuthError");
  } catch (error) {
    expect(error).toBeInstanceOf(EmailAuthError);
    expect((error as EmailAuthError).code).toBe(code);
  }
}

beforeEach(async () => {
  now = new Date("2026-10-01T12:00:00.000Z");
  nextCode = "123456";
  await pool.query(
    "TRUNCATE member_github_accounts, github_accounts, email_verification_challenges, members RESTART IDENTITY CASCADE",
  );
});

afterAll(async () => {
  await pool.end();
});

describe("Fudan email verification integration", () => {
  it("stores no plaintext email/code and creates one verified member", async () => {
    const sender = new FakeSender();
    const auth = service(sender);

    await expect(auth.sendCode("Student@M.FUDAN.EDU.CN", "203.0.113.9")).resolves.toEqual({
      sent: true,
      retryAfterSeconds: 60,
      expiresInSeconds: 600,
    });
    expect(sender.sent).toEqual([{
      to: "student@m.fudan.edu.cn",
      code: "123456",
      expiresInMinutes: 10,
    }]);

    const challenge = await pool.query(
      "SELECT email_fingerprint, requester_ip_fingerprint, code_hash, code_salt, delivery_status FROM email_verification_challenges",
    );
    expect(challenge.rows[0].email_fingerprint).not.toContain("student");
    expect(challenge.rows[0].requester_ip_fingerprint).not.toContain("203.0.113.9");
    expect(challenge.rows[0].code_hash).not.toBe("123456");
    expect(challenge.rows[0].code_salt).not.toBe("");
    expect(challenge.rows[0].delivery_status).toBe("sent");

    await expect(auth.verifyCode("student@m.fudan.edu.cn", "123456"))
      .resolves.toEqual({ verified: true, memberId: "1" });

    const member = await pool.query(
      "SELECT email_domain, verification_status, count(*) OVER ()::int AS total FROM members",
    );
    expect(member.rows).toEqual([{
      email_domain: "m.fudan.edu.cn",
      verification_status: "verified",
      total: 1,
    }]);

    await expectAuthError(
      auth.verifyCode("student@m.fudan.edu.cn", "123456"),
      "VERIFICATION_CODE_USED",
    );

    now = new Date(now.getTime() + 61_000);
    nextCode = "654321";
    await auth.sendCode("student@m.fudan.edu.cn", "203.0.113.9");
    await auth.verifyCode("student@m.fudan.edu.cn", "654321");
    const count = await pool.query<{ count: string }>("SELECT count(*) AS count FROM members");
    expect(count.rows[0]?.count).toBe("1");
  });

  it("enforces resend cooldown and the five-attempt limit", async () => {
    const sender = new FakeSender();
    const auth = service(sender);
    await auth.sendCode("student@fudan.edu.cn", "203.0.113.10");

    await expectAuthError(
      auth.sendCode("student@fudan.edu.cn", "203.0.113.10"),
      "EMAIL_RESEND_TOO_SOON",
    );

    for (let attempt = 0; attempt < 4; attempt++) {
      await expectAuthError(
        auth.verifyCode("student@fudan.edu.cn", "000000"),
        "INVALID_VERIFICATION_CODE",
      );
    }
    await expectAuthError(
      auth.verifyCode("student@fudan.edu.cn", "000000"),
      "VERIFICATION_ATTEMPTS_EXCEEDED",
    );
    await expectAuthError(
      auth.verifyCode("student@fudan.edu.cn", "123456"),
      "VERIFICATION_ATTEMPTS_EXCEEDED",
    );
  });

  it("rejects expired codes and non-Fudan domains", async () => {
    const sender = new FakeSender();
    const auth = service(sender);

    await expectAuthError(
      auth.sendCode("student@example.com", "203.0.113.11"),
      "INVALID_FUDAN_EMAIL",
    );

    await auth.sendCode("student@fudan.edu.cn", "203.0.113.11");
    now = new Date(now.getTime() + 11 * 60_000);
    await expectAuthError(
      auth.verifyCode("student@fudan.edu.cn", "123456"),
      "VERIFICATION_CODE_EXPIRED",
    );
  });

  it("marks failed deliveries and allows an immediate retry", async () => {
    const sender = new FakeSender();
    const auth = service(sender);
    sender.fail = true;

    await expectAuthError(
      auth.sendCode("student@fudan.edu.cn", "203.0.113.12"),
      "EMAIL_DELIVERY_FAILED",
    );
    const failed = await pool.query("SELECT delivery_status FROM email_verification_challenges");
    expect(failed.rows[0]?.delivery_status).toBe("failed");

    sender.fail = false;
    await expect(auth.sendCode("student@fudan.edu.cn", "203.0.113.12"))
      .resolves.toMatchObject({ sent: true });
  });
});

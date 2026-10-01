import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import request from "supertest";
import { Router } from "express";
import { HealthResponseSchema, ApiErrorResponseSchema } from "@leadboard/contracts";
import { createApp } from "../src/app.js";

it("GET /health returns 200 and the shared contract without external services", async () => {
  const response = await request(createApp()).get("/health").expect(200).expect("Content-Type", /json/);
  expect(HealthResponseSchema.parse(response.body)).toEqual({ status: "ok" });
  expect(response.headers["x-powered-by"]).toBeUndefined();
});

it("unknown non-HTML routes return a structured error", async () => {
  const response = await request(createApp()).get("/missing").set("Accept", "application/json").expect(404);
  expect(ApiErrorResponseSchema.parse(response.body).error.code).toBe("NOT_FOUND");
});

it("serves the built frontend and SPA history routes without swallowing API 404s", async () => {
  const staticDir = await mkdtemp(join(tmpdir(), "leadboard-static-"));
  try {
    await writeFile(join(staticDir, "index.html"), "<!doctype html><title>LeadBoard fixture</title>");
    await writeFile(join(staticDir, "asset.txt"), "static-ok");
    const app = createApp({ staticDir });

    await request(app).get("/asset.txt").expect(200, "static-ok");
    await request(app).get("/join").set("Accept", "text/html").expect(200)
      .expect((response) => expect(response.text).toContain("LeadBoard fixture"));
    await request(app).get("/api/v1/missing").set("Accept", "text/html").expect(404)
      .expect("Content-Type", /json/);
  } finally {
    await rm(staticDir, { recursive: true, force: true });
  }
});

it("mounts future business routes before the 404 handler", async () => {
  const apiRouter = Router();
  apiRouter.get("/groups", (_req, res) => res.json({ items: [] }));
  const app = createApp({ apiRouter });
  await request(app).get("/api/v1/groups").expect(200, { items: [] });
  await request(app).get("/health").expect(200, { status: "ok" });
  await request(app).get("/api/v1/missing").expect(404);
});

it("returns a secret-safe JSON error for rejected business handlers", async () => {
  const apiRouter = Router();
  apiRouter.get("/broken", async () => { throw new Error("credential-must-not-leak"); });
  const response = await request(createApp({ apiRouter })).get("/api/v1/broken").expect(500).expect("Content-Type", /json/);
  expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Request failed" } });
  expect(response.text).not.toContain("credential-must-not-leak");
});

import { expect, it } from "vitest";
import request from "supertest";
import { HealthResponseSchema, ApiErrorResponseSchema } from "@leadboard/contracts";
import { createApp } from "../src/app.js";

it("GET /health returns 200 and the shared contract without external services", async () => {
  const response = await request(createApp()).get("/health").expect(200).expect("Content-Type", /json/);
  expect(HealthResponseSchema.parse(response.body)).toEqual({ status: "ok" });
  expect(response.headers["x-powered-by"]).toBeUndefined();
});
it("unknown routes return a structured error", async () => {
  const response = await request(createApp()).get("/missing").expect(404);
  expect(ApiErrorResponseSchema.parse(response.body).error.code).toBe("NOT_FOUND");
});

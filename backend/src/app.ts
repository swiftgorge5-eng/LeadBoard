import express from "express";
import { HealthResponseSchema, type ApiErrorResponse } from "@leadboard/contracts";

/** Factory stays independent of env, ports and future DB/GitHub services. */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => {
    res.status(200).json(HealthResponseSchema.parse({ status: "ok" }));
  });
  app.use((_req, res) => {
    const body: ApiErrorResponse = {
      error: { code: "NOT_FOUND", message: "Endpoint not found" },
    };
    res.status(404).json(body);
  });
  return app;
}

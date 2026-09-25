import express, { type Router, type ErrorRequestHandler } from "express";
import { HealthResponseSchema, type ApiErrorResponse } from "@leadboard/contracts";

/** Factory stays independent of env, ports and future DB/GitHub services. */
export function createApp(options: { apiRouter?: Router } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => {
    res.status(200).json(HealthResponseSchema.parse({ status: "ok" }));
  });
  if (options.apiRouter) app.use("/api/v1", options.apiRouter);
  app.use((_req, res) => {
    const body: ApiErrorResponse = {
      error: { code: "NOT_FOUND", message: "Endpoint not found" },
    };
    res.status(404).json(body);
  });
  const handleError: ErrorRequestHandler = (_error, _req, res, next) => {
    if (res.headersSent) { next(_error); return; }
    const body: ApiErrorResponse = {
      error: { code: "INTERNAL_ERROR", message: "Request failed" },
    };
    res.status(500).json(body);
  };
  app.use(handleError);
  return app;
}

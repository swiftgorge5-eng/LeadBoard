import express, { type Router, type ErrorRequestHandler } from "express";
import { HealthResponseSchema, type ApiErrorResponse } from "@leadboard/contracts";

/** Factory stays independent of env, ports and future DB/GitHub services. */
export function createApp(options: { apiRouter?: Router } = {}) {
  const app = express();
  app.disable("x-powered-by");
  // Production nginx connects over loopback, so only loopback proxies may supply X-Forwarded-For.
  app.set("trust proxy", "loopback");
  app.use(express.json({ limit: "16kb" }));
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
  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) { next(error); return; }
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 500;
    if (status === 400 || status === 413) {
      const body: ApiErrorResponse = {
        error: { code: "INVALID_REQUEST", message: status === 413 ? "Request body is too large" : "Invalid request body" },
      };
      res.status(status).json(body);
      return;
    }
    const body: ApiErrorResponse = {
      error: { code: "INTERNAL_ERROR", message: "Request failed" },
    };
    res.status(500).json(body);
  };
  app.use(handleError);
  return app;
}

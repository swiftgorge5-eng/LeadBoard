import express, { type Router, type ErrorRequestHandler } from "express";
import { resolve } from "node:path";
import { HealthResponseSchema, type ApiErrorResponse } from "@leadboard/contracts";

/** HTTP application factory, independent of ports and process lifecycle. */
export function createApp(options: { apiRouter?: Router; staticDir?: string } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => res.status(200).json(HealthResponseSchema.parse({ status: "ok" })));
  if (options.apiRouter) app.use("/api/v1", options.apiRouter);
  const staticDir = options.staticDir ?? resolve(process.cwd(), "frontend/dist");
  app.use(express.static(staticDir, { index: false, maxAge: "1h", immutable: false }));
  app.get("*splat", (req, res, next) => {
    if (req.path.startsWith("/api/") || !req.accepts("html")) return next();
    return res.sendFile(resolve(staticDir, "index.html"), (error) => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") return next();
      if (error) next(error);
    });
  });
  app.use((_req, res) => {
    const body: ApiErrorResponse = { error: { code: "NOT_FOUND", message: "Endpoint not found" } };
    res.status(404).json(body);
  });
  const handleError: ErrorRequestHandler = (_error, _req, res, next) => {
    if (res.headersSent) { next(_error); return; }
    const body: ApiErrorResponse = { error: { code: "INTERNAL_ERROR", message: "Request failed" } };
    res.status(500).json(body);
  };
  app.use(handleError);
  return app;
}

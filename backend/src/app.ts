import express, { type Router, type ErrorRequestHandler } from "express";
import { resolve } from "node:path";
import { HealthResponseSchema, type ApiErrorResponse } from "@leadboard/contracts";

/** HTTP application factory, independent of ports and process lifecycle. */
export function createApp(options: { apiRouter?: Router; staticDir?: string } = {}) {
  const app = express();
  app.disable("x-powered-by");
  // Production nginx connects over loopback, so only loopback proxies may supply X-Forwarded-For.
  app.set("trust proxy", "loopback");
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json(HealthResponseSchema.parse({ status: "ok" }));
  });

  if (options.apiRouter) app.use("/api/v1", options.apiRouter);

  const staticDir = options.staticDir ?? resolve(process.cwd(), "frontend/dist");
  app.use(express.static(staticDir, { index: false, maxAge: "1h", immutable: false }));

  // Browser history routes render the SPA. API paths must always remain JSON endpoints.
  app.get("*splat", (req, res, next) => {
    if (req.path.startsWith("/api/") || !req.accepts("html")) return next();
    return res.sendFile(resolve(staticDir, "index.html"), (error) => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") return next();
      if (error) next(error);
    });
  });

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
        error: {
          code: "INVALID_REQUEST",
          message: status === 413 ? "Request body is too large" : "Invalid request body",
        },
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

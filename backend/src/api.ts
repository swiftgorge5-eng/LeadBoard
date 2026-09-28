import { Router } from "express";
import {
  LeaderboardQuerySchema,
  TimeRangeSchema,
  type AppConfig,
} from "@leadboard/contracts";
import type { Pool } from "pg";
import {
  getActivityTrend,
  getContributorDetail,
  getContributorLeaderboard,
  getGroups,
  getOrganizationSummary,
  getRepositoryStats,
  getSyncStatus,
} from "./analytics/index.js";

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function createApiRouter(pool: Pool, config: AppConfig, getNextRun: () => Date | null) {
  const router = Router();
  const range = (value: unknown) => TimeRangeSchema.safeParse(queryString(value) ?? "30d");
  router.get("/organization/summary", async (req, res, next) => {
    try {
      const parsed = range(req.query.range);
      if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_QUERY", message: "Invalid time range" } });
      return res.json(await getOrganizationSummary(pool, parsed.data, config.dataStaleAfterHours));
    } catch (error) { return next(error); }
  });
  router.get("/organization/repositories", async (req, res, next) => {
    try {
      const parsedRange = range(req.query.range);
      const group = queryString(req.query.group) || undefined;
      if (!parsedRange.success) return res.status(400).json({ error: { code: "INVALID_QUERY", message: "Invalid time range" } });
      return res.json(await getRepositoryStats(pool, parsedRange.data, group));
    } catch (error) { return next(error); }
  });
  router.get("/organization/trends", async (req, res, next) => {
    try {
      const parsedRange = range(req.query.range);
      const granularityValue = queryString(req.query.granularity);
      const granularity = granularityValue === "day" || granularityValue === "month" ? granularityValue : undefined;
      if (!parsedRange.success || (granularityValue && !granularity)) return res.status(400).json({ error: { code: "INVALID_QUERY", message: "Invalid trend query" } });
      return res.json(await getActivityTrend(pool, parsedRange.data, queryString(req.query.group) || undefined, granularity));
    } catch (error) { return next(error); }
  });
  router.get("/groups", async (_req, res, next) => {
    try { return res.json(await getGroups(pool)); } catch (error) { return next(error); }
  });
  router.get("/contributors/leaderboard", async (req, res, next) => {
    try {
      const limitValue = Number(queryString(req.query.limit) ?? "100");
      const parsed = LeaderboardQuerySchema.safeParse({
        range: queryString(req.query.range) ?? "30d",
        metric: queryString(req.query.metric) ?? "total",
        ...(queryString(req.query.group) ? { group: queryString(req.query.group) } : {}),
        limit: limitValue,
      });
      if (!parsed.success || parsed.data.limit > 500) return res.status(400).json({ error: { code: "INVALID_QUERY", message: "Invalid leaderboard query" } });
      return res.json(await getContributorLeaderboard(pool, {
        range: parsed.data.range, metric: parsed.data.metric,
        ...(parsed.data.group ? { group: parsed.data.group } : {}), limit: parsed.data.limit,
      }));
    } catch (error) { return next(error); }
  });
  router.get("/contributors/:username", async (req, res, next) => {
    try {
      const parsed = range(req.query.range);
      if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_QUERY", message: "Invalid time range" } });
      const detail = await getContributorDetail(pool, req.params.username!, parsed.data);
      return detail ? res.json(detail) : res.status(404).json({ error: { code: "NOT_FOUND", message: "Contributor not found" } });
    } catch (error) { return next(error); }
  });
  router.get("/sync/status", async (_req, res, next) => {
    try { return res.json(await getSyncStatus(pool, config.dataStaleAfterHours, getNextRun())); } catch (error) { return next(error); }
  });
  return router;
}

import { createApiClient, type LeadBoardApiClient } from "./client";
import { createMockApiClient } from "./mock";

export type ApiMode = "real" | "mock";

/** The caller must explicitly request mock mode; a failed real request never falls back. */
export function createFrontendApiClient(
  mode: ApiMode = "real",
  fetcher?: typeof fetch,
): LeadBoardApiClient {
  return mode === "mock" ? createMockApiClient() : createApiClient(fetcher);
}

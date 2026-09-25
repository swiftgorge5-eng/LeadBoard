import { HealthResponseSchema, type HealthResponse } from "@leadboard/contracts";

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch("/health", signal ? { signal } : {});
  if (!response.ok) throw new Error("后端暂时不可用");
  return HealthResponseSchema.parse(await response.json());
}

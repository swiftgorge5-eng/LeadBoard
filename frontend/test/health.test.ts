import { afterEach, expect, it, vi } from "vitest";
import { fetchHealth } from "../src/health";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { App } from "../src/App";

afterEach(() => vi.unstubAllGlobals());
it("consumes the shared health schema and forwards cancellation", async () => {
  const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
  vi.stubGlobal("fetch", mocked);
  const signal = new AbortController().signal;
  await expect(fetchHealth(signal)).resolves.toEqual({ status: "ok" });
  expect(mocked).toHaveBeenCalledWith("/health", { signal });
});
it.each([
  () => new Response("failure", { status: 503 }),
  () => new Response(JSON.stringify({ status: "unexpected" })),
  () => new Response("not json"),
])("rejects unavailable or incompatible backends", async (response) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  await expect(fetchHealth()).rejects.toThrow();
});
it("renders an accessible loading state and honest bootstrap content", () => {
  const html = renderToStaticMarkup(createElement(App));
  expect(html).toContain('role="status"');
  expect(html).toContain("正在检查服务连接");
  expect(html).toContain("待建设");
});

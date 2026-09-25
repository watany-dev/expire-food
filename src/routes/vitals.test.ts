import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import app from "../index";

const ORIGIN = "http://localhost";

// sendBeacon は文字列を text/plain で送る
const send = (body: string, origin = ORIGIN) =>
  app.request("/api/vitals", {
    method: "POST",
    body,
    headers: { origin, "content-type": "text/plain;charset=UTF-8" },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/vitals", () => {
  it("画面の種類と計測値だけを記録し、スペースは発行しない", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await send(
      JSON.stringify({ path: "/items/abc/edit", lcp: 1200, inp: 80, cls: 0.02, memo: "x" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(info).toHaveBeenCalledExactlyOnceWith({
      message: "web-vitals",
      path: "/items/:id/edit",
      lcp: 1200,
      inp: 80,
      cls: 0.02,
    });
  });

  it("不正な本文は記録せず 400", async () => {
    const info = vi.spyOn(console, "info");
    expect((await send(JSON.stringify({ lcp: 1 }))).status).toBe(400);
    expect(info).not.toHaveBeenCalled();
  });

  it("1KB を超える本文は読まずに 413", async () => {
    expect((await send(JSON.stringify({ path: "/", pad: "a".repeat(1024) }))).status).toBe(413);
  });

  it("別オリジンからは 403", async () => {
    expect((await send(JSON.stringify({ path: "/" }), "https://evil.example")).status).toBe(403);
  });
});

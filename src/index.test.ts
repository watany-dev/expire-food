import { describe, expect, it } from "vite-plus/test";

import app from "./index";

describe("app", () => {
  it("GET /healthz は ok を返す", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("GET / はセキュリティヘッダ付きの HTML を返す", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

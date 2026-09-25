import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { parseVitals } from "../domain/vitals";

// 実ユーザーの Core Web Vitals を Workers Logs に残す（ADR 0006）。スペースは解決しない
export const vitals = new Hono<{ Bindings: Env }>().post(
  "/",
  bodyLimit({ maxSize: 1024 }),
  async (c) => {
    const metrics = parseVitals(await c.req.text());
    if (metrics === null) return c.body(null, 400);
    console.info({ message: "web-vitals", ...metrics });
    return c.body(null, 204);
  },
);

import app from "../src/index";
import { createTestEnv } from "../src/test-env";

// E2E 用。Lighthouse CI と同じく Bun で app.fetch を配信し、D1 だけインメモリで渡す（ADR 0005）
const { env } = await createTestEnv();

export default {
  port: 8788,
  fetch: (request: Request) => app.fetch(request, env),
};

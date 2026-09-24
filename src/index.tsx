import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

const app = new Hono<{ Bindings: Env }>();

app.use(secureHeaders());

app.get("/healthz", (c) => c.json({ ok: true }));

app.get("/", (c) =>
  c.html(
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>期限メモ</title>
      </head>
      <body>
        <h1>期限メモ</h1>
        <p>準備中です。</p>
      </body>
    </html>,
  ),
);

export default app;

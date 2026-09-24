// semgrep --test 用フィクスチャ。`ruleid:` は検出されるべき行、`ok:` は検出されてはいけない行。
import { setCookie } from "hono/cookie";
// ruleid: hono-no-raw-html
import { html, raw } from "hono/html";

declare const db: D1Database;
declare const c: any;
declare const id: string;

// ruleid: no-math-random
const bad = Math.random().toString(36);
// ok: no-math-random
const good = crypto.randomUUID();

// ruleid: d1-no-dynamic-sql
db.prepare(`SELECT * FROM items WHERE id = '${id}'`);
// ruleid: d1-no-dynamic-sql
db.prepare("SELECT * FROM items WHERE id = '" + id + "'");
// ok: d1-no-dynamic-sql
db.prepare("SELECT * FROM items WHERE id = ?").bind(id);

// ruleid: hono-no-raw-html
const el1 = <div dangerouslySetInnerHTML={{ __html: id }} />;
// ok: hono-no-raw-html
const el2 = <div>{id}</div>;

async function extract() {
  const body = await c.req.parseBody();
  // ruleid: no-logging-request-payload
  console.error("extract failed", body);
  // ruleid: no-logging-request-payload
  console.log({ body });
  // ok: no-logging-request-payload
  console.error("extract failed");
}

// ruleid: space-cookie-must-be-hardened
setCookie(c, "space_id", id);
// ruleid: space-cookie-must-be-hardened
setCookie(c, "space_id", id, { path: "/" });
// ruleid: space-cookie-must-be-hardened
setCookie(c, "space_id", id, { httpOnly: true, sameSite: "Lax" });
// ok: space-cookie-must-be-hardened
setCookie(c, "space_id", id, { path: "/", httpOnly: true, secure: true, sameSite: "Lax", maxAge: 31536000 });
// ok: space-cookie-must-be-hardened
setCookie(c, "space_id", id, { sameSite: "Lax", secure: true, httpOnly: true });

export { bad, good, el1, el2, extract, html, raw };

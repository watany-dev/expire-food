import type { Child } from "hono/jsx";

// 1 枚の HTML で完結させ、追加のリクエストなしで描画する（LCP / CLS）。
// Hono JSX は <style> の中身もエスケープするので、`>` や `"` などを書かない
const css = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Hiragino Sans,sans-serif;line-height:1.5;color:#1a1a1a;background:#fff}
main{max-width:40rem;margin:0 auto;padding:1rem}
header{display:flex;align-items:center;justify-content:space-between;gap:1rem}
h1{font-size:1.5rem;margin:0}
a{color:#0b57d0}
.button,button{display:inline-block;min-height:44px;padding:.6rem 1rem;border:1px solid #0b57d0;border-radius:.5rem;background:#0b57d0;color:#fff;font:inherit;text-decoration:none;cursor:pointer}
.secondary{background:#fff;color:#0b57d0}
.danger{background:#b3261e;border-color:#b3261e;color:#fff}
.items{list-style:none;margin:1rem 0;padding:0}
.item{display:grid;grid-template-columns:1fr auto;gap:.25rem 1rem;align-items:center;padding:.75rem;border-bottom:1px solid #ddd;border-left:.5rem solid transparent}
.item .name{font-weight:bold;font-size:1.1rem}
.item .meta{grid-column:1;font-size:.9rem}
.item .days{grid-column:1;font-weight:bold}
.item .delete{grid-column:2;grid-row:1/span 3}
.expired{color:#b3261e;border-left-color:#b3261e}
.expired .name{color:#b3261e}
.warn{background:#fff4c2;border-left-color:#e0a800}
[popover]{max-width:calc(100% - 2rem);padding:1rem;border:1px solid #888;border-radius:.5rem;color:#1a1a1a}
[popover]::backdrop{background:rgb(0 0 0/.4)}
.actions{display:flex;gap:.5rem;margin-top:1rem}
form p{margin:0 0 1rem}
label,legend{display:block;font-weight:bold}
input,textarea{width:100%;min-height:44px;padding:.5rem;border:1px solid #888;border-radius:.5rem;font:inherit}
input[type=radio]{width:auto;min-height:auto;margin-right:.25rem}
fieldset{border:0;padding:0;margin:0 0 1rem}
fieldset label{display:inline-block;font-weight:normal;margin-right:1rem;padding:.5rem 0}
.error{color:#b3261e;font-weight:bold}
h2{font-size:1.2rem;margin:2rem 0 .5rem}
#crop-canvas{display:block;width:100%;height:auto;touch-action:none;border:1px solid #888}
button:disabled{opacity:.5;cursor:default}
.notice{padding:.75rem;border-left:.5rem solid #e0a800;background:#fff4c2}
`;

export const Layout = (props: { title: string; nonce: string | undefined; children: Child }) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light" />
      <meta name="theme-color" content="#0b57d0" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="icon" href="/icons/icon-192.png" type="image/png" />
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      <title>{props.title === "期限メモ" ? props.title : `${props.title} - 期限メモ`}</title>
      <style nonce={props.nonce}>{css}</style>
      <script src="/app.js" defer />
    </head>
    <body>
      <main>{props.children}</main>
    </body>
  </html>
);

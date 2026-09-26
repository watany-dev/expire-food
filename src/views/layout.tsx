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
header nav{display:flex;align-items:center;gap:1rem}
header .title{display:flex;align-items:center;gap:.5rem;min-width:0}
header .title h1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.menu{min-width:44px;padding:.6rem .75rem;line-height:1}
#tag-menu{inset:0 auto auto 0;margin:.5rem;min-width:14rem}
#tag-menu ul{list-style:none;margin:0 0 1rem;padding:0}
#tag-menu li a{display:block;padding:.6rem .75rem;border-radius:.5rem;text-decoration:none}
#tag-menu [aria-current]{background:#e8f0fe;font-weight:bold}
.row .tag{margin-right:.4rem;padding:0 .4rem;border-radius:.25rem;background:#e8f0fe;color:#0b57d0}
.tags{list-style:none;margin:0 0 1.5rem;padding:0}
.tags li{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.25rem 0;border-bottom:1px solid #ddd}
.group{display:flex;justify-content:space-between;font-size:.85rem;margin:1rem 0 0;padding:.25rem .75rem;background:#f1f3f4;color:#444}
.items{list-style:none;margin:0;padding:0}
.item{border-bottom:1px solid #ddd;border-left:.4rem solid transparent}
.swipe{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain}
.swipe::-webkit-scrollbar{display:none}
.row{flex:0 0 100%;display:flex;align-items:center;gap:.5rem;min-height:44px;padding:0 .75rem;color:inherit;text-decoration:none;scroll-snap-align:start}
.row .name{flex:1;min-width:0;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .meta{font-size:.8rem;color:#555}
.row .days{min-width:4.5em;font-weight:bold;text-align:right}
.item .delete{flex:0 0 5rem;border-radius:0;scroll-snap-align:end}
details summary{min-height:44px;padding:.6rem .75rem;color:#0b57d0;font-weight:bold;cursor:pointer;border-bottom:1px solid #ddd}
details[open] summary{display:none}
.expired{color:#b3261e;border-left-color:#b3261e}
.past_best{color:#5f6368;border-left-color:#9aa0a6}
.warn{background:#fff4c2;border-left-color:#e0a800}
[popover]{max-width:calc(100% - 2rem);padding:1rem;border:1px solid #888;border-radius:.5rem;color:#1a1a1a}
[popover]::backdrop{background:rgb(0 0 0/.4)}
.actions{display:flex;gap:.5rem;margin-top:1rem}
form p{margin:0 0 1rem}
label,legend{display:block;font-weight:bold}
input,textarea,select{width:100%;min-height:44px;padding:.5rem;border:1px solid #888;border-radius:.5rem;font:inherit}
select{background:#fff}
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

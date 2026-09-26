import type { Child } from "hono/jsx";

// 1 枚の HTML で完結させ、追加のリクエストなしで描画する（LCP / CLS）。
// Hono JSX は <style> の中身もエスケープするので、`>` や `"` などを書かない
const css = `
:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--primary:#0b57d0;--on-primary:#fff;--accent-bg:#e8f0fe;--muted:#555;--line:#ddd;--field:#888;--group-bg:#f1f3f4;--group-fg:#444;--danger:#b3261e;--on-danger:#fff;--past:#5f6368;--past-line:#9aa0a6;--warn-bg:#fff4c2;--warn-line:#e0a800;--highlight:#c2d7fa}
@media (prefers-color-scheme:dark){:root{--fg:#e3e3e3;--bg:#131314;--primary:#a8c7fa;--on-primary:#062e6f;--accent-bg:#1f3354;--muted:#b4b7bb;--line:#3c4043;--field:#8e918f;--group-bg:#2a2b2e;--group-fg:#c4c7c5;--danger:#f2b8b5;--on-danger:#601410;--past:#a0a4a9;--past-line:#80868b;--warn-bg:#3d3200;--highlight:#284a7e}}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Hiragino Sans,sans-serif;line-height:1.5;color:var(--fg);background:var(--bg)}
main{max-width:40rem;margin:0 auto;padding:1rem}
header{display:flex;align-items:center;justify-content:space-between;gap:1rem}
h1{font-size:1.5rem;margin:0}
a{color:var(--primary)}
.button,button{display:inline-block;min-height:44px;padding:.6rem 1rem;border:1px solid var(--primary);border-radius:.5rem;background:var(--primary);color:var(--on-primary);font:inherit;text-decoration:none;cursor:pointer}
.secondary{background:var(--bg);color:var(--primary)}
.danger{background:var(--danger);border-color:var(--danger);color:var(--on-danger)}
header nav{display:flex;align-items:center;gap:1rem}
header .title{display:flex;align-items:center;gap:.5rem;min-width:0}
header .title h1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.menu{min-width:44px;padding:.6rem .75rem;line-height:1}
#tag-menu{inset:0 auto auto 0;margin:.5rem;min-width:14rem}
#tag-menu ul{list-style:none;margin:0 0 1rem;padding:0}
#tag-menu li a{display:block;padding:.6rem .75rem;border-radius:.5rem;text-decoration:none}
#tag-menu [aria-current]{background:var(--accent-bg);font-weight:bold}
.row .tag{margin-right:.4rem;padding:0 .4rem;border-radius:.25rem;background:var(--accent-bg);color:var(--primary)}
.tags{list-style:none;margin:0 0 1.5rem;padding:0}
.tags li{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.25rem 0;border-bottom:1px solid var(--line)}
.group{display:flex;justify-content:space-between;font-size:.85rem;margin:1rem 0 0;padding:.25rem .75rem;background:var(--group-bg);color:var(--group-fg)}
.items{list-style:none;margin:0;padding:0}
.item{border-bottom:1px solid var(--line);border-left:.4rem solid transparent}
.swipe{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain}
.swipe::-webkit-scrollbar{display:none}
.row{flex:0 0 100%;display:flex;align-items:center;gap:.5rem;min-height:44px;padding:0 .75rem;color:inherit;text-decoration:none;scroll-snap-align:start}
.row .name{flex:1;min-width:0;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .meta{font-size:.8rem;color:var(--muted)}
.row .days{min-width:4.5em;font-weight:bold;text-align:right}
.item .delete{flex:0 0 5rem;border-radius:0;scroll-snap-align:end}
details summary{min-height:44px;padding:.6rem .75rem;color:var(--primary);font-weight:bold;cursor:pointer;border-bottom:1px solid var(--line)}
details[open] summary{display:none}
details.qr[open] summary{display:list-item}
.qr svg{display:block;max-width:100%;height:auto;margin:1rem 0}
.expired{color:var(--danger);border-left-color:var(--danger)}
.past_best{color:var(--past);border-left-color:var(--past-line)}
.warn{background:var(--warn-bg);border-left-color:var(--warn-line)}
.item:target{animation:saved 2s ease-out}
@keyframes saved{from{background:var(--highlight)}}
[popover]{max-width:calc(100% - 2rem);padding:1rem;border:1px solid var(--field);border-radius:.5rem;color:var(--fg);background:var(--bg)}
[popover]::backdrop{background:rgb(0 0 0/.4)}
.actions{display:flex;gap:.5rem;margin-top:1rem}
form p{margin:0 0 1rem}
label,legend{display:block;font-weight:bold}
input,textarea,select{width:100%;min-height:44px;padding:.5rem;border:1px solid var(--field);border-radius:.5rem;background:var(--bg);color:var(--fg);font:inherit}
input[type=radio],input[type=checkbox]{width:auto;min-height:auto;margin-right:.25rem}
fieldset{border:0;padding:0;margin:0 0 1rem}
fieldset label{display:inline-block;font-weight:normal;margin-right:1rem;padding:.5rem 0}
.error{color:var(--danger);font-weight:bold}
h2{font-size:1.2rem;margin:2rem 0 .5rem}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
#photo .button{display:block;padding:1rem;font-size:1.1rem;text-align:center}
#photo .check{margin-top:.5rem;padding:.5rem 0;font-weight:normal}
#photo-input:focus-visible+label{outline:2px solid var(--primary);outline-offset:2px}
#photo-input:disabled+label{opacity:.5;cursor:default}
#photo-thumb{display:block;max-width:6rem;max-height:6rem;margin-top:.5rem;border-radius:.25rem}
#photo-thumb[hidden],.spinner{display:none}
.busy .spinner{display:inline-block;width:1em;height:1em;margin:.5rem .5rem 0 0;vertical-align:-.15em;border:.2em solid var(--highlight);border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(1turn)}}
@media (prefers-reduced-motion:reduce){.busy .spinner{animation:none}}
#crop-canvas{display:block;width:100%;height:auto;touch-action:none;border:1px solid var(--field)}
button:disabled{opacity:.5;cursor:default}
.chips{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem}
.chips[hidden]{display:none}
.welcome ol{padding-left:1.5rem}
.welcome .button{display:block;padding:1rem;font-size:1.1rem;text-align:center}
.fab{position:fixed;right:calc(1rem + env(safe-area-inset-right,0px));bottom:calc(1rem + env(safe-area-inset-bottom,0px));padding:1rem 1.5rem;border-radius:2rem;font-size:1.1rem;box-shadow:0 2px 8px rgb(0 0 0/.3)}
main:has(.fab){padding-bottom:6rem}
.notice{padding:.75rem;border-left:.5rem solid var(--warn-line);background:var(--warn-bg)}
`;

export const Layout = (props: { title: string; nonce: string | undefined; children: Child }) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <meta name="theme-color" content="#0b57d0" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#131314" media="(prefers-color-scheme: dark)" />
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

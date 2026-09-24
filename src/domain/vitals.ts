import { z } from "zod";

// 集計に要るのは画面の種類だけ。商品 ID などはログに残さない
const PAGES: [RegExp, string][] = [
  [/^\/$/, "/"],
  [/^\/items\/new$/, "/items/new"],
  [/^\/items\/[^/]+\/edit$/, "/items/:id/edit"],
  [/^\/settings$/, "/settings"],
];

const pageLabel = (path: string) => PAGES.find(([pattern]) => pattern.test(path))?.[1] ?? "other";

// 範囲外の値はその指標だけ捨て、ほかの指標は残す
const ms = z.number().min(0).max(60_000).optional().catch(undefined);

const beacon = z.object({
  path: z.string().max(200).transform(pageLabel),
  lcp: ms,
  inp: ms,
  cls: z.number().min(0).max(100).optional().catch(undefined),
});

/** `src/client/app.js` が送る計測値を検証する。不正なら null */
export const parseVitals = (text: string) => {
  try {
    const parsed = beacon.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

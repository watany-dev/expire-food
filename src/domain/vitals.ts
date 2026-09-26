import { z } from "zod/mini";

// 集計に要るのは画面の種類だけ。商品 ID などはログに残さない
const PAGES: [RegExp, string][] = [
  [/^\/$/, "/"],
  [/^\/items\/new$/, "/items/new"],
  [/^\/items\/[^/]+\/edit$/, "/items/:id/edit"],
  [/^\/settings$/, "/settings"],
];

const pageLabel = (path: string) => PAGES.find(([pattern]) => pattern.test(path))?.[1] ?? "other";

const ms = z.catch(z.optional(z.number().check(z.minimum(0), z.maximum(60_000))), undefined);

const beacon = z.object({
  path: z.pipe(z.string().check(z.maxLength(200)), z.transform(pageLabel)),
  lcp: ms,
  inp: ms,
  cls: z.catch(z.optional(z.number().check(z.minimum(0), z.maximum(100))), undefined),
});

export const parseVitals = (text: string) => {
  try {
    const parsed = beacon.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

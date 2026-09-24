import { z } from "zod";

import type { ItemInput } from "./schema";

// モデルには日付を正規化させず、印字どおりに返させて normalizeDate で揃える（ADR 0003）
export const EXTRACT_PROMPT = `You read Japanese food packaging photos. Reply with only a JSON object with these keys:
- "name": the product name as printed (for example "牛乳"), or null
- "date": the expiry date exactly as printed (for example "2026.10.05", "26.10.05", "R8.10.5", "10月5日"), or null
- "label": the label printed next to the date ("賞味期限" or "消費期限"), or null
- "confidence": "high", "medium" or "low", how sure you are about the date`;

export type Extraction = {
  name: string | null;
  expires_on: string | null;
  kind: ItemInput["kind"] | null;
  confidence: "high" | "medium" | "low";
};

const isoDate = (year: number, month: number, day: number): string | null => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
};

// 年月だけの表示（3 か月を超える賞味期限で使われる）はその月末
const endOfMonth = (year: number, month: number): string | null =>
  isoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());

// 年の省略は今日（JST）以降で最も近い日付。今年と来年のどちらも実在しなければ null（2/29 など）
const nextOccurrence = (month: number, day: number, today: string): string | null => {
  const year = Number(today.slice(0, 4));
  return (
    [isoDate(year, month, day), isoDate(year + 1, month, day)].find(
      (date) => date !== null && date >= today,
    ) ?? null
  );
};

const n = (match: RegExpExecArray, index: number) => Number(match[index]);

// 先に一致した規則だけで判定する（`2026.10.05` を 2 桁年や年省略として読み直さない）
const dateRules: [RegExp, (m: RegExpExecArray, today: string) => string | null][] = [
  [
    /(?:R|令和)(\d{1,2})[./年-](\d{1,2})[./月-](\d{1,2})(?!\d)/i,
    (m) => isoDate(2018 + n(m, 1), n(m, 2), n(m, 3)),
  ],
  [
    /(?<!\d)(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})(?!\d)/,
    (m) => isoDate(n(m, 1), n(m, 2), n(m, 3)),
  ],
  [
    /(?<!\d)(\d{2})[./年-](\d{1,2})[./月-](\d{1,2})(?!\d)/,
    (m) => isoDate(2000 + n(m, 1), n(m, 2), n(m, 3)),
  ],
  [/(?<!\d)(\d{4})[./年-](\d{1,2})(?!\d)/, (m) => endOfMonth(n(m, 1), n(m, 2))],
  [/(?<!\d)(\d{1,2})[./月-](\d{1,2})(?!\d)/, (m, today) => nextOccurrence(n(m, 1), n(m, 2), today)],
];

/** 印字された期限を実在する `YYYY-MM-DD` にする。読めなければ null。`today` は JST の今日 */
export const normalizeDate = (text: string, today: string): string | null => {
  const compact = text.normalize("NFKC").replace(/\s/g, "");
  for (const [pattern, toDate] of dateRules) {
    const match = pattern.exec(compact);
    if (match) return toDate(match, today);
  }
  return null;
};

export const detectKind = (text: string): Extraction["kind"] => {
  if (/消費|use_by/i.test(text)) return "use_by";
  if (/賞味|best_by/i.test(text)) return "best_by";
  return null;
};

// 型の合わない項目は空文字（= 読めなかった）に倒す
const aiOutput = z
  .object({
    name: z.string().catch(""),
    date: z.string().catch(""),
    label: z.string().catch(""),
    confidence: z.enum(["high", "medium", "low"]).catch("low"),
  })
  .catch({ name: "", date: "", label: "", confidence: "low" });

// JSON モードでもオブジェクトで返る場合と、前後に文章や ``` が付いた文字列で返る場合がある
const parseJson = (response: unknown): unknown => {
  if (typeof response !== "string") return response;
  try {
    return JSON.parse(response.slice(response.indexOf("{"), response.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
};

/** Workers AI の応答を検証・正規化する。読めない項目は null */
export const parseExtraction = (response: unknown, today: string): Extraction => {
  const { name, date, label, confidence } = aiOutput.parse(parseJson(response));
  return {
    name: name.trim().slice(0, 100) || null,
    expires_on: normalizeDate(date, today),
    // 種別の文言が日付と一緒に返ってくることもある
    kind: detectKind(label + date),
    confidence,
  };
};

import { z } from "zod";

import type { ItemInput } from "./schema";

// 読み取りは段階的に行う（ADR 0007）。
// 写真 → 読み取りモデル（原文だけ返させる）→ コードで検証 → 意味的に曖昧なときだけ判定モデル → 確定 / 部分再読 / 再撮影

// 期限が読めない理由。写真そのものの問題なら部分再読では直らないので再撮影に進める
const ISSUES = ["blur", "cut_off", "glare", "too_small"] as const;
const RETAKE_ISSUES: readonly Issue[] = ["blur", "cut_off", "glare"];

// モデルには日付を正規化させず、印字どおりに返させて normalizeDate で揃える（ADR 0003）
const READ_PROMPT = `You read Japanese food packaging photos. Copy text exactly as printed; do not convert or guess.
- "names": every product name printed on the package, most prominent first (for example ["おいしい牛乳", "牛乳"]). [] if none is readable
- "dates": every date printed on the package, each with "text" (the date exactly as printed, for example "2026.10.05", "26.10.05", "R8.10.5", "10月5日") and "label" (the words printed next to it, for example "賞味期限", "消費期限", "製造日", or null). [] if none is readable
- "issue": if a date is on the package but you cannot read it, why: "blur", "cut_off" (partly outside the photo or the print is missing), "glare", or "too_small". Otherwise null`;

// 部分再読では期限の部分だけを切り出した写真を送る
const REREAD_PROMPT = `${READ_PROMPT}
This photo is a close-up of the date area, so "names" is usually [].`;

const readingSchema = {
  type: "object",
  properties: {
    names: { type: "array", items: { type: "string" } },
    dates: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, label: { type: ["string", "null"] } },
        required: ["text", "label"],
        additionalProperties: false,
      },
    },
    issue: { type: ["string", "null"], enum: [...ISSUES, null] },
  },
  required: ["names", "dates", "issue"],
  additionalProperties: false,
};

export type Part = "all" | "date";

// 本番（src/platform/ai.ts）とモデル比較（scripts/extract-eval.ts）で同じ入力を使う
export const readingInput = (imageUrl: string, part: Part) => ({
  messages: [
    { role: "system" as const, content: part === "date" ? REREAD_PROMPT : READ_PROMPT },
    {
      role: "user" as const,
      content: [{ type: "image_url" as const, image_url: { url: imageUrl } }],
    },
  ],
  response_format: {
    type: "json_schema" as const,
    json_schema: { name: "package_text", schema: readingSchema, strict: true },
  },
  // 印字を写すだけなので考えさせない（応答時間と Neurons を抑える）
  chat_template_kwargs: { enable_thinking: false },
  temperature: 0,
});

type Kind = ItemInput["kind"];
type Issue = (typeof ISSUES)[number];

export type Reading = {
  names: string[];
  dates: { text: string; label: string }[];
  issue: Issue | null;
};

// 型の合わない項目は「読めなかった」に倒す
const readingOutput = z
  .object({
    names: z.array(z.string().catch("")).catch([]),
    dates: z
      .array(
        z
          .object({ text: z.string().catch(""), label: z.string().nullable().catch(null) })
          .catch({ text: "", label: null }),
      )
      .catch([]),
    issue: z.enum(ISSUES).nullable().catch(null),
  })
  .catch({ names: [], dates: [], issue: null });

// Chat Completions 形式（choices[0].message.content）と旧形式（response）の両方を受ける
const chatOutput = z.object({
  choices: z.tuple([z.object({ message: z.object({ content: z.unknown() }) })], z.unknown()),
});
const legacyOutput = z.object({ response: z.unknown() });

export const modelContent = (output: unknown): unknown => {
  const chat = chatOutput.safeParse(output);
  if (chat.success) return chat.data.choices[0].message.content;
  const legacy = legacyOutput.safeParse(output);
  return legacy.success ? legacy.data.response : output;
};

// 構造化出力でも、前後に文章や ``` が付いた文字列で返る場合がある
const parseJson = (content: unknown): unknown => {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
};

export const parseReading = (output: unknown): Reading => {
  const { names, dates, issue } = readingOutput.parse(parseJson(modelContent(output)));
  return {
    names: names.map((s) => s.trim()).filter(Boolean),
    dates: dates
      .map((d) => ({ text: d.text.trim(), label: (d.label ?? "").trim() }))
      .filter((d) => d.text),
    issue,
  };
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

export const detectKind = (text: string): Kind | null => {
  if (/消費|use_by/i.test(text)) return "use_by";
  if (/賞味|best_by/i.test(text)) return "best_by";
  return null;
};

// 製造日などは期限ではない
const isNotExpiry = (label: string) => /製造|加工|包装|採卵/.test(label);

const loose = (s: string) => s.normalize("NFKC").replace(/\s/g, "").toLowerCase();

const uniqueBy = <T>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(key(item)) && seen.add(key(item)));
};

type DateCandidate = { text: string; expires_on: string; kind: Kind | null };

/** コードで決められるところまで決める。複数の候補が残った項目だけが判定モデルに回る */
export type Resolution = {
  name: string | null;
  names: string[];
  date: DateCandidate | null;
  dates: DateCandidate[];
};

/**
 * `knownNames` はスペースに登録済みの商品名（商品マスタ代わり）。
 * 候補のうちちょうど 1 つが登録済みなら、登録済みの表記で確定する
 */
export const resolveReading = (
  reading: Reading,
  { today, knownNames }: { today: string; knownNames: string[] },
): Resolution => {
  const names = uniqueBy(
    reading.names.map((s) => s.slice(0, 100)),
    loose,
  );
  const known = uniqueBy(
    knownNames.filter((k) => names.some((s) => loose(s) === loose(k))),
    loose,
  );
  const name = known.length === 1 ? known[0]! : names.length === 1 ? names[0]! : null;

  const valid = reading.dates.flatMap(({ text, label }) => {
    const expiresOn = isNotExpiry(label) ? null : normalizeDate(text, today);
    // 種別の文言が日付と一緒に返ってくることもある
    return expiresOn
      ? [{ text: `${label} ${text}`.trim(), expires_on: expiresOn, kind: detectKind(label + text) }]
      : [];
  });
  // 期限の文言が付いた日付があれば、付いていない日付（ロット番号の一部など）より優先する
  const labeled = valid.filter((d) => d.kind !== null);
  const dates = uniqueBy(labeled.length > 0 ? labeled : valid, (d) => d.expires_on);
  return { name, names, date: dates.length === 1 ? dates[0]! : null, dates };
};

type Next = "confirm" | "reread" | "retake";

export type Extraction = {
  name: string | null;
  expires_on: string | null;
  kind: Kind | null;
  confidence: "high" | "medium" | "low";
  /** 期限が決まるか候補があれば確認へ。どちらも無ければ、写真の問題なら再撮影、そうでなければ期限の部分だけ再読 */
  next: Next;
  /** 決めきれなかったときにフォームで選ばせる候補 */
  name_candidates: string[];
  date_candidates: string[];
};

export const decide = (
  resolution: Resolution,
  { issue, part, judged }: { issue: Issue | null; part: Part; judged: Partial<Resolution> },
): Extraction => {
  const name = resolution.name ?? judged.name ?? null;
  const date = resolution.date ?? judged.date ?? null;
  // 候補が複数あるのは読めているということなので、再読せずにユーザーに選ばせる
  const next: Next =
    date || resolution.dates.length > 1
      ? "confirm"
      : part === "date" || (issue !== null && RETAKE_ISSUES.includes(issue))
        ? "retake"
        : "reread";
  return {
    name,
    expires_on: date?.expires_on ?? null,
    kind: date?.kind ?? null,
    // 判定モデルが選んだ日付は、コードだけで決まった日付より確認を強く促す
    confidence: resolution.date ? "high" : date ? "medium" : "low",
    next,
    name_candidates: name ? [] : resolution.names,
    date_candidates: date ? [] : resolution.dates.map((d) => d.expires_on),
  };
};

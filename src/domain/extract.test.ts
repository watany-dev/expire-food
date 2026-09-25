import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import { detectKind, extractionInput, normalizeDate, parseExtraction } from "./extract";
import { itemInput } from "./schema";

const today = "2026-09-24";

const isRealDate = (s: string) => itemInput.shape.expires_on.safeParse(s).success;

const day = fc
  .date({ min: new Date("2000-01-01"), max: new Date("2099-12-31"), noInvalidDate: true })
  .map((d) => ({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }));
const iso = ({ y, m, d }: { y: number; m: number; d: number }) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const anyToday = day.map(iso);

describe("normalizeDate", () => {
  it.each([
    ["2026.10.05", "2026-10-05"],
    ["2026/10/5", "2026-10-05"],
    ["2026-10-05", "2026-10-05"],
    ["2026年10月5日", "2026-10-05"],
    ["26.10.05", "2026-10-05"],
    ["26年10月5日", "2026-10-05"],
    ["R8.10.5", "2026-10-05"],
    ["r8.10.5", "2026-10-05"],
    ["令和8年10月5日", "2026-10-05"],
    ["２０２６．１０．０５", "2026-10-05"],
    ["賞味期限 2026. 10. 05 ロット A12", "2026-10-05"],
    ["2027.10", "2027-10-31"],
    ["2028年2月", "2028-02-29"],
    ["2027年2月", "2027-02-28"],
    // 年省略: 今日以降で最も近い日付
    ["10.5", "2026-10-05"],
    ["10月5日", "2026-10-05"],
    ["9.24", "2026-09-24"],
    ["9.23", "2027-09-23"],
    ["1/1", "2027-01-01"],
  ])("%s → %s", (text, expected) => {
    expect(normalizeDate(text, today)).toBe(expected);
  });

  it.each([
    "",
    "賞味期限",
    "2026.02.30",
    "2026.13.01",
    "26.02.29",
    "R8.2.30",
    "2027.13",
    "2027.0",
    "2/30",
    "0.5",
    // 今年も来年もうるう年でない
    "2/29",
  ])("読めない・実在しない %j は null", (text) => {
    expect(normalizeDate(text, today)).toBeNull();
  });

  it("年省略の 2/29 は、今年がうるう年なら今年として読む", () => {
    expect(normalizeDate("2/29", "2028-01-10")).toBe("2028-02-29");
  });

  it("実在する日付は YYYY/M/D・YY.MM.DD・令和のどの表記でも同じ日になる", () => {
    fc.assert(
      fc.property(day, (date) => {
        const pad = (v: number) => String(v).padStart(2, "0");
        expect(normalizeDate(`${date.y}/${date.m}/${date.d}`, today)).toBe(iso(date));
        expect(normalizeDate(`${pad(date.y % 100)}.${pad(date.m)}.${pad(date.d)}`, today)).toBe(
          iso(date),
        );
        if (date.y >= 2019) {
          expect(normalizeDate(`R${date.y - 2018}.${date.m}.${date.d}`, today)).toBe(iso(date));
        }
      }),
    );
  });

  it("年省略の結果は null か、今日から 1 年以内の実在する日付", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        anyToday,
        (month, dayOfMonth, now) => {
          const result = normalizeDate(`${month}月${dayOfMonth}日`, now);
          if (result === null) return;
          expect(isRealDate(result)).toBe(true);
          expect(result >= now).toBe(true);
          expect(Number(result.slice(0, 4)) - Number(now.slice(0, 4))).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe("detectKind", () => {
  it.each([
    ["消費期限", "use_by"],
    ["賞味期限", "best_by"],
    ["USE_BY", "use_by"],
    ["best_by", "best_by"],
    ["期限", null],
    ["", null],
  ])("%j → %s", (text, expected) => {
    expect(detectKind(text)).toBe(expected);
  });
});

describe("parseExtraction", () => {
  it("JSON 文字列を正規化して返す", () => {
    const response = JSON.stringify({
      name: " 牛乳 ",
      date: "26.10.05",
      label: "消費期限",
      confidence: "high",
    });
    expect(parseExtraction(response, today)).toEqual({
      name: "牛乳",
      expires_on: "2026-10-05",
      kind: "use_by",
      confidence: "high",
    });
  });

  it("JSON モードでオブジェクトのまま返っても読む", () => {
    const response = { name: "卵", date: "10月5日", label: "賞味期限", confidence: "medium" };
    expect(parseExtraction(response, today)).toEqual({
      name: "卵",
      expires_on: "2026-10-05",
      kind: "best_by",
      confidence: "medium",
    });
  });

  it("前後の文章やコードフェンスを無視する", () => {
    const response = '```json\n{"name":"食パン","date":"2026/9/30","label":null}\n```';
    expect(parseExtraction(response, today)).toEqual({
      name: "食パン",
      expires_on: "2026-09-30",
      kind: null,
      confidence: "low",
    });
  });

  it("種別の文言が日付と一緒に返っても判定する", () => {
    const response = { name: "ツナ缶", date: "賞味期限 2029.03", label: null };
    expect(parseExtraction(response, today)).toMatchObject({
      expires_on: "2029-03-31",
      kind: "best_by",
    });
  });

  it("商品名は 100 文字に切り詰める", () => {
    expect(parseExtraction({ name: "あ".repeat(150) }, today).name).toHaveLength(100);
  });

  it.each([
    ["JSON でない文字列", "読み取れませんでした"],
    ["壊れた JSON", '{"name": "牛乳"'],
    ["null", null],
    ["配列", [1, 2]],
    ["型の違う項目", { name: 1, date: ["2026.10.05"], label: {}, confidence: "sure" }],
    ["空白だけの商品名", { name: "   " }],
  ])("%s は全項目 null・confidence low", (_, response) => {
    expect(parseExtraction(response, today)).toEqual({
      name: null,
      expires_on: null,
      kind: null,
      confidence: "low",
    });
  });

  it("どんな応答でも例外を出さず、日付は null か実在する YYYY-MM-DD で、同じ入力なら同じ結果", () => {
    fc.assert(
      fc.property(fc.oneof(fc.anything(), fc.json(), fc.string()), anyToday, (response, now) => {
        const result = parseExtraction(response, now);
        expect(result.expires_on === null || isRealDate(result.expires_on)).toBe(true);
        expect(["high", "medium", "low"]).toContain(result.confidence);
        expect(parseExtraction(response, now)).toEqual(result);
      }),
    );
  });
});

describe("extractionInput", () => {
  it("画像を user メッセージに入れ、JSON だけを決定的に返させる", () => {
    const input = extractionInput("data:image/jpeg;base64,AAAA");
    expect(input.messages[1]?.content).toEqual([
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } },
    ]);
    expect(input).toMatchObject({ response_format: { type: "json_object" }, temperature: 0 });
  });
});

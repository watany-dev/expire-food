import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import {
  type Reading,
  type Resolution,
  decide,
  detectKind,
  modelContent,
  normalizeDate,
  parseReading,
  readingInput,
  resolveReading,
} from "./extract";
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

describe("modelContent", () => {
  it("Chat Completions 形式なら message.content", () => {
    expect(modelContent({ choices: [{ message: { content: "{}" } }] })).toBe("{}");
  });

  it("旧形式なら response", () => {
    expect(modelContent({ response: { names: [] } })).toEqual({ names: [] });
  });

  it.each([[null], ["text"], [{ choices: [] }]])("どちらでもなければそのまま（%j）", (output) => {
    expect(modelContent(output)).toEqual(output);
  });
});

describe("parseReading", () => {
  const chat = (content: unknown) => ({ choices: [{ message: { content } }] });

  it("原文をそのまま、前後の空白だけ落として返す", () => {
    const content = JSON.stringify({
      names: [" おいしい牛乳 ", "牛乳", "  "],
      dates: [
        { text: " 26.10.05 ", label: " 消費期限 " },
        { text: "26.10.01", label: null },
        { text: " ", label: "製造日" },
      ],
      issue: null,
    });
    expect(parseReading(chat(content))).toEqual({
      names: ["おいしい牛乳", "牛乳"],
      dates: [
        { text: "26.10.05", label: "消費期限" },
        { text: "26.10.01", label: "" },
      ],
      issue: null,
    });
  });

  it("前後の文章やコードフェンスを無視する", () => {
    const content = '```json\n{"names":["食パン"],"dates":[],"issue":"blur"}\n```';
    expect(parseReading(chat(content))).toEqual({ names: ["食パン"], dates: [], issue: "blur" });
  });

  it("型の違う項目は読めなかったものとして扱う", () => {
    const response = {
      names: ["卵", 1],
      dates: [{ text: 5 }, "x", { text: "10.5" }],
      issue: "dark",
    };
    expect(parseReading({ response })).toEqual({
      names: ["卵"],
      dates: [{ text: "10.5", label: "" }],
      issue: null,
    });
  });

  it.each([
    ["JSON でない文字列", "読み取れませんでした"],
    ["壊れた JSON", '{"names": ["牛乳"'],
    ["null", null],
    ["配列", [1, 2]],
    ["項目が無い", {}],
  ])("%s は何も読めなかったことにする", (_, content) => {
    expect(parseReading(chat(content))).toEqual({ names: [], dates: [], issue: null });
  });

  it("どんな応答でも例外を出さず、空の原文を含まない", () => {
    fc.assert(
      fc.property(fc.oneof(fc.anything(), fc.json(), fc.string()), (content) => {
        const reading = parseReading(chat(content));
        expect(reading.names.every((s) => s.length > 0)).toBe(true);
        expect(reading.dates.every((d) => d.text.length > 0)).toBe(true);
      }),
    );
  });
});

describe("resolveReading", () => {
  const reading = (r: Partial<Reading>): Reading => ({ names: [], dates: [], issue: null, ...r });
  const resolve = (r: Partial<Reading>, knownNames: string[] = []) =>
    resolveReading(reading(r), { today, knownNames });

  it("候補が 1 つずつならコードだけで決まる", () => {
    expect(resolve({ names: ["牛乳"], dates: [{ text: "26.10.05", label: "消費期限" }] })).toEqual({
      name: "牛乳",
      names: ["牛乳"],
      date: { text: "消費期限 26.10.05", expires_on: "2026-10-05", kind: "use_by" },
      dates: [{ text: "消費期限 26.10.05", expires_on: "2026-10-05", kind: "use_by" }],
    });
  });

  it("種別の文言が日付と一緒に返っても判定する", () => {
    expect(resolve({ dates: [{ text: "賞味期限 2029.03", label: "" }] }).date).toEqual({
      text: "賞味期限 2029.03",
      expires_on: "2029-03-31",
      kind: "best_by",
    });
  });

  it("製造日と日付として成立しない表示は候補から外す", () => {
    const r = resolve({
      dates: [
        { text: "26.09.20", label: "製造年月日" },
        { text: "26.02.30", label: "賞味期限" },
        { text: "26.10.05", label: "" },
      ],
    });
    expect(r.date?.expires_on).toBe("2026-10-05");
  });

  it("期限の文言が付いた日付を、付いていない日付より優先する", () => {
    const r = resolve({
      dates: [
        { text: "10.01", label: "" },
        { text: "26.10.05", label: "賞味期限" },
      ],
    });
    expect(r.dates.map((d) => d.expires_on)).toEqual(["2026-10-05"]);
    expect(r.date?.kind).toBe("best_by");
  });

  it("同じ日付の表示は 1 つにまとめる", () => {
    const r = resolve({
      dates: [
        { text: "2026.10.05", label: "賞味期限" },
        { text: "26.10.5", label: "賞味期限" },
      ],
    });
    expect(r.date?.text).toBe("賞味期限 2026.10.05");
  });

  it("別々の日付が残れば決めずに候補として返す", () => {
    const r = resolve({
      dates: [
        { text: "26.10.05", label: "賞味期限" },
        { text: "26.11.01", label: "消費期限" },
      ],
    });
    expect(r.date).toBeNull();
    expect(r.dates.map((d) => d.expires_on)).toEqual(["2026-10-05", "2026-11-01"]);
  });

  it("商品名の候補は表記揺れをまとめ、100 文字に切り詰める", () => {
    expect(resolve({ names: ["牛乳", "牛 乳", "ＭＩＬＫ", "milk"] }).names).toEqual([
      "牛乳",
      "ＭＩＬＫ",
    ]);
    expect(resolve({ names: ["あ".repeat(150)] }).name).toHaveLength(100);
  });

  it("商品名の候補が複数でも、登録済みの名前とちょうど 1 つ一致すれば登録済みの表記で決まる", () => {
    const r = resolve({ names: ["明治", "おいしい牛乳"] }, ["オイシイ牛乳", "おいしい 牛乳", "卵"]);
    expect(r.name).toBe("おいしい 牛乳");
  });

  it.each([
    ["一致なし", ["卵"]],
    ["2 つ一致", ["明治", "おいしい牛乳"]],
  ])("商品名の候補が複数で登録済みの名前が決め手にならなければ決めない（%s）", (_, known) => {
    const r = resolve({ names: ["明治", "おいしい牛乳"] }, known);
    expect(r.name).toBeNull();
    expect(r.names).toEqual(["明治", "おいしい牛乳"]);
  });

  it("何も読めなければ何も決まらない", () => {
    expect(resolve({})).toEqual({ name: null, names: [], date: null, dates: [] });
  });
});

describe("decide", () => {
  const milk = { text: "消費期限 26.10.05", expires_on: "2026-10-05", kind: "use_by" as const };
  const bread = { text: "26.11.01", expires_on: "2026-11-01", kind: null };
  const resolution = (r: Partial<Resolution>): Resolution => ({
    name: null,
    names: [],
    date: null,
    dates: [],
    ...r,
  });
  const base = { issue: null, part: "all" as const, judged: {} };

  it("コードだけで決まれば確信度 high で確認へ", () => {
    expect(
      decide(resolution({ name: "牛乳", names: ["牛乳"], date: milk, dates: [milk] }), base),
    ).toEqual({
      name: "牛乳",
      expires_on: "2026-10-05",
      kind: "use_by",
      confidence: "high",
      next: "confirm",
      name_candidates: [],
      date_candidates: [],
    });
  });

  it("判定モデルが選んだものは確信度 medium", () => {
    const r = resolution({ names: ["明治", "牛乳"], dates: [milk, bread] });
    expect(decide(r, { ...base, judged: { name: "牛乳", date: bread } })).toMatchObject({
      name: "牛乳",
      expires_on: "2026-11-01",
      kind: null,
      confidence: "medium",
      next: "confirm",
    });
  });

  it("決まらなかった項目は候補を返す", () => {
    const r = resolution({ names: ["明治", "牛乳"], dates: [milk, bread] });
    expect(decide(r, base)).toMatchObject({
      name: null,
      expires_on: null,
      confidence: "low",
      next: "confirm",
      name_candidates: ["明治", "牛乳"],
      date_candidates: ["2026-10-05", "2026-11-01"],
    });
  });

  it.each([
    [null, "all", "reread"],
    ["too_small", "all", "reread"],
    ["blur", "all", "retake"],
    ["cut_off", "all", "retake"],
    ["glare", "all", "retake"],
    // 部分再読でも読めなければ、それ以上は再読せず撮り直してもらう
    [null, "date", "retake"],
  ] as const)("期限が決まらず issue %s・part %s なら %s", (issue, part, next) => {
    expect(decide(resolution({}), { issue, part, judged: {} }).next).toBe(next);
  });

  it("期限が決まれば issue があっても確認へ", () => {
    expect(decide(resolution({ date: milk }), { ...base, issue: "blur" }).next).toBe("confirm");
  });
});

describe("readingInput", () => {
  it("画像を user メッセージに入れ、構造化出力を考えさせずに決定的に返させる", () => {
    const input = readingInput("data:image/jpeg;base64,AAAA", "all");
    expect(input.messages[1]?.content).toEqual([
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } },
    ]);
    expect(input).toMatchObject({
      response_format: { type: "json_schema", json_schema: { name: "package_text", strict: true } },
      chat_template_kwargs: { enable_thinking: false },
      temperature: 0,
    });
  });

  it("部分再読では期限の部分の切り抜きであることを伝える", () => {
    const all = readingInput("data:,", "all").messages[0]?.content;
    const date = readingInput("data:,", "date").messages[0]?.content;
    expect(date).toContain(all);
    expect(date).toContain("close-up of the date area");
  });
});

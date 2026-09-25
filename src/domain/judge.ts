import { z } from "zod";

import type { Reading, Resolution } from "./extract";

// 判定モデル（Jev）は意味的な曖昧さだけに使う（ADR 0007）。
// 日付として成立するか・期限の文言があるか・登録済みの商品名と一致するかはコード（resolveReading）で決め、
// それでも候補が複数残った項目だけを Choice の質問にする

// これ未満の確信度なら選ばず、候補をフォームに出してユーザーに選ばせる
const MIN_CONFIDENCE = 0.7;

type Choice = { type: "choice"; instructions: string; criteria: Record<string, null> };

export type JudgeInput = { state: Reading; questions: { name?: Choice; date?: Choice } };

const choice = (instructions: string, options: string[]): Choice => ({
  type: "choice",
  instructions,
  criteria: Object.fromEntries(options.map((o) => [o, null])),
});

/** 曖昧な項目が無ければ null（判定モデルを呼ばない） */
export const judgeInput = (reading: Reading, resolution: Resolution): JudgeInput | null => {
  const questions: JudgeInput["questions"] = {};
  if (resolution.name === null && resolution.names.length > 1) {
    questions.name = choice(
      "Which of these is the product name a shopper would use for this food package? Prefer the generic product over brand, maker or catch copy.",
      resolution.names,
    );
  }
  if (resolution.date === null && resolution.dates.length > 1) {
    questions.date = choice(
      "Which of these printed dates is the expiry date (賞味期限 or 消費期限) of this food package, not a manufacturing date, lot number or campaign period?",
      resolution.dates.map((d) => d.text),
    );
  }
  return Object.keys(questions).length > 0 ? { state: reading, questions } : null;
};

const answer = z.object({ choice: z.string(), confidence: z.number() }).catch({
  choice: "",
  confidence: 0,
});
const answers = z.object({ name: answer.optional(), date: answer.optional() });
// 応答の外側（answers の有無・result での包み）は揺れても読めるようにする
const envelope = z.union([
  z.object({ result: z.object({ answers }) }).transform((v) => v.result.answers),
  z.object({ answers }).transform((v) => v.answers),
  answers,
]);

const picked = (a: z.infer<typeof answer> | undefined, options: string[]) =>
  a && a.confidence >= MIN_CONFIDENCE && options.includes(a.choice) ? a.choice : null;

/** 判定モデルの応答から、確信度が十分で候補に含まれる選択だけを採る */
export const parseJudgement = (output: unknown, resolution: Resolution): Partial<Resolution> => {
  const parsed = envelope.safeParse(output);
  if (!parsed.success) return {};
  const name = picked(parsed.data.name, resolution.names);
  const dateText = picked(
    parsed.data.date,
    resolution.dates.map((d) => d.text),
  );
  return {
    ...(name ? { name } : {}),
    ...(dateText ? { date: resolution.dates.find((d) => d.text === dateText)! } : {}),
  };
};

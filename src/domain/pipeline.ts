import { type Extraction, type Part, decide, parseReading, resolveReading } from "./extract";
import { type JudgeInput, judgeInput, parseJudgement } from "./judge";

// 本番（src/routes/extract.ts）とモデル比較（scripts/extract-eval.ts）で同じ段階処理を通す。
// 読み取りモデルは必ず 1 回呼ぶ。判定モデルは渡されたときに、曖昧な候補が残ったときだけ、登録済みの商品名は商品名の候補が複数あるときだけ読む
export const extractItem = async ({
  part,
  today,
  read,
  judge,
  knownNames,
}: {
  part: Part;
  today: string;
  read: () => Promise<unknown>;
  judge?: ((input: JudgeInput) => Promise<unknown>) | undefined;
  knownNames: () => Promise<string[]>;
}): Promise<Extraction> => {
  const reading = parseReading(await read());
  const resolution = resolveReading(reading, {
    today,
    knownNames: reading.names.length > 1 ? await knownNames() : [],
  });
  const input = judgeInput(reading, resolution);
  const judged = judge && input ? parseJudgement(await judge(input), resolution) : {};
  return decide(resolution, { issue: reading.issue, part, judged });
};

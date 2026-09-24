import { EXTRACT_PROMPT } from "../domain/extract";

// 暫定。実物パッケージでの精度・Neurons 消費の比較は ROADMAP Phase 3 の残タスク（ADR 0003）
const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

// String.fromCharCode(...bytes) は 2MB だと引数が多すぎるので分けて渡す
const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

// 応答は未検証のまま返すので、必ず parseExtraction に通す
export const runExtraction = async (ai: Ai, image: File): Promise<unknown> => {
  const url = `data:${image.type};base64,${toBase64(new Uint8Array(await image.arrayBuffer()))}`;
  const { response } = await ai.run(MODEL, {
    messages: [
      { role: "system", content: EXTRACT_PROMPT },
      { role: "user", content: [{ type: "image_url", image_url: { url } }] },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  return response;
};

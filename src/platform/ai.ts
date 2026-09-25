import { extractionInput } from "../domain/extract";

// 画像を読めるモデルで Neurons が最も少ない（ADR 0003）。精度は bun run extract-eval で確かめる
export const EXTRACT_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

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
  const { response } = await ai.run(EXTRACT_MODEL, extractionInput(url));
  return response;
};

import { z } from "zod";

const name = z.string().trim().min(1).max(100);
// z.iso.date() はうるう年を含めて実在する日付だけを通す
const expiresOn = z.iso.date();
const kind = z.enum(["best_by", "use_by"]);
// 空文字は「メモなし」として NULL に揃える
const memo = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((s) => s || null);

export const itemInput = z.object({
  name,
  expires_on: expiresOn,
  kind,
  memo: memo.optional().transform((s) => s ?? null),
});

export const itemPatch = z
  .object({
    name: name.exactOptional(),
    expires_on: expiresOn.exactOptional(),
    kind: kind.exactOptional(),
    memo: memo.exactOptional(),
  })
  .refine((v) => Object.keys(v).length > 0, "更新する項目がありません");

// migrations/0001_init.sql の spaces.warn_days の DEFAULT と揃える
export const DEFAULT_WARN_DAYS = 3;

export const spacePatch = z.object({
  warn_days: z.int().min(1).max(30),
});

export const spaceId = z.uuid();

export type ItemInput = z.infer<typeof itemInput>;
export type ItemPatch = z.infer<typeof itemPatch>;
export type Item = ItemInput & { id: string; created_at: string };

import { z } from "zod/mini";

const name = z.string().check(z.trim(), z.minLength(1), z.maxLength(100));
// z.iso.date() はうるう年を含めて実在する日付だけを通す
const expiresOn = z.iso.date();
const kind = z.enum(["best_by", "use_by"]);
// 空文字は「メモなし」として NULL に揃える
const memo = z.pipe(
  z.nullable(z.string().check(z.trim(), z.maxLength(500))),
  z.transform((s) => s || null),
);

export const itemInput = z.object({
  name,
  expires_on: expiresOn,
  kind,
  memo: z.pipe(
    z.optional(memo),
    z.transform((s) => s ?? null),
  ),
});

export const itemPatch = z
  .object({
    name: z.exactOptional(name),
    expires_on: z.exactOptional(expiresOn),
    kind: z.exactOptional(kind),
    memo: z.exactOptional(memo),
  })
  .check(z.refine((v) => Object.keys(v).length > 0, "更新する項目がありません"));

// migrations/0001_init.sql の spaces.warn_days の DEFAULT と揃える
export const DEFAULT_WARN_DAYS = 3;

export const spacePatch = z.object({
  warn_days: z.int().check(z.minimum(1), z.maximum(30)),
});

export const spaceId = z.uuid();

// 要件 8.1: クライアントで長辺 800px の JPEG に縮小してから送る。上限 2MB
export const extractForm = z.object({
  // z.file() は DOM の lib が無いと size / type しか型に持たないので instanceof で受ける
  image: z.instanceof(File).check(
    z.refine((file) => file.size <= 2 * 1024 * 1024),
    z.refine((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type)),
  ),
  // date は期限の部分だけを切り出した写真の再読（ADR 0007）
  part: z._default(z.enum(["all", "date"]), "all"),
});

export type ItemInput = z.output<typeof itemInput>;
export type ItemPatch = z.output<typeof itemPatch>;
export type Item = ItemInput & { id: string; created_at: string };

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
// フォームの「なし」は空文字で届く。他スペースのタグは保存時に NULL になる（src/platform/db.ts）
const tagId = z.pipe(
  z.nullable(z.union([z.uuid(), z.literal("")])),
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
  tag_id: z.pipe(
    z.optional(tagId),
    z.transform((s) => s ?? null),
  ),
});

export const itemPatch = z
  .object({
    name: z.exactOptional(name),
    expires_on: z.exactOptional(expiresOn),
    kind: z.exactOptional(kind),
    memo: z.exactOptional(memo),
    tag_id: z.exactOptional(tagId),
  })
  .check(z.refine((v) => Object.keys(v).length > 0, "更新する項目がありません"));

export const tagInput = z.object({
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(20)),
});

// migrations/0001_init.sql の spaces.warn_days の DEFAULT と揃える
export const DEFAULT_WARN_DAYS = 3;

export const spacePatch = z.object({
  warn_days: z.int().check(z.minimum(1), z.maximum(30)),
});

export const spaceId = z.uuid();

// D1 の書き込み・容量を 1 つのスペースで使い切らせない
export const MAX_ITEMS = 500;
export const MAX_TAGS = 100;

// 要件 8.1: クライアントで長辺 800px の JPEG に縮小してから送る。上限 2MB
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const extractForm = z.object({
  // z.file() は DOM の lib が無いと size / type しか型に持たないので instanceof で受ける
  image: z.instanceof(File).check(
    z.refine((file) => file.size <= MAX_IMAGE_BYTES),
    z.refine((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type)),
  ),
  // date は期限の部分だけを切り出した写真の再読（ADR 0007）
  part: z._default(z.enum(["all", "date"]), "all"),
  // on のときだけ判定モデル（Jev）も使う。効果を比べるため既定は off（ADR 0013）
  judge: z._default(z.enum(["off", "on"]), "off"),
});

export type ItemInput = z.output<typeof itemInput>;
export type ItemPatch = z.output<typeof itemPatch>;
export type Item = ItemInput & { id: string; created_at: string };
export type Tag = { id: string; name: string };

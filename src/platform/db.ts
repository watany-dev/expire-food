import type { Item, ItemInput, ItemPatch } from "../domain/schema";

// items のクエリは必ず space_id を条件に含める（他スペースのデータに触れない）

export const spaceExists = async (db: D1Database, spaceId: string): Promise<boolean> =>
  (await db.prepare("SELECT 1 FROM spaces WHERE id = ?").bind(spaceId).first()) !== null;

export const createSpace = async (db: D1Database, spaceId: string): Promise<void> => {
  await db
    .prepare("INSERT INTO spaces (id, created_at) VALUES (?, ?)")
    .bind(spaceId, new Date().toISOString())
    .run();
};

// batch() は 1 トランザクション（ADR 0004）。別の端末が先に作り直していれば旧 ID は無く、何も変えずに false を返す
export const rotateSpace = async (
  db: D1Database,
  oldId: string,
  newId: string,
): Promise<boolean> => {
  const [inserted] = await db.batch([
    db
      .prepare(
        "INSERT INTO spaces (id, warn_days, created_at) SELECT ?, warn_days, created_at FROM spaces WHERE id = ?",
      )
      .bind(newId, oldId),
    db.prepare("UPDATE items SET space_id = ? WHERE space_id = ?").bind(newId, oldId),
    db.prepare("DELETE FROM spaces WHERE id = ?").bind(oldId),
  ]);
  return (inserted?.meta.changes ?? 0) > 0;
};

// スペースが無ければ null（存在の確認を兼ねる）
export const getWarnDays = (db: D1Database, spaceId: string): Promise<number | null> =>
  db.prepare("SELECT warn_days FROM spaces WHERE id = ?").bind(spaceId).first<number>("warn_days");

export const setWarnDays = async (
  db: D1Database,
  spaceId: string,
  warnDays: number,
): Promise<void> => {
  await db.prepare("UPDATE spaces SET warn_days = ? WHERE id = ?").bind(warnDays, spaceId).run();
};

const listItemsQuery = (db: D1Database, spaceId: string) =>
  db
    .prepare(
      "SELECT id, name, expires_on, kind, memo, created_at FROM items WHERE space_id = ? ORDER BY expires_on, created_at, id",
    )
    .bind(spaceId);

export const listItems = async (db: D1Database, spaceId: string): Promise<Item[]> =>
  (await listItemsQuery(db, spaceId).all<Item>()).results;

// 一覧画面の分を 1 回の往復で読む。スペースが無ければ null（存在の確認を兼ねる）
export const getList = async (
  db: D1Database,
  spaceId: string,
): Promise<{ warnDays: number; items: Item[] } | null> => {
  const [space, items] = await db.batch([
    db.prepare("SELECT warn_days FROM spaces WHERE id = ?").bind(spaceId),
    listItemsQuery(db, spaceId),
  ]);
  const row = space?.results[0] as { warn_days: number } | undefined;
  return row ? { warnDays: row.warn_days, items: (items?.results ?? []) as Item[] } : null;
};

// 読み取り結果の商品名を照らし合わせる商品マスタの代わり（ADR 0007）
export const listItemNames = async (db: D1Database, spaceId: string): Promise<string[]> =>
  (
    await db
      .prepare("SELECT DISTINCT name FROM items WHERE space_id = ?")
      .bind(spaceId)
      .all<{ name: string }>()
  ).results.map((row) => row.name);

export const insertItem = async (
  db: D1Database,
  spaceId: string,
  input: ItemInput,
): Promise<Item> => {
  const item: Item = { id: crypto.randomUUID(), ...input, created_at: new Date().toISOString() };
  await db
    .prepare(
      "INSERT INTO items (id, space_id, name, expires_on, kind, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(item.id, spaceId, item.name, item.expires_on, item.kind, item.memo, item.created_at)
    .run();
  return item;
};

// 送られた項目だけを 1 文で書き換える（共有中の別端末の同時編集を上書きしない）。memo は null で消せるので送られたかを別に渡す
export const updateItem = (
  db: D1Database,
  spaceId: string,
  id: string,
  patch: ItemPatch,
): Promise<Item | null> =>
  db
    .prepare(
      `UPDATE items SET
        name = COALESCE(?1, name),
        expires_on = COALESCE(?2, expires_on),
        kind = COALESCE(?3, kind),
        memo = CASE WHEN ?4 THEN ?5 ELSE memo END
      WHERE id = ?6 AND space_id = ?7
      RETURNING id, name, expires_on, kind, memo, created_at`,
    )
    .bind(
      patch.name ?? null,
      patch.expires_on ?? null,
      patch.kind ?? null,
      "memo" in patch ? 1 : 0,
      patch.memo ?? null,
      id,
      spaceId,
    )
    .first<Item>();

export const deleteItem = async (db: D1Database, spaceId: string, id: string): Promise<boolean> =>
  (await db.prepare("DELETE FROM items WHERE id = ? AND space_id = ?").bind(id, spaceId).run()).meta
    .changes > 0;

export const getItem = (db: D1Database, spaceId: string, id: string): Promise<Item | null> =>
  db
    .prepare(
      "SELECT id, name, expires_on, kind, memo, created_at FROM items WHERE id = ? AND space_id = ?",
    )
    .bind(id, spaceId)
    .first<Item>();

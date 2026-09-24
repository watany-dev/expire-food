import { DEFAULT_WARN_DAYS, type Item, type ItemInput, type ItemPatch } from "../domain/schema";

// items のクエリは必ず space_id を条件に含める（他スペースのデータに触れない）

export const spaceExists = async (db: D1Database, spaceId: string): Promise<boolean> =>
  (await db.prepare("SELECT 1 FROM spaces WHERE id = ?").bind(spaceId).first()) !== null;

export const createSpace = async (db: D1Database, spaceId: string): Promise<void> => {
  await db
    .prepare("INSERT INTO spaces (id, created_at) VALUES (?, ?)")
    .bind(spaceId, new Date().toISOString())
    .run();
};

export const getWarnDays = async (db: D1Database, spaceId: string): Promise<number> =>
  (await db
    .prepare("SELECT warn_days FROM spaces WHERE id = ?")
    .bind(spaceId)
    .first<number>("warn_days")) ?? DEFAULT_WARN_DAYS;

export const setWarnDays = async (
  db: D1Database,
  spaceId: string,
  warnDays: number,
): Promise<void> => {
  await db.prepare("UPDATE spaces SET warn_days = ? WHERE id = ?").bind(warnDays, spaceId).run();
};

export const listItems = async (db: D1Database, spaceId: string): Promise<Item[]> =>
  (
    await db
      .prepare(
        "SELECT id, name, expires_on, kind, memo, created_at FROM items WHERE space_id = ? ORDER BY expires_on, created_at, id",
      )
      .bind(spaceId)
      .all<Item>()
  ).results;

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

-- Migration number: 0002 	 商品を食事・菓子・酒などに分けるタグ（ADR 0011）
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (space_id, name)
);

ALTER TABLE items ADD COLUMN tag_id TEXT REFERENCES tags(id) ON DELETE SET NULL;

-- タグの削除（ON DELETE SET NULL）で items を全件走査しない
CREATE INDEX idx_items_tag ON items(tag_id);

-- Snapshot storage moves from per-topic to per-chapter.
--
-- A chapter is edited as ONE tldraw editor whose native pages ARE the topics
-- (page id = 'page:' || topic id, kept in sync by the app). tldraw's
-- getSnapshot() therefore serializes every page, its camera and the session
-- state as a single store snapshot, so it is persisted once per chapter.

DROP TRIGGER IF EXISTS topic_canvas_touch;
DROP TRIGGER IF EXISTS topics_create_canvas;
DROP TABLE IF EXISTS topic_canvas;

CREATE TABLE chapter_canvas (
  chapter_id      TEXT PRIMARY KEY REFERENCES chapters (id) ON DELETE CASCADE,
  snapshot        TEXT NOT NULL DEFAULT '{}',           -- JSON from getSnapshot(editor.store)
  snapshot_format INTEGER NOT NULL DEFAULT 1,           -- bump when the app changes how it stores snapshots
  tldraw_version  TEXT,                                 -- tldraw version that wrote the snapshot
  shape_count     INTEGER NOT NULL DEFAULT 0,
  byte_size       INTEGER NOT NULL DEFAULT 0,           -- length of snapshot in bytes
  saved_at        INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);

-- Saving the canvas marks the chapter and notebook as edited.
CREATE TRIGGER chapter_canvas_touch
AFTER UPDATE OF snapshot ON chapter_canvas
BEGIN
  UPDATE chapter_canvas SET saved_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE chapter_id = NEW.chapter_id;
  UPDATE chapters  SET updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = NEW.chapter_id;
  UPDATE notebooks SET updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = (SELECT notebook_id FROM chapters WHERE id = NEW.chapter_id);
END;

-- The first save is an INSERT, so it needs its own trigger.
CREATE TRIGGER chapter_canvas_touch_insert
AFTER INSERT ON chapter_canvas
BEGIN
  UPDATE chapters  SET updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = NEW.chapter_id;
  UPDATE notebooks SET updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = (SELECT notebook_id FROM chapters WHERE id = NEW.chapter_id);
END;

-- v_topics no longer carries canvas metadata (it lives in the chapter snapshot).
DROP VIEW IF EXISTS v_topics;
CREATE VIEW v_topics AS
SELECT t.id, t.chapter_id, t.name, t.position, t.is_pinned, t.last_opened_at,
       t.created_at, t.updated_at AS last_edited_at,
       c.notebook_id, c.canvas_type, c.page_width, c.page_height, c.scroll_width, c.background
FROM topics t
JOIN chapters c ON c.id = t.chapter_id AND c.deleted_at IS NULL
JOIN notebooks n ON n.id = c.notebook_id AND n.deleted_at IS NULL
WHERE t.deleted_at IS NULL;

PRAGMA user_version = 2;   -- increment with every migration

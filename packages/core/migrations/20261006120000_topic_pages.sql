-- Multi-page topics for 'page' chapters.
--
-- In a 'page' chapter a topic is a document of pages (like a word
-- processor): every tldraw page maps to one topic_pages row
-- (tldraw page id = 'page:' || topic_pages.id). 'infinite' chapters keep
-- one tldraw page per topic as before.

CREATE TABLE topic_pages (
  id         TEXT PRIMARY KEY,
  topic_id   TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);

CREATE INDEX idx_topic_pages_topic ON topic_pages (topic_id, position);

-- Adding, renaming, reordering or removing a page marks its topic,
-- chapter and notebook as edited.
CREATE TRIGGER topic_pages_touch
AFTER INSERT ON topic_pages
BEGIN
  UPDATE topics    SET updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = NEW.topic_id;
  UPDATE chapters  SET updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = (SELECT chapter_id FROM topics WHERE id = NEW.topic_id);
  UPDATE notebooks SET updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = (SELECT c.notebook_id FROM chapters c
                 JOIN topics t ON t.chapter_id = c.id WHERE t.id = NEW.topic_id);
END;

PRAGMA user_version = 3;   -- increment with every migration

CREATE TABLE subjects (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    subtitle    TEXT,
    cover       TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
);

CREATE TABLE notebooks (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    subtitle    TEXT,
    cover       TEXT,
    icon        TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
);

CREATE TABLE topics (
    id          TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
);

CREATE TABLE pages (
    id          TEXT PRIMARY KEY,
    topic_id    TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    width       REAL NOT NULL,
    height      REAL NOT NULL,
    orientation TEXT NOT NULL DEFAULT 'portrait',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
);

CREATE TABLE page_content (
    page_id     TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    content     TEXT NOT NULL
);

CREATE INDEX idx_notebooks_subject ON notebooks(subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_topics_notebook   ON topics(notebook_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_pages_topic       ON pages(topic_id)       WHERE deleted_at IS NULL;

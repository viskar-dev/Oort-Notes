-- UI presets: user-created canvas presets (toolbar layout, colors, fonts,
-- sizes) made in global settings and applied to chapters.
--
-- config is a JSON document owned by the frontend:
-- {
--   toolbar: [{ id: 'select', visible: true }, ...],   // order + visibility
--   colors:  { hidden: ['grey', ...] },                 // color ids to hide
--   fonts:   { default: 'draw' | 'sans' | 'serif' | 'mono' },
--   sizes:   { s: 18, m: 24, l: 36 }                    // px meanings for S/M/L
-- }

CREATE TABLE ui_presets (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  config     TEXT NOT NULL DEFAULT '{}',  -- JSON blob, validated client-side
  created_at INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
);

-- chapters remember which preset they were created with
ALTER TABLE chapters ADD COLUMN ui_preset_id TEXT REFERENCES ui_presets (id) ON DELETE SET NULL;

PRAGMA user_version = 4;   -- increment with every migration

export interface Notebook {
  id: string;
  name: string;
  label: string | null;
  description: string | null;
  icon: string | null;
  is_favorite: boolean;
  position: number;
  last_opened_at: number | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
  chapters_count: number;
  topics_count: number;
}

export type NotebookFilter = 'all' | 'recent' | 'favorites' | 'archived';
export type NotebookSort = 'edited' | 'opened' | 'name';

export type CanvasType = 'infinite' | 'page' | 'scroll';

export interface Chapter {
  id: string;
  notebook_id: string;
  name: string;
  canvas_type: CanvasType;
  page_preset_id: string | null;
  ui_preset_id: string | null;
  page_width: number | null;
  page_height: number | null;
  scroll_width: number | null;
  background: string;
  position: number;
  created_at: number;
  updated_at: number;
  topics_count: number;
}

export interface PagePreset {
  id: string;
  name: string;
  category: 'paper' | 'ratio' | 'custom';
  size_label: string;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape' | 'square';
  is_builtin: boolean;
  sort_order: number;
  created_at: number;
}

export interface CreateChapterOptions {
  pagePresetId?: string;
  uiPresetId?: string;
  pageWidth?: number;
  pageHeight?: number;
  scrollWidth?: number;
  background?: string;
}

export interface Topic {
  id: string;
  chapter_id: string;
  name: string;
  position: number;
  is_pinned: boolean;
  last_opened_at: number | null;
  created_at: number;
  updated_at: number;
}

/** The output of tldraw's getSnapshot(editor.store): one snapshot per chapter
 * carrying every page (topic), its camera and the session state. */
export type TopicSnapshot = Record<string, unknown>;

export interface ChapterCanvas {
  chapter_id: string;
  snapshot: TopicSnapshot;
  snapshot_format: number;
  tldraw_version: string | null;
  shape_count: number;
  byte_size: number;
  saved_at: number;
}

export interface TopicPatch {
  name?: string;
  position?: number;
}

/** One page of a multi-page topic ('page' chapters). */
export interface TopicPage {
  id: string;
  topic_id: string;
  name: string;
  position: number;
  created_at: number;
  updated_at: number;
}

/** A user-created canvas preset made in global settings. `config` is owned
 * by the frontend (toolbar layout, colors, fonts, sizes). */
export interface UiPreset {
  id: string;
  name: string;
  config: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface UiPresetPatch {
  name?: string;
  config?: Record<string, unknown>;
}

// ---------- Google Drive backup ----------

/** Connection state of the Google account (never includes tokens). */
export interface GoogleStatus {
  connected: boolean;
  email: string | null;
  configured: boolean;
}

/** Same shape as GoogleStatus; what googleConnect resolves with on desktop. */
export type GoogleConnectResult = GoogleStatus;

/** OAuth client credentials (secret is write-only, never sent back). */
export interface GoogleConfigView {
  client_id: string | null;
  has_secret: boolean;
}

export interface BackupSettings {
  enabled: boolean;
  interval_days: number;
  last_backup_at: number | null;
}

/** Drives the backup card: `workspace_empty` offers the import flow on a
 * fresh install, `dirty` means something changed since the last upload. */
export interface BackupStatus {
  workspace_empty: boolean;
  dirty: boolean;
}

/** The archive in the app data folder, for the import offer. */
export interface DriveBackupInfo {
  has_backup: boolean;
  file_name: string | null;
  size_bytes: number | null;
  created_time: string | null;
}

export interface BackupRun {
  file_name: string;
  drive_file_id: string;
  size_bytes: number;
  counts: Record<string, number>;
}

export interface RestoreResult {
  notebooks: number;
  chapters: number;
  topics: number;
  topic_pages: number;
  chapter_canvas: number;
  ui_presets: number;
  tags: number;
  topic_tags: number;
}

export interface Transport {
  ping(): Promise<string>;

  listUiPresets(): Promise<UiPreset[]>;
  loadUiPreset(id: string): Promise<UiPreset>;
  createUiPreset(name: string, config: Record<string, unknown>): Promise<UiPreset>;
  updateUiPreset(id: string, patch: UiPresetPatch): Promise<UiPreset>;
  deleteUiPreset(id: string): Promise<void>;

  listNotebooks(filter?: NotebookFilter, sort?: NotebookSort, q?: string): Promise<Notebook[]>;
  updateNotebookFlags(
    id: string,
    flags: { name?: string; isFavorite?: boolean; archived?: boolean },
  ): Promise<Notebook>;
  loadNotebook(id: string): Promise<Notebook>;
  createNotebook(
    name: string,
    label?: string,
    description?: string,
    icon?: string,
  ): Promise<Notebook>;
  deleteNotebook(id: string): Promise<void>;

  listPagePresets(): Promise<PagePreset[]>;
  listChapters(notebookId: string): Promise<Chapter[]>;
  loadChapter(id: string): Promise<Chapter>;
  createChapter(
    notebookId: string,
    name: string,
    canvasType: CanvasType,
    options?: CreateChapterOptions,
  ): Promise<Chapter>;
  deleteChapter(id: string): Promise<void>;
  updateChapter(id: string, name: string): Promise<Chapter>;
  setChapterUiPreset(id: string, uiPresetId: string | null): Promise<Chapter>;

  listTopics(chapterId: string): Promise<Topic[]>;
  loadTopic(id: string): Promise<Topic>;
  createTopic(chapterId: string, name: string, id?: string): Promise<Topic>;
  updateTopic(id: string, patch: TopicPatch): Promise<Topic>;
  deleteTopic(id: string): Promise<void>;
  listTopicPages(topicId: string): Promise<TopicPage[]>;
  createTopicPage(topicId: string, name: string, id?: string): Promise<TopicPage>;
  updateTopicPage(id: string, patch: TopicPatch): Promise<TopicPage>;
  deleteTopicPage(id: string): Promise<void>;
  loadChapterCanvas(chapterId: string): Promise<ChapterCanvas>;
  saveChapterCanvas(
    chapterId: string,
    snapshot: TopicSnapshot,
    tldrawVersion: string | null,
  ): Promise<void>;

  googleStatus(): Promise<GoogleStatus>;
  /** Web: navigates the browser to the server's consent redirect and never
   * resolves (the page reloads via the callback). Desktop: opens the system
   * browser, waits for the loopback redirect and resolves when connected. */
  googleConnect(): Promise<GoogleConnectResult>;
  googleDisconnect(): Promise<void>;
  getGoogleConfig(): Promise<GoogleConfigView>;
  setGoogleConfig(clientId: string | null, clientSecret: string | null): Promise<void>;
  getBackupSettings(): Promise<BackupSettings>;
  updateBackupSettings(settings: BackupSettings): Promise<BackupSettings>;
  /** `null` when the workspace is still empty (nothing was uploaded). */
  runBackup(): Promise<BackupRun | null>;
  getBackupStatus(): Promise<BackupStatus>;
  getDriveBackup(): Promise<DriveBackupInfo>;
  importBackup(): Promise<RestoreResult>;
}

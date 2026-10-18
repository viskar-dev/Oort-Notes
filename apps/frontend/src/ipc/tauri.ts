import { invoke } from '@tauri-apps/api/core';
import type {
  Chapter,
  ChapterCanvas,
  Notebook,
  NotebookFilter,
  NotebookSort,
  PagePreset,
  Topic,
  TopicPage,
  TopicSnapshot,
  Transport,
  CanvasType,
  CreateChapterOptions,
  TopicPatch,
  UiPreset,
  UiPresetPatch,
  GoogleStatus,
  GoogleConnectResult,
  GoogleConfigView,
  BackupSettings,
  BackupEntry,
  BackupRun,
  RestoreResult,
} from './transport';

export const tauriTransport: Transport = {
  ping: () => invoke<string>('ping'),

  listNotebooks: (filter: NotebookFilter = 'all', sort: NotebookSort = 'edited', q?: string) =>
    invoke<Notebook[]>('list_notebooks', { filter, sort, q }),
  updateNotebookFlags: (id, flags: { name?: string; isFavorite?: boolean; archived?: boolean }) =>
    invoke<Notebook>('update_notebook_flags', {
      id,
      name: flags.name,
      isFavorite: flags.isFavorite,
      archived: flags.archived,
    }),
  loadNotebook: (id) => invoke<Notebook>('load_notebook', { id }),
  createNotebook: (name, label, description, icon) =>
    invoke<Notebook>('create_notebook', { name, label, description, icon }),
  deleteNotebook: (id) => invoke<void>('delete_notebook', { id }),

  listPagePresets: () => invoke<PagePreset[]>('list_page_presets'),
  listUiPresets: () => invoke<UiPreset[]>('list_ui_presets'),
  loadUiPreset: (id) => invoke<UiPreset>('load_ui_preset', { id }),
  createUiPreset: (name, config) => invoke<UiPreset>('create_ui_preset', { name, config }),
  updateUiPreset: (id, p: UiPresetPatch) =>
    invoke<UiPreset>('update_ui_preset', { id, name: p.name, config: p.config }),
  deleteUiPreset: (id) => invoke<void>('delete_ui_preset', { id }),
  listChapters: (notebookId) => invoke<Chapter[]>('list_chapters', { notebookId }),
  loadChapter: (id) => invoke<Chapter>('load_chapter', { id }),
  createChapter: (notebookId, name, canvasType: CanvasType, options: CreateChapterOptions = {}) =>
    invoke<Chapter>('create_chapter', {
      notebookId,
      name,
      canvasType,
      pagePresetId: options.pagePresetId,
      pageWidth: options.pageWidth,
      pageHeight: options.pageHeight,
      scrollWidth: options.scrollWidth,
      background: options.background,
      uiPresetId: options.uiPresetId,
    }),
  deleteChapter: (id) => invoke<void>('delete_chapter', { id }),
  updateChapter: (id, name) => invoke<Chapter>('update_chapter', { id, name }),
  setChapterUiPreset: (id, uiPresetId) =>
    invoke<Chapter>('set_chapter_ui_preset', { id, uiPresetId }),

  listTopics: (chapterId) => invoke<Topic[]>('list_topics', { chapterId }),
  loadTopic: (id) => invoke<Topic>('load_topic', { id }),
  createTopic: (chapterId, name, id) => invoke<Topic>('create_topic', { chapterId, name, id }),
  updateTopic: (id, patch: TopicPatch) => invoke<Topic>('update_topic', { id, ...patch }),
  deleteTopic: (id) => invoke<void>('delete_topic', { id }),
  listTopicPages: (topicId) => invoke<TopicPage[]>('list_topic_pages', { topicId }),
  createTopicPage: (topicId, name, id) =>
    invoke<TopicPage>('create_topic_page', { topicId, name, id }),
  updateTopicPage: (id, patch: TopicPatch) =>
    invoke<TopicPage>('update_topic_page', { id, ...patch }),
  deleteTopicPage: (id) => invoke<void>('delete_topic_page', { id }),
  loadChapterCanvas: (chapterId) => invoke<ChapterCanvas>('load_chapter_canvas', { chapterId }),
  saveChapterCanvas: (chapterId, snapshot: TopicSnapshot, tldrawVersion) =>
    invoke<void>('save_chapter_canvas', { chapterId, snapshot, tldrawVersion }),

  // ---------- Google Drive backup ----------
  googleStatus: () => invoke<GoogleStatus>('google_status'),
  googleConnect: () => invoke<GoogleConnectResult>('google_connect'),
  googleDisconnect: () => invoke<void>('google_disconnect'),
  getGoogleConfig: () => invoke<GoogleConfigView>('google_get_config'),
  setGoogleConfig: (clientId, clientSecret) =>
    invoke<void>('google_set_config', { clientId, clientSecret }),
  getBackupSettings: () => invoke<BackupSettings>('get_backup_settings'),
  updateBackupSettings: (settings) => invoke<BackupSettings>('update_backup_settings', { settings }),
  runBackup: () => invoke<BackupRun>('run_backup_now'),
  listBackups: () => invoke<BackupEntry[]>('list_backups'),
  restoreBackup: (driveFileId) => invoke<RestoreResult>('restore_backup', { driveFileId }),
};

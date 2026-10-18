import type {
  Chapter,
  ChapterCanvas,
  Notebook,
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
  NotebookFilter,
  NotebookSort,
  GoogleStatus,
  GoogleConnectResult,
  GoogleConfigView,
  BackupSettings,
  BackupEntry,
  BackupRun,
  RestoreResult,
} from './transport';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postVoid(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export const httpTransport: Transport = {
  async ping() {
    const data = await get<{ message: string }>('/api/ping');
    return data.message;
  },

  listNotebooks: (filter: NotebookFilter = 'all', sort: NotebookSort = 'edited', q?: string) => {
    const params = new URLSearchParams({ filter, sort });
    if (q) params.set('q', q);
    return get<Notebook[]>(`/api/notebooks?${params}`);
  },
  updateNotebookFlags: (id, flags: { name?: string; isFavorite?: boolean; archived?: boolean }) =>
    patch<Notebook>(`/api/notebooks/${id}/flags`, {
      name: flags.name ?? null,
      is_favorite: flags.isFavorite ?? null,
      archived: flags.archived ?? null,
    }),
  loadNotebook: (id) => get<Notebook>(`/api/notebooks/${id}`),
  createNotebook: (name, label, description, icon) =>
    post<Notebook>('/api/notebooks', { name, label, description, icon }),
  deleteNotebook: (id) => del(`/api/notebooks/${id}`),

  listPagePresets: () => get<PagePreset[]>('/api/page-presets'),
  listUiPresets: () => get<UiPreset[]>('/api/ui-presets'),
  loadUiPreset: (id) => get<UiPreset>(`/api/ui-presets/${id}`),
  createUiPreset: (name, config) => post<UiPreset>('/api/ui-presets', { name, config }),
  updateUiPreset: (id, p: UiPresetPatch) =>
    patch<UiPreset>(`/api/ui-presets/${id}`, {
      name: p.name ?? null,
      config: p.config ?? null,
    }),
  deleteUiPreset: (id) => del(`/api/ui-presets/${id}`),
  listChapters: (notebookId) => get<Chapter[]>(`/api/notebooks/${notebookId}/chapters`),
  loadChapter: (id) => get<Chapter>(`/api/chapters/${id}`),
  createChapter: (notebookId, name, canvasType: CanvasType, options: CreateChapterOptions = {}) =>
    post<Chapter>('/api/chapters', {
      notebook_id: notebookId,
      name,
      canvas_type: canvasType,
      page_preset_id: options.pagePresetId ?? null,
      page_width: options.pageWidth ?? null,
      page_height: options.pageHeight ?? null,
      scroll_width: options.scrollWidth ?? null,
      background: options.background ?? null,
      ui_preset_id: options.uiPresetId ?? null,
    }),
  deleteChapter: (id) => del(`/api/chapters/${id}`),
  updateChapter: (id, name) => patch<Chapter>(`/api/chapters/${id}`, { name }),
  setChapterUiPreset: (id, uiPresetId) =>
    patch<Chapter>(`/api/chapters/${id}/ui-preset`, { ui_preset_id: uiPresetId }),

  listTopics: (chapterId) => get<Topic[]>(`/api/chapters/${chapterId}/topics`),
  loadTopic: (id) => get<Topic>(`/api/topics/${id}`),
  createTopic: (chapterId, name, id) =>
    post<Topic>('/api/topics', { chapter_id: chapterId, name, id }),
  updateTopic: (id, p: TopicPatch) =>
    patch<Topic>(`/api/topics/${id}`, { name: p.name ?? null, position: p.position ?? null }),
  deleteTopic: (id) => del(`/api/topics/${id}`),
  listTopicPages: (topicId) => get<TopicPage[]>(`/api/topics/${topicId}/pages`),
  createTopicPage: (topicId, name, id) =>
    post<TopicPage>(`/api/topics/${topicId}/pages`, { name, id }),
  updateTopicPage: (id, p: TopicPatch) =>
    patch<TopicPage>(`/api/topic-pages/${id}`, {
      name: p.name ?? null,
      position: p.position ?? null,
    }),
  deleteTopicPage: (id) => del(`/api/topic-pages/${id}`),
  loadChapterCanvas: (chapterId) => get<ChapterCanvas>(`/api/chapters/${chapterId}/canvas`),
  saveChapterCanvas: (chapterId, snapshot: TopicSnapshot, tldrawVersion) =>
    fetch(`${BASE}/api/chapters/${chapterId}/canvas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot, tldraw_version: tldrawVersion }),
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),

  // ---------- Google Drive backup ----------
  googleStatus: () => get<GoogleStatus>('/api/google/status'),
  // web flow: full navigation to the consent screen; the callback bounces
  // back to /settings/backup and the page reacts to ?google=connected
  googleConnect: () => {
    window.location.assign(`${BASE}/api/google/connect`);
    return new Promise<GoogleConnectResult>(() => {}); // page navigates away
  },
  googleDisconnect: () => postVoid('/api/google/disconnect', {}),
  getGoogleConfig: () => get<GoogleConfigView>('/api/google/config'),
  setGoogleConfig: (clientId, clientSecret) =>
    put<void>('/api/google/config', { client_id: clientId, client_secret: clientSecret }),
  getBackupSettings: () => get<BackupSettings>('/api/backup/settings'),
  updateBackupSettings: (settings) => put<BackupSettings>('/api/backup/settings', settings),
  runBackup: () => post<BackupRun>('/api/backup/run', {}),
  listBackups: () => get<BackupEntry[]>('/api/backup/list'),
  restoreBackup: (driveFileId) => post<RestoreResult>('/api/backup/restore', { drive_file_id: driveFileId }),
};

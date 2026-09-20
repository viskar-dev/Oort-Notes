// src/ipc/index.ts
import { isTauri } from '@tauri-apps/api/core';
import { tauriTransport } from './tauri';
import { httpTransport } from './http';

export const api = isTauri() ? tauriTransport : httpTransport;

import { isTauri } from '@tauri-apps/api/core';
import { tauriTransport } from './tauri';
import { httpTransport } from './http';
import type { Transport } from './transport';

export const api: Transport = isTauri() ? tauriTransport : httpTransport;
export * from './transport';
export * from './errors';

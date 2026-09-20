import { invoke } from '@tauri-apps/api/core';
import type { Transport } from './transport';

export const tauriTransport: Transport = {
  async ping() {
    return invoke<string>('ping_command');
  },
};

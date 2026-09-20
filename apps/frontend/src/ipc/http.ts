import type { Transport } from './transport';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const httpTransport: Transport = {
  async ping() {
    const res = await fetch(`${BASE}/api/ping`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.message;
  },
};

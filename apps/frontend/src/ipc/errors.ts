export type TransportError = {
  code: string;
  message: string;
};

export function toTransportError(err: unknown): TransportError {
  if (typeof err === 'string') {
    return { code: 'Unknown', message: err };
  }
  if (err instanceof Error) {
    return { code: 'Unknown', message: err.message };
  }
  return { code: 'Unknown', message: String(err) };
}

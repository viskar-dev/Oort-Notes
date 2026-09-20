export interface Transport {
  ping(): Promise<string>;
}

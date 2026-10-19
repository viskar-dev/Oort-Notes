export { cn } from "cn";

/** Uniform message for a caught API/transport error. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

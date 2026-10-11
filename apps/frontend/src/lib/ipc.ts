/// Compatibility bridge: several files were moved to `@/lib/ipc` while the
/// implementation still lives in `@/ipc`. Re-export everything so both
/// specifiers resolve to one module.
export * from '../ipc';
export { api } from '../ipc';

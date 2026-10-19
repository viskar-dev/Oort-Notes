import type { PresetFont } from './catalog';

/** CSS font stacks for the sample texts and previews. */
export const FONT_CSS: Record<PresetFont, string> = {
  draw: "'Caveat', 'Segoe Print', cursive",
  sans: 'system-ui, sans-serif',
  serif: 'Georgia, serif',
  mono: 'ui-monospace, monospace',
};

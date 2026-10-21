export type ToolId =
  | 'select'
  | 'hand'
  | 'draw'
  | 'eraser'
  | 'arrow'
  | 'text'
  | 'note'
  | 'image'
  | 'shape'
  | 'line'
  | 'highlight'
  | 'laser'
  | 'frame'
  | 'components';

export type PresetFont = 'draw' | 'sans' | 'serif' | 'mono';

/** The JSON document stored in ui_presets.config. */
export interface ToolbarItemConfig {
  id: ToolId;
  visible: boolean;
}

export interface PresetConfig {
  toolbar: ToolbarItemConfig[];
  colors: { hidden: string[]; overrides: Record<string, string> };
  fonts: { default: PresetFont };
  /** px meanings of the text styles; the base paragraph is 24px at scale 1 */
  sizes: { h1: number; h2: number; h3: number; p: number };
  [key: string]: unknown;
}

/** The tool catalog, in default order. Ids map to tldraw tool ids. */
export const TOOL_CATALOG: { id: ToolId; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'hand', label: 'Hand' },
  { id: 'draw', label: 'Draw' },
  { id: 'eraser', label: 'Eraser' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'text', label: 'Text' },
  { id: 'note', label: 'Sticky note' },
  { id: 'image', label: 'Image' },
  { id: 'shape', label: 'Shape' },
  { id: 'line', label: 'Line' },
  { id: 'highlight', label: 'Highlighter' },
  { id: 'laser', label: 'Laser pointer' },
  { id: 'frame', label: 'Frame' },
  { id: 'components', label: 'Components' },
];

/** All default palette color ids (tldraw's DefaultColorStyle values). */
export const ALL_COLORS = [
  'black',
  'grey',
  'light-violet',
  'violet',
  'blue',
  'light-blue',
  'yellow',
  'orange',
  'green',
  'light-green',
  'red',
  'light-red',
] as const;

export const FONT_LABELS: Record<PresetFont, string> = {
  draw: 'Draw (handwritten)',
  sans: 'Sans (clean)',
  serif: 'Serif (classic)',
  mono: 'Mono (code)',
};

/** tldraw's text base font is 24px at scale 1; sizes are px meanings for
 * S/M/L, mapped onto the text shape's scale prop. */
export const TEXT_BASE_PX = 24;

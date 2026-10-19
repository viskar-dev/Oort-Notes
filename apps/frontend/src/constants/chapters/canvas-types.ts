import type { CanvasType } from '@/lib/ipc';

/** Display name per canvas mode (rows, panels, dialogs). */
export const CANVAS_TYPE_LABEL: Record<CanvasType, string> = {
  page: 'Page',
  scroll: 'Scroll',
  infinite: 'Infinite',
};

/** The two selectable canvas modes in the create-chapter dialog. */
export const CANVAS_TYPE_CHOICES = [
  { value: 'infinite', title: 'Infinite', hint: 'Free-form canvas' },
  { value: 'page', title: 'Page', hint: 'Fixed paper size' },
] as const;

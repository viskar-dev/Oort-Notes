import { z } from 'zod';

export const chapterCreateFormSchema = z
  .object({
    name: z.string().trim().min(1, 'A chapter needs a name.'),
    canvasType: z.enum(['infinite', 'page']),
    /** Page preset; validated only when canvasType is 'page'. */
    presetId: z.string(),
    /** '' selects tldraw defaults. */
    uiPresetId: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.canvasType === 'page' && values.presetId.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['presetId'],
        message: 'Choose a page size.',
      });
    }
  });

export type ChapterCreateFormValues = z.infer<typeof chapterCreateFormSchema>;

import { z } from 'zod';

export const topicCreateFormSchema = z.object({
  name: z.string().trim().min(1, 'The topic needs a name.'),
});

export type TopicCreateFormValues = z.infer<typeof topicCreateFormSchema>;

import { z } from "zod";

export const questionSchema = z.object({
  id: z.string().min(1).max(40),
  q: z.string().min(1).max(300),
  type: z.enum(["choice", "multi", "rating", "text", "contact"]),
  options: z.array(z.string().min(1).max(120)).max(12).optional(),
  required: z.boolean().optional(),
});
export type PollQuestion = z.infer<typeof questionSchema>;
export const pollSpecSchema = z.object({
  title: z.string().min(1).max(160),
  kind: z.enum(["poll", "feedback", "signup"]).default("poll"),
  description: z.string().max(1000).optional(),
  questions: z.array(questionSchema).min(1).max(15),
});
export type Answer = string | string[] | number | { name?: string; email?: string; phone?: string };

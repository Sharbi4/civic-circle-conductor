import { z } from "zod";

export const questionSchema = z.object({
  id: z.string().min(1).max(40),
  q: z.string().min(1).max(300),
  type: z.enum(["choice", "multi", "rating", "text", "contact"]),
  options: z.array(z.string().min(1).max(120)).max(12).optional(),
  required: z.boolean().optional(),
});
export type PollQuestion = z.infer<typeof questionSchema>;
export const eventLinkSchema = z.object({
  title: z.string().min(1).max(200),
  start: z.string().max(40).optional(),
  end: z.string().max(40).optional(),
  timezone: z.string().max(60).optional(),
  location: z.string().max(300).optional(),
  url: z.string().url().max(500).optional(),
  image: z.string().url().max(1000).optional(),
});
export type EventLink = z.infer<typeof eventLinkSchema>;
export const pollSpecSchema = z.object({
  title: z.string().min(1).max(160),
  kind: z.enum(["poll", "feedback", "signup"]).default("poll"),
  description: z.string().max(1000).optional(),
  questions: z.array(questionSchema).min(1).max(15),
  event: eventLinkSchema.optional(),
});
export type Answer = string | string[] | number | { name?: string; email?: string; phone?: string };

/** Standard RSVP questions for an event sign-up form. */
export const RSVP_QUESTIONS: PollQuestion[] = [
  { id: "q1", q: "Will you be there?", type: "choice", options: ["Yes, I'll be there", "Maybe", "Can't make it"], required: true },
  { id: "q2", q: "How many people are coming (including you)?", type: "choice", options: ["1", "2", "3", "4", "5+"] },
  { id: "q3", q: "Your contact info", type: "contact", required: true },
  { id: "q4", q: "Anything we should know? (accessibility, dietary needs, questions)", type: "text" },
];

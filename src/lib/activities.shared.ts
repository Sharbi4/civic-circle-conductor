import { z } from "zod";

export const activitySchema = z.object({
  title: z.string().trim().min(1).max(200), goal: z.string().max(4000).default(""), audience: z.string().max(2000).default(""),
  community_input: z.string().max(6000).default(""), proposed_date: z.string().max(100).default(""), location: z.string().max(1000).default(""),
  description: z.string().max(6000).default(""), budget: z.number().min(0).max(100000000).default(0), constraints: z.string().max(4000).default(""),
  status: z.enum(["planning", "ready", "active", "completed", "archived"]).default("planning"),
  registration_url: z.union([z.literal(""), z.string().url().refine((s) => /^https?:\/\//.test(s))]).default(""),
  attendance: z.number().int().min(0).default(0), follow_up: z.string().max(6000).default(""),
  lessons: z.record(z.string(), z.string().max(4000)).default({}),
});
export type ActivityInput = z.infer<typeof activitySchema>;
export function planSnapshot(a: Pick<ActivityInput, "goal" | "audience" | "proposed_date" | "location" | "description" | "budget" | "constraints">) {
  return { goal: a.goal, audience: a.audience, proposed_date: a.proposed_date, location: a.location, description: a.description, budget: a.budget, constraints: a.constraints };
}
export function automationScope(level: string, reason?: string | null) {
  if (reason) return "Automation paused — background reviews and scheduled drafts are on hold. Manual chat and approved actions remain available.";
  if (level === "manual") return "On request — no proactive reviews. Previously scheduled tasks still prepare drafts; public actions require approval.";
  if (level === "assisted") return "Suggest next steps — reviews every five minutes; proposed work waits for approval. Scheduled tasks prepare drafts only.";
  return "Research & prepare — reviews every five minutes; Civi may research and prepare work. Posts, submissions, bookings and payments still require approval.";
}
export function automationPermissions(level: string, paused: boolean) {
  return { review: !paused && level !== "manual", research: !paused && level === "auto", scheduledDrafts: !paused, publishWithoutApproval: false };
}
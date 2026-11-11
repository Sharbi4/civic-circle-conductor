import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startLinkedInConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const request = getRequest();
    if (!request) throw new Error("LinkedIn connect must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const { startDirectLinkedIn } = await import('./linkedinDirect.server');
    const { data: org } = await context.supabase.from('organizations').select('linkedin_org_id').eq('user_id', context.userId).maybeSingle();
    return startDirectLinkedIn(context.userId, sandboxHost ? `https://${sandboxHost}` : url.origin, Boolean(org?.linkedin_org_id));
  });

export const completeLinkedInConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ state: z.string().regex(/^[a-f0-9]{64}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { completeDirectLinkedIn } = await import('./linkedinDirect.server');
    const { accountName } = await completeDirectLinkedIn(context.userId, data.state);

    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", "LinkedIn Agent").maybeSingle();
    let threadId = existing?.id as string | undefined;
    if (!threadId) {
      const { data: t, error } = await supabase.from("threads").insert({ user_id: userId, kind: "side", title: "LinkedIn Agent" }).select("id").single();
      if (error) throw error;
      threadId = t.id;
      await supabase.from("messages").insert({
        thread_id: threadId, user_id: userId, role: "assistant",
        content: LINKEDIN_WELCOME(accountName),
      });
    }
    return { accountName, threadId };
  });

export const getLinkedInStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getDirectLinkedInConnection, directLinkedInConfigured } = await import('./linkedinDirect.server');
    const { linkedInTokenUsable, linkedInProfilePhoto } = await import('./linkedinDirect.shared');
    const { getConnectionForUser } = await import('./appUserConnections.server');
    const c = await getDirectLinkedInConnection(context.userId);
    const legacy = c ? null : await getConnectionForUser(context.userId, 'linkedin');
    const { data: org } = await context.supabase.from("organizations").select("linkedin_org_id").eq("user_id", context.userId).maybeSingle();
    const connected = Boolean(c && linkedInTokenUsable(c.token));
    return { connected, needsReconnect: Boolean(legacy || (c && !connected)), configured: directLinkedInConfigured(), accountName: c?.accountName ?? legacy?.accountName ?? null, orgPageId: org?.linkedin_org_id ?? null, profilePhoto: connected ? linkedInProfilePhoto(c?.token.picture) : null };
  });

export const disconnectLinkedIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnectDirectLinkedIn } = await import('./linkedinDirect.server');
    const { deleteConnectionForUser } = await import('./appUserConnections.server');
    await disconnectDirectLinkedIn(context.userId);
    await deleteConnectionForUser(context.userId, 'linkedin');
    return { ok: true };
  });

/** Saves the LinkedIn company page ID that events are organized under. */
export const setLinkedInOrgPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orgPageId: z.string().trim().regex(/^\d{1,20}$/, "Use the number from your page's admin URL").or(z.literal("")) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("organizations")
      .update({ linkedin_org_id: data.orgPageId || null }).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Runs an approved LinkedIn action: member post, event create+publish, or event edit. */
export const runLinkedInApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ approvalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { executeLinkedinApproval } = await import("./linkedinApproval.server");
    const { executeApproval } = await import("./approvals.server");
    return executeApproval(context.supabase, context.userId, data.approvalId, () => executeLinkedinApproval(context.supabase, context.userId, data.approvalId));
  });

export const LINKEDIN_WELCOME = (accountName: string) => `Hi! I'm your **LinkedIn agent**, connected to **${accountName}**. What do you want me to do? Here's what I can take off your plate:

- **Share a post** — announce an event, a win, a volunteer call or a partner shout-out, with a photo if you'd like
- **Create a LinkedIn event** — with a cover image, then promote it
- **Post on a schedule** — weekly updates, monthly impact recaps or reminders before each event
- **Grow partnerships** — draft outreach-ready posts that spotlight local partners and sponsors

I'd suggest starting with a quick post about what you're working on right now — or just let me know what you need. Nothing goes live without your OK.

[[choices: Share a post | Create a LinkedIn event | Set up a weekly post | Just let me know what you need]]`;

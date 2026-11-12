import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().default(""),
  organization: z.string().trim().min(1).max(300),
  message: z.string().trim().max(1000).optional().default(""),
});

export const submitInfoRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("info_requests").insert({ ...data, phone: data.phone || null, message: data.message || null }).select("id").single();
    if (error || !row) { console.error(error); throw new Error("Couldn't send your request. Please try again."); }
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("info-request-notification", "support@civimeet.com", {
        templateData: data,
        idempotencyKey: `info-request-notification-${row.id}`,
      });
    } catch (e) { console.error("info request email failed", e); }
    return { ok: true };
  });

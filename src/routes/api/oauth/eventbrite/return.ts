import { createFileRoute } from "@tanstack/react-router";
import { LINKEDIN_APP_ORIGINS } from "@/lib/linkedinDirect.shared";

// Eventbrite OAuth landing page. Runs in a popup with no app session, so it
// only parses the one-time code and posts it to the opener window, which
// completes the exchange through an authenticated server function.
export const Route = createFileRoute("/api/oauth/eventbrite/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        // The opener's origin travels through OAuth `state` so the popup can
        // post the code back to the preview even though the redirect lives on
        // the published domain. Only trust our own app origins.
        const state = url.searchParams.get("state") ?? "";
        let targetOrigin = url.origin;
        try {
          const origin = new URL(state).origin;
          if (origin.endsWith(".lovable.app") || LINKEDIN_APP_ORIGINS.includes(origin)) {
            targetOrigin = origin;
          }
        } catch {
          // fall back to this page's own origin
        }

        const result = code
          ? { success: true, connectorId: "eventbrite", code }
          : { success: false, connectorId: "eventbrite", error: error ?? "Eventbrite connect was cancelled" };

        const safeJson = JSON.stringify(result).replace(/<\//g, "<\\/");

        const html = `<!DOCTYPE html>
<html>
<head><title>Finishing Eventbrite connection…</title></head>
<body>
  <p>${result.success ? "Eventbrite connected — you can close this window." : "Connection failed."}</p>
  <script>
    const result = ${safeJson};
    const msg = { type: result.success ? "civiOauthComplete" : "civiOauthFailed", connectorId: result.connectorId, code: result.code ?? null, error: result.error ?? null };
    try{const c=new BroadcastChannel("civi-oauth");c.postMessage(msg);c.close();}catch(e){}
    if (window.opener && window.opener !== window) {
      window.opener.postMessage({
        type: result.success ? "civiOauthComplete" : "civiOauthFailed",
        connectorId: result.connectorId,
        code: result.code ?? null,
        error: result.error ?? null
      }, ${JSON.stringify(targetOrigin)});
    }
    window.close();
  </script>
</body>
</html>`;

        return new Response(html, { headers: { "Content-Type": "text/html" } });
      },
    },
  },
});

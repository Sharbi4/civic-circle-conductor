import { createFileRoute } from "@tanstack/react-router";

// Nextdoor OAuth landing page. Runs in a popup with no app session, so it
// only parses the one-time code and posts it to the opener window, which
// completes the exchange through an authenticated server function.
export const Route = createFileRoute("/api/oauth/nextdoor/return")({
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
          if (origin.endsWith(".lovable.app") || origin === "https://civic-circle-conductor.lovable.app") {
            targetOrigin = origin;
          }
        } catch {
          // fall back to this page's own origin
        }

        const result = code
          ? { success: true, connectorId: "nextdoor", code }
          : { success: false, connectorId: "nextdoor", error: error ?? "Nextdoor connect was cancelled" };

        const safeJson = JSON.stringify(result).replace(/<\//g, "<\\/");

        const html = `<!DOCTYPE html>
<html>
<head><title>Finishing Nextdoor connection…</title></head>
<body>
  <p>${result.success ? "Nextdoor connected — you can close this window." : "Connection failed."}</p>
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

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/x/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const connectorId = url.searchParams.get("connector_id") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const success = url.searchParams.get("success") === "true";
        const error = url.searchParams.get("error");
        const result = success && code
          ? { success: true, connectorId, code }
          : { success: false, connectorId, error: error ?? (success ? "Missing code" : "OAuth failed") };
        const safeJson = JSON.stringify(result).replace(/<\//g, "<\\/");
        const html = `<!DOCTYPE html><html><head><title>Finishing connection…</title></head><body>
<p>${result.success ? "Connection complete, closing…" : "We couldn't connect your account. Close this window and try again."}</p>
<script>
  const result = ${safeJson};
  const message = { type: result.success ? "appUserConnectorOAuthComplete" : "appUserConnectorOAuthFailed", connectorId: result.connectorId, code: result.code ?? null };
  try{const c=new BroadcastChannel("civi-oauth");c.postMessage(message);c.close();}catch(e){}
  if (window.opener && window.opener !== window) window.opener.postMessage(message, window.location.origin);
  window.close();
</script></body></html>`;
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      },
    },
  },
});

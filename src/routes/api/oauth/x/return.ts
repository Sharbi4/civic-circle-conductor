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
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const safeJson = JSON.stringify(result).replace(/<\//g, "<\\/");
        const html = `<!DOCTYPE html><html><head><title>Finishing connection…</title></head><body>
<p>${result.success ? "Connection complete, closing…" : "Failed: " + esc(("error" in result && result.error) || "Unknown error")}</p>
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

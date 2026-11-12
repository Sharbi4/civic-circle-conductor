import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://civimeet.com";
const PATHS = ["/", "/auth", "/terms", "/privacy", "/data-deletion"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const urls = PATHS.map((p) => `  <url><loc>${BASE}${p}</loc></url>`).join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(xml, { headers: { "Content-Type": "application/xml" } });
      },
    },
  },
});

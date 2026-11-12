import { createFileRoute } from "@tanstack/react-router";

// Background job service endpoint. The service signs every call; the library rejects unsigned ones.
async function handle(request: Request): Promise<Response> {
  const { inngestHandler } = await import("@/lib/inngest.server");
  return inngestHandler()(request);
}

export const Route = createFileRoute("/api/public/inngest")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      PUT: ({ request }) => handle(request),
    },
  },
});

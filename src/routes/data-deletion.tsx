import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/data-deletion")({
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s.code === "string" ? s.code.slice(0, 40) : undefined }),
  head: () => ({
    meta: [
      { title: "Data Deletion — Civi Meet" },
      { name: "description", content: "How to delete your data from Civi Meet." },
      { property: "og:title", content: "Data Deletion — Civi Meet" },
      { property: "og:description", content: "How to delete your data from Civi Meet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { code } = Route.useSearch();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-semibold">Data deletion</h1>
      {code && (
        <p className="mt-6 rounded-lg border border-border bg-muted p-4">
          Your deletion request was received. Confirmation code: <strong>{code}</strong>. Civi Meet does not keep data from Facebook linked to your account, so there is nothing further to remove.
        </p>
      )}
      <h2 className="mt-8 text-xl font-semibold">How to delete your data</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6 text-muted-foreground">
        <li>Remove Civi Meet in Facebook: Settings → Apps and Websites → Civi Meet → Remove.</li>
        <li>To delete your Civi Meet account and all organization data (chats, documents, saved logins, connections), send a request through the form on our <Link to="/" className="underline">homepage</Link>. We delete it within 30 days.</li>
      </ol>
      <p className="mt-8 text-sm text-muted-foreground">See also our <Link to="/privacy" className="underline">privacy policy</Link>.</p>
    </main>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Civi Meet — Your AI community organizer" },
      { name: "description", content: "One chat that organizes your movement across every channel." },
      { property: "og:title", content: "Civi Meet — Your AI community organizer" },
      { property: "og:description", content: "One chat that organizes your movement across every channel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
    });
  }, [navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-foreground">
        For nonprofits & campaigns
      </span>
      <h1 className="font-display mt-6 max-w-3xl text-5xl font-bold leading-tight md:text-7xl">
        One chat that organizes your whole community.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted-foreground">
        Civi Meet's AI organizer plans outreach, drafts posts and runs agents for every channel you connect.
      </p>
      <Button asChild size="lg" className="mt-8 rounded-full px-8">
        <Link to="/auth">Get started</Link>
      </Button>
    </main>
  );
}

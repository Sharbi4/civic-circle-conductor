import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InfoRequestForm } from "@/components/landing/InfoRequestForm";
import { StoryScroll } from "@/components/landing/StoryScroll";
import logo from "@/assets/civimeet-logo-dark.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Civi Meet — The AI that organizes your community" },
      { name: "description", content: "Civi, the AI organizer for nonprofits, governments, parties and campaigns: outreach, events, pages and volunteers." },
      { property: "og:title", content: "Civi Meet — The AI that organizes your community" },
      { property: "og:description", content: "Civi organizes outreach, events, pages and volunteers for nonprofits, governments, parties and campaigns, so your team can focus on people." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const PHRASES = [
  { text: "handles your outreach", emoji: "📣" },
  { text: "organizes your events", emoji: "📅" },
  { text: "manages your pages", emoji: "📱" },
  { text: "finds food vendors", emoji: "🌮" },
  { text: "rallies volunteers", emoji: "🙌" },
  { text: "answers your inbox", emoji: "✉️" },
];

function Index() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
    });
  }, [navigate]);

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 2400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("snap-page");
    return () => document.documentElement.classList.remove("snap-page");
  }, []);

  const p = PHRASES[i]!;

  return (
    <div className="dark relative min-h-screen bg-background text-foreground">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 md:px-28">
        <img src={logo} alt="Civi Meet" className="logo-glow h-14 w-auto md:h-16" />
        <Link to="/auth" className="rounded-full bg-secondary px-5 py-2 text-sm font-medium hover:bg-card">
          Log in
        </Link>
      </header>

      <main className="snap-start flex min-h-[100svh] flex-col items-center justify-center px-6 pt-24 pb-10 text-center">
        <h1 className="mt-8 text-5xl font-semibold leading-[1.1] tracking-tight md:text-7xl">
          <span className="inline-flex items-center gap-1">Civi, AI that</span>
          <span className="block min-h-[1.2em]">
            <span key={i} className="animate-phrase inline-block">
              {p.text} <span aria-hidden="true">{p.emoji}</span>
            </span>
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          The organizer for nonprofits, governments, parties and campaigns. Connect your channels and Civi runs the outreach.
        </p>

        <p className="mt-14 text-muted-foreground">Private preview</p>
        <Link
          to="/auth"
          className="mt-4 flex w-full max-w-md items-center justify-between rounded-3xl bg-card px-6 py-4 text-left transition-colors hover:bg-secondary"
        >
          <span>
            <span className="block font-medium">Continue to Civi Meet</span>
            <span className="text-sm text-muted-foreground">Sign in to your organizer</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        <a href="#learn" className="mt-14 inline-flex animate-bounce items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-medium">
          Learn more <ArrowDown className="h-4 w-4" />
        </a>

      </main>
      <StoryScroll />
      <div className="snap-start flex min-h-[100svh] flex-col">
      <section className="flex flex-1 flex-col justify-center px-6 py-20 text-center">
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">Contribute. Connect. Convene.</h2>
        <p className="mx-auto mt-4 max-w-lg text-muted-foreground">Civi keeps your community engaged so people actually show up.</p>
        <InfoRequestForm />
      </section>

      <footer className="flex flex-col items-center gap-4 border-t border-border/60 px-6 py-10 text-sm text-muted-foreground md:flex-row md:justify-between md:px-28">
        <span>© {new Date().getFullYear()} Civi Meet</span>
        <div className="flex items-center gap-6">
          <Link to="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
          <Link to="/auth" className="hover:text-foreground">
            Log in
          </Link>
        </div>
      </footer>
      </div>
    </div>
  );
}

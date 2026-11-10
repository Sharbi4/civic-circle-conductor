import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import civi from "@/assets/civi-animal.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Civi Meet — The AI that organizes your community" },
      { name: "description", content: "Civi, the AI organizer for nonprofits and political groups: outreach, events, pages and volunteers." },
      { property: "og:title", content: "Civi Meet — The AI that organizes your community" },
      { property: "og:description", content: "Civi, the AI organizer for nonprofits and political groups." },
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

  const p = PHRASES[i]!;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-5 md:px-28">
        <span className="font-display text-lg font-bold">Civi Meet</span>
        <Link to="/auth" className="rounded-full bg-secondary px-5 py-2 text-sm font-medium hover:bg-card">
          Log in
        </Link>
      </header>

      <main className="flex flex-col items-center px-6 pt-10 text-center md:pt-16">
        <img src={civi} alt="Civi, the Civi Meet organizer" width={1024} height={1024} className="animate-drift civi-glow h-44 w-44 object-contain md:h-56 md:w-56" />

        <h1 className="mt-8 text-5xl font-semibold leading-[1.1] tracking-tight md:text-7xl">
          <span className="inline-flex items-center gap-1">
            Civi
            <img src={civi} alt="" aria-hidden="true" width={1024} height={1024} className="civi-glow -mx-3 -my-3 h-20 w-auto object-contain translate-y-2 md:h-28" />
            , AI that
          </span>
          <span className="block min-h-[1.2em]">
            <span key={i} className="animate-phrase inline-block">
              {p.text} <span aria-hidden="true">{p.emoji}</span>
            </span>
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          The organizer for nonprofits, parties and campaigns. Connect your channels and Civi runs the outreach.
        </p>

        <p className="mt-14 text-muted-foreground">Log in or create an account</p>
        <Link
          to="/auth"
          className="mt-4 flex w-full max-w-md items-center justify-between rounded-3xl bg-card px-6 py-4 text-left transition-colors hover:bg-secondary"
        >
          <span>
            <span className="block font-medium">Continue to Civi Meet</span>
            <span className="text-sm text-muted-foreground">Google or email</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        <a href="#learn" className="mt-20 inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-medium">
          Learn more <ArrowDown className="h-4 w-4" />
        </a>

        <section id="learn" className="mx-auto grid max-w-5xl gap-4 py-24 text-left md:grid-cols-3">
          {[
            ["Outreach on autopilot", "Civi posts, comments and replies across Facebook, Instagram, X, Nextdoor, TikTok and Gmail."],
            ["Events end to end", "Plans the event, lists it on Eventbrite, recruits vendors and volunteers, and follows up."],
            ["One shared memory", "Your mission, contacts and vendor lists live in one place every agent works from."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-3xl bg-card p-6">
              <h3 className="text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

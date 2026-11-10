import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/civimeet-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Civi Meet" },
      { name: "description", content: "Sign in to the Civi Meet private preview." },
      { property: "og:title", content: "Sign in — Civi Meet" },
      { property: "og:description", content: "Sign in to the Civi Meet private preview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast.error("That email and password didn’t match. Please try again."); return; }
    navigate({ to: "/chat" });
  }

  const field = "h-12 w-full rounded-2xl bg-secondary px-5 text-foreground outline-none ring-primary/50 placeholder:text-muted-foreground focus:ring-2";
  return (
    <div className="dark relative flex min-h-screen flex-col bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <header className="relative px-6 py-5 md:px-28">
        <Link to="/"><img src={logo.url} alt="Civi Meet" className="h-9 w-auto rounded-xl bg-white px-3 py-1.5" /></Link>
      </header>
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Welcome back, organizer.</h1>
        <p className="mt-3 text-muted-foreground">Sign in to your organization’s organizer</p>
        <form onSubmit={submit} className="mt-10 w-full max-w-md space-y-3 rounded-[2rem] border border-border/60 bg-card/80 p-6 text-left shadow-2xl backdrop-blur-xl">
          <input className={field} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={field} type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-between rounded-2xl bg-primary px-5 font-medium text-primary-foreground disabled:opacity-60">
            {busy ? "Signing in…" : "Continue to Civi Meet"} <ArrowRight className="h-5 w-5" />
          </button>
        </form>
      </main>
    </div>
  );
}

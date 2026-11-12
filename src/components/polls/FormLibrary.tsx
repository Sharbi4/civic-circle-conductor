import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PollQuestion } from "@/lib/polls.shared";

type Spec = { title: string; kind: "poll" | "feedback" | "signup"; description: string; questions: PollQuestion[] };

export const FORM_TEMPLATES: Spec[] = [
  { title: "Volunteer interest sign-up", kind: "signup", description: "Want to help? Tell us how you'd like to get involved.", questions: [
    { id: "q1", q: "How would you like to help?", type: "multi", options: ["Event setup", "Outreach & canvassing", "Social media", "Food & hospitality", "Wherever needed"], required: true },
    { id: "q2", q: "When are you usually free?", type: "multi", options: ["Weekday evenings", "Weekends", "Flexible"] },
    { id: "q3", q: "Your contact info", type: "contact", required: true } ] },
  { title: "Community priorities poll", kind: "poll", description: "Help us decide what to focus on next.", questions: [
    { id: "q1", q: "Which issue matters most to you right now?", type: "choice", options: ["Housing", "Public safety", "Schools & youth", "Jobs & local business", "Environment"], required: true },
    { id: "q2", q: "Anything else we should know?", type: "text" } ] },
  { title: "Pick the event date", kind: "poll", description: "Vote on the day that works best for you.", questions: [
    { id: "q1", q: "Which day works best?", type: "choice", options: ["Friday evening", "Saturday morning", "Saturday afternoon", "Sunday afternoon"], required: true },
    { id: "q2", q: "How likely are you to attend?", type: "rating", required: true } ] },
  { title: "Post-event feedback", kind: "feedback", description: "Thanks for coming! Two minutes helps us do better.", questions: [
    { id: "q1", q: "How would you rate the event?", type: "rating", required: true },
    { id: "q2", q: "What did you enjoy most?", type: "text" },
    { id: "q3", q: "What should we change next time?", type: "text" },
    { id: "q4", q: "Want to hear about future events?", type: "choice", options: ["Yes", "No"] } ] },
  { title: "Vendor interest form", kind: "signup", description: "Food trucks, caterers and makers, join our next event.", questions: [
    { id: "q1", q: "What do you offer?", type: "choice", options: ["Food truck", "Catering", "Retail / maker", "Services", "Other"], required: true },
    { id: "q2", q: "Tell us about your business", type: "text" },
    { id: "q3", q: "Your contact info", type: "contact", required: true } ] },
];

const kindLabel = (k: string) => (k === "signup" ? "Sign-up" : k === "feedback" ? "Feedback" : "Poll");

function Preview({ spec, logo, orgName }: { spec: Spec; logo?: string | null | undefined; orgName?: string | null | undefined }) {
  return (
    <div className="w-72 rounded-2xl border bg-card p-4 text-left shadow-soft">
      <div className="flex items-center gap-2.5">
        {logo ? <img src={logo} alt="" className="h-8 w-8 object-contain" /> : <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-sm font-bold">{(orgName ?? "C")[0]}</span>}
        <span className="truncate text-xs text-muted-foreground">{orgName ?? "Your organization"}</span>
      </div>
      <p className="mt-3 text-sm font-semibold">{spec.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{spec.description}</p>
      <div className="mt-3 space-y-2.5">
        {spec.questions.slice(0, 3).map((q) => (
          <div key={q.id}>
            <p className="text-xs font-medium">{q.q}</p>
            {q.options ? <div className="mt-1 flex flex-wrap gap-1">{q.options.slice(0, 4).map((o) => <span key={o} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{o}</span>)}</div>
              : q.type === "rating" ? <p className="mt-1 text-xs text-muted-foreground">★ ★ ★ ★ ★</p>
              : <div className="mt-1 h-6 rounded-md border bg-background" />}
          </div>
        ))}
        {spec.questions.length > 3 && <p className="text-[10px] text-muted-foreground">+{spec.questions.length - 3} more</p>}
      </div>
    </div>
  );
}

export function FormLibrary({ logo, orgName, onDone }: { logo?: string | null | undefined; orgName?: string | null | undefined; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mine = useQuery({
    queryKey: ["my-forms"],
    queryFn: async () => (await supabase.from("polls").select("id, title, kind, description, questions").order("created_at", { ascending: false }).limit(6)).data ?? [],
  });
  const items: { key: string; spec: Spec; own?: string }[] = [
    ...(mine.data ?? []).map((p) => ({ key: p.id, own: p.id, spec: { title: p.title, kind: p.kind as Spec["kind"], description: p.description ?? "", questions: (p.questions ?? []) as unknown as PollQuestion[] } })),
    ...FORM_TEMPLATES.map((t) => ({ key: t.title, spec: t })),
  ];

  async function use(spec: Spec, key: string, own?: string) {
    setBusy(key);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("polls").insert({ user_id: u.user!.id, title: spec.title, kind: spec.kind, description: spec.description, questions: spec.questions as never }).select("id").single();
      if (error || !data) throw error;
      qc.invalidateQueries({ queryKey: ["polls"] }); qc.invalidateQueries({ queryKey: ["my-forms"] });
      onDone(`I created "${spec.title}" from ${own ? "one of our saved forms" : "a Civi Meet template"}: https://civimeet.com/p/${data.id}, help me tailor it if needed and share it on our connected platforms.`);
    } catch { toast.error("Couldn't create that form, try again."); }
    setBusy(null);
  }

  return (
    <div className="mt-3 rounded-2xl border bg-card/60 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((it, i) => (
          <div key={it.key} className="relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <button type="button" disabled={!!busy} onClick={() => use(it.spec, it.key, it.own)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2.5 text-left transition-colors hover:bg-secondary">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{it.spec.title}</span>
                <span className="text-[11px] text-muted-foreground">{it.own ? "Your form" : "Template"} · {kindLabel(it.spec.kind)} · {it.spec.questions.length} questions</span>
              </span>
              {busy === it.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs text-accent">Use</span>}
            </button>
            {hover === i && <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden sm:block"><Preview spec={it.spec} logo={logo} orgName={orgName} /></div>}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onDone("I'd like to create my own form with you. Ask me what I want to learn and who should respond, then draft the questions.")}
        className="badge-premium mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
        <Sparkles className="h-4 w-4" /> Create my own with Civi
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground">Hover to preview. Every form shows your logo and is saved for your organization.</p>
    </div>
  );
}

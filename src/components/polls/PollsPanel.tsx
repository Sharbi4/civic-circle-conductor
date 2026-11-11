import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, ChevronLeft, Copy, Download, ExternalLink, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { summarizePoll } from "@/lib/polls.functions";
import { questionSchema, type PollQuestion } from "@/lib/polls.shared";
import { z } from "zod";
import { downloadCsv, responsesToCsv } from "@/lib/pollCsv";

const KIND: Record<string, string> = { poll: "Poll", feedback: "Feedback", signup: "Sign-up" };

export function PollsPanel() {
  const [open, setOpen] = useState<string | null>(null);
  const polls = useQuery({
    queryKey: ["polls"],
    queryFn: async () => {
      const { data } = await supabase.from("polls").select("id, title, kind, status, created_at, poll_responses(count)").order("created_at", { ascending: false }).limit(100);
      return (data ?? []).map((p) => ({ ...p, count: (p.poll_responses as unknown as { count: number }[])?.[0]?.count ?? 0 }));
    },
    refetchInterval: 15000,
  });
  const [exporting, setExporting] = useState(false);
  async function exportAll() {
    setExporting(true);
    try {
      const { data: ps } = await supabase.from("polls").select("id, title, kind, questions, poll_responses(answers, created_at)").order("created_at", { ascending: false }).limit(100);
      const parts = (ps ?? []).filter((p) => (p.poll_responses as unknown[] | null)?.length).map((p) =>
        responsesToCsv(z.array(questionSchema).catch([]).parse(p.questions), p.poll_responses as { answers: unknown; created_at: string }[], { form: p.title, kind: KIND[p.kind] ?? "Poll" }));
      if (!parts.length) { toast.error("No responses yet"); return; }
      downloadCsv(parts.join("\r\n\r\n"), `all-form-responses-${new Date().toISOString().slice(0, 10)}`);
    } catch { toast.error("Couldn't export responses"); }
    finally { setExporting(false); }
  }
  if (open) return <PollDetail id={open} onBack={() => setOpen(null)} />;
  const total = (polls.data ?? []).reduce((s, p) => s + p.count, 0);
  return (
    <div className="flex-1 overflow-y-auto px-2 pb-4">
      <h2 className="px-3 pb-1 font-medium">Polls & feedback</h2>
      <p className="px-3 pb-3 text-xs text-muted-foreground">Ask Civi for a quick poll, an event feedback form or a volunteer sign-up. Results land here live.</p>
      {!!polls.data?.length && (
        <div className="mx-1 mb-3 grid grid-cols-2 gap-2">
          <Stat label="Polls & forms" value={polls.data.length} />
          <Stat label="Total responses" value={total} />
        </div>
      )}
      {total > 0 && (
        <div className="mx-1 mb-3"><Button size="sm" variant="outline" className="w-full rounded-full" onClick={exportAll} disabled={exporting}>
          <Download className="mr-1 h-3.5 w-3.5" />{exporting ? "Preparing…" : "Export all responses (CSV)"}</Button></div>
      )}
      {polls.data?.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Nothing yet — try "Make a quick poll asking which Saturday works for our cleanup."</p>}
      {(polls.data ?? []).map((p) => (
        <button key={p.id} onClick={() => setOpen(p.id)} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left hover:bg-sidebar-accent">
          <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{p.title}</span>
            <span className="text-xs text-muted-foreground">{KIND[p.kind] ?? "Poll"} · {p.count} {p.count === 1 ? "response" : "responses"}{p.status !== "open" ? " · closed" : ""}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-2xl border bg-card p-3"><div className="text-lg font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}

function Bar({ label, n, max }: { label: string; n: number; max: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span className="truncate pr-2">{label}</span><span className="text-muted-foreground">{n}</span></div>
      <div className="h-2 rounded-full bg-secondary"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${max ? (n / max) * 100 : 0}%` }} /></div>
    </div>
  );
}

function PollDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const summarize = useServerFn(summarizePoll);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["poll", id],
    queryFn: async () => {
      const { data: p } = await supabase.from("polls").select("id, title, kind, status, questions, created_at").eq("id", id).maybeSingle();
      const { data: rs } = await supabase.from("poll_responses").select("answers, created_at").eq("poll_id", id).order("created_at", { ascending: false }).limit(1000);
      return { poll: p, questions: z.array(questionSchema).catch([]).parse(p?.questions), responses: rs ?? [] };
    },
    refetchInterval: 10000,
  });
  const d = q.data;
  if (!d?.poll) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  const rs = d.responses;
  const link = `https://civimeet.com/p/${id}`;

  const days = Array.from({ length: 14 }, (_, i) => { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - (13 - i)); return t; });
  const perDay = days.map((day) => rs.filter((r) => { const c = new Date(r.created_at); c.setHours(0, 0, 0, 0); return c.getTime() === day.getTime(); }).length);
  const maxDay = Math.max(1, ...perDay);

  function csv() { downloadCsv(responsesToCsv(d!.questions, rs), `${d!.poll!.title}-responses`); }
  async function toggle() {
    await supabase.from("polls").update({ status: d!.poll!.status === "open" ? "closed" : "open" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["poll", id] }); qc.invalidateQueries({ queryKey: ["polls"] });
  }
  async function remove() {
    if (!confirm("Delete this poll and all its responses?")) return;
    await supabase.from("polls").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["polls"] }); onBack();
  }
  async function runSummary() {
    setBusy(true);
    try { setSummary((await summarize({ data: { pollId: id } })).summary); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't summarize"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> All polls</button>
      <div>
        <h2 className="font-medium">{d.poll.title}</h2>
        <p className="text-xs text-muted-foreground">{KIND[d.poll.kind] ?? "Poll"} · {d.poll.status === "open" ? "Open" : "Closed"} · live</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}><Copy className="mr-1 h-3.5 w-3.5" />Copy link</Button>
        <Button size="sm" variant="outline" className="rounded-full" asChild><a href={`/p/${id}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Open</a></Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={csv} disabled={!rs.length}><Download className="mr-1 h-3.5 w-3.5" />Export CSV</Button>
      </div>
      <div className="grid grid-cols-2 gap-2"><Stat label="Responses" value={rs.length} /><Stat label="Last 24 hours" value={rs.filter((r) => Date.now() - new Date(r.created_at).getTime() < 864e5).length} /></div>

      <section className="rounded-2xl border bg-card p-3">
        <div className="mb-2 text-xs font-medium">Responses · last 14 days</div>
        <div className="flex h-16 items-end gap-1">{perDay.map((n, i) => <div key={i} title={`${days[i]!.toLocaleDateString()}: ${n}`} className="flex-1 rounded-sm bg-primary/80" style={{ height: `${Math.max(4, (n / maxDay) * 100)}%`, opacity: n ? 1 : 0.25 }} />)}</div>
      </section>

      <section className="rounded-2xl border bg-card p-3">
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium">Civi's summary</span>
          <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" onClick={runSummary} disabled={busy}><Sparkles className="mr-1 h-3.5 w-3.5" />{busy ? "Thinking…" : summary ? "Refresh" : "Summarize"}</Button></div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{summary ?? "Get a quick read on the results and next steps."}</p>
      </section>

      {d.questions.map((qq) => {
        const answers = rs.map((r) => (r.answers as Record<string, unknown>)[qq.id]).filter((a) => a !== undefined);
        return (
          <section key={qq.id} className="space-y-2 rounded-2xl border bg-card p-3">
            <div className="text-sm font-medium">{qq.q}</div>
            {(qq.type === "choice" || qq.type === "multi") && (() => {
              const counts = (qq.options ?? []).map((o) => ({ o, n: answers.filter((a) => a === o || (Array.isArray(a) && a.includes(o))).length }));
              const max = Math.max(0, ...counts.map((c) => c.n));
              return counts.map((c) => <Bar key={c.o} label={c.o} n={c.n} max={max} />);
            })()}
            {qq.type === "rating" && (() => {
              const nums = answers.filter((a): a is number => typeof a === "number");
              const avg = nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1) : "—";
              const max = Math.max(0, ...[1, 2, 3, 4, 5].map((s) => nums.filter((n) => n === s).length));
              return <><div className="text-2xl font-semibold">{avg}<span className="text-sm text-muted-foreground"> / 5</span></div>{[5, 4, 3, 2, 1].map((s) => <Bar key={s} label={`${s} ★`} n={nums.filter((n) => n === s).length} max={max} />)}</>;
            })()}
            {qq.type === "text" && (answers.length ? answers.slice(0, 8).map((a, i) => <p key={i} className="rounded-xl bg-secondary px-3 py-2 text-sm">{String(a)}</p>) : <p className="text-xs text-muted-foreground">No comments yet.</p>)}
            {qq.type === "contact" && <p className="text-sm text-muted-foreground">{answers.length} {answers.length === 1 ? "person" : "people"} shared contact details — download the CSV to see them.</p>}
          </section>
        );
      })}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="rounded-full" onClick={toggle}>{d.poll.status === "open" ? "Close poll" : "Reopen poll"}</Button>
        <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" onClick={remove}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
      </div>
    </div>
  );
}

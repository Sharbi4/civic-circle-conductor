import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getSuggestions, setAutonomy } from "@/lib/suggestions.functions";
import { ArrowUp, ImagePlus, X, CalendarHeart, ExternalLink, Mail, Megaphone, MonitorUp, Phone, Square, Vote, HeartPulse, MessageSquareHeart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendOrganizerMessage } from "@/lib/organizer.functions";
import { endBrowserSession, browserAgentStep, setBrowserDriving, startFacebookSetup } from "@/lib/browser.functions";
import { useThreads, useOrg } from "./chat";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ThreadPage,
});

type Msg = { id: string; role: string; content: string };

function ThreadPage() {
  const { threadId } = Route.useParams();
  return <ChatWindow key={threadId} threadId={threadId} />;
}

const BROWSER_MARKER = /\[\[browser:\s*([0-9a-f-]{36})\s*\|(.+?)\]\]|\[\[image:(cover|inspiration)\|([^\]]+)\]\]/g;

function AttachedImage({ path, role }: { path: string; role: string }) {
  const url = useQuery({
    queryKey: ["event-image", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("event-images").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 50 * 60 * 1000,
  });
  return (
    <figure className="inline-block overflow-hidden rounded-2xl border bg-card">
      {url.data ? <img src={url.data} alt={role === "cover" ? "Event cover" : "Inspiration picture"} className="max-h-56 max-w-full object-cover" /> : <div className="h-32 w-48 animate-pulse bg-muted" />}
      <figcaption className="px-3 py-1.5 text-xs text-muted-foreground">{role === "cover" ? "Use as event cover" : "Inspiration for the cover"}</figcaption>
    </figure>
  );
}

const CHOICES_MARKER = /\[\[choices:\s*([^\]]+)\]\]/;

function MessageBody({ content }: { content: string }) {
  type Part = { kind: "text"; text: string } | { kind: "browser"; id: string; task: string } | { kind: "image"; role: string; path: string };
  const parts: Part[] = [];
  let last = 0;
  for (const match of content.matchAll(BROWSER_MARKER)) {
    const idx = match.index ?? 0;
    if (idx > last) parts.push({ kind: "text", text: content.slice(last, idx) });
    if (match[3]) parts.push({ kind: "image", role: match[3], path: (match[4] ?? "").trim() });
    else parts.push({ kind: "browser", id: match[1] ?? "", task: (match[2] ?? "").trim() });
    last = idx + match[0].length;
  }
  if (last < content.length) parts.push({ kind: "text", text: content.slice(last) });

  return (
    <div className="space-y-3">
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <div key={i} className="prose-chat leading-relaxed">
            <ReactMarkdown>{p.text}</ReactMarkdown>
          </div>
        ) : p.kind === "image" ? (
          <AttachedImage key={i} path={p.path} role={p.role} />
        ) : (
          <PinnedAware key={p.id} id={p.id} task={p.task} />
        ),
      )}
    </div>
  );
}

const PinnedBrowser = createContext<string | null>(null);
function PinnedAware({ id, task }: { id: string; task: string }) {
  const pinned = useContext(PinnedBrowser);
  if (pinned === id) return <p className="text-xs text-muted-foreground">🖥️ Live browser pinned at the top of the chat ↑</p>;
  return <BrowserCard sessionRowId={id} task={task} />;
}

// One driver per browser, even when several chat cards show the same session.
const DRIVING_NOW = new Set<string>();

function friendlyStep(note: string): string {
  const q = note.match(/facebook\.com\/search\/groups\/\?q=([^\s—]+)/);
  if (q) { try { return `Searched groups: ${decodeURIComponent(q[1]!)}`; } catch { /* fall through */ } }
  if (/^Finished:/.test(note)) return "Finished the task";
  if (/^New task:/.test(note)) return note;
  const reason = note.split(" — ").slice(1).join(" — ").trim();
  const base = reason || note.replace(/element \d+/g, "").trim();
  if (/join/i.test(base) && /^Submitted|^Clicked/.test(note)) return base.replace(/^Click(ing)? /i, "").replace(/^Join/i, "Joined");
  return base.replace(/\.$/, "");
}

function BrowserCard({ sessionRowId, task }: { sessionRowId: string; task: string }) {
  const qc = useQueryClient();
  const end = useServerFn(endBrowserSession);
  const step = useServerFn(browserAgentStep);
  const setDriving = useServerFn(setBrowserDriving);
  const [ending, setEnding] = useState(false);
  const stepping = useRef(false);

  const session = useQuery({
    queryKey: ["browser_session", sessionRowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("browser_sessions").select("id, live_url, status, agent_status, steps, connect_url, site, signed_in, handoff_reason").eq("id", sessionRowId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const running = session.data?.status === "running" && session.data.live_url;
  const agent = session.data?.agent_status ?? "idle";
  const [showSteps, setShowSteps] = useState(false);
  const steps = (Array.isArray(session.data?.steps) ? session.data!.steps : []) as { action: string; note: string }[];

  useEffect(() => {
    if (!running || agent !== "driving" || stepping.current || DRIVING_NOW.has(sessionRowId)) return;
    stepping.current = true;
    DRIVING_NOW.add(sessionRowId);
    step({ data: { sessionRowId } })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Civi lost the browser"))
      .finally(async () => {
        stepping.current = false;
        DRIVING_NOW.delete(sessionRowId);
        await qc.invalidateQueries({ queryKey: ["browser_session", sessionRowId] });
        qc.invalidateQueries({ queryKey: ["approvals"] });
        qc.invalidateQueries({ queryKey: ["messages"] });
      });
  }, [running, agent, steps.length, sessionRowId]);

  const org = useOrg();
  const fbSetup = useServerFn(startFacebookSetup);
  const [fbDismissed, setFbDismissed] = useState(false);
  const [fbLoc, setFbLoc] = useState("");
  const [fbBusy, setFbBusy] = useState(false);
  const onFacebook = !!session.data?.site?.endsWith("facebook.com") && !!session.data?.signed_in;
  const showFbSetup = !!running && onFacebook && agent !== "driving" && org.data && !org.data.facebook_setup_location && !fbDismissed;
  async function runFbSetup() {
    if (fbLoc.trim().length < 2) return;
    setFbBusy(true);
    try {
      await fbSetup({ data: { sessionRowId, location: fbLoc.trim() } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["org"] }), qc.invalidateQueries({ queryKey: ["browser_session", sessionRowId] }), qc.invalidateQueries({ queryKey: ["messages"] })]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start"); }
    finally { setFbBusy(false); }
  }

  async function toggleDrive(driving: boolean) {
    await setDriving({ data: { sessionRowId, driving } });
    await qc.invalidateQueries({ queryKey: ["browser_session", sessionRowId] });
  }
  const AGENT_LABEL: Record<string, string> = {
    driving: "Civi is driving", awaiting_approval: "Waiting for your approval", done: "Civi finished",
    stopped: "You're in control", needs_user: "Your turn", failed: "Civi lost the browser", idle: "You're in control",
  };

  async function stop() {
    setEnding(true);
    try {
      await end({ data: { sessionRowId } });
      await qc.invalidateQueries({ queryKey: ["browser_session", sessionRowId] });
      toast.success("Browser session ended.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't end the session");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <MonitorUp className="h-4 w-4 shrink-0 text-accent" />
        <span className="truncate text-sm font-medium">{task}</span>
        {running ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Live
          </span>
        ) : (
          <span className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Ended
          </span>
        )}
      </div>
      {running ? (
        <>
          <iframe
            src={session.data!.live_url!}
            title={`Live browser: ${task}`}
            className="aspect-video w-full border-t bg-background"
            allow="clipboard-read; clipboard-write"
          />
          {agent === "needs_user" && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-secondary px-4 py-3">
              <p className="text-sm"><span className="font-semibold">Your turn:</span> {session.data?.handoff_reason ?? "Civi needs you in the browser."}</p>
              <Button size="sm" onClick={() => toggleDrive(true)}>Done — Civi, continue</Button>
            </div>
          )}
          {agent === "stopped" && session.data?.connect_url && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
              <p className="text-xs text-muted-foreground">You have control — Civi is paused until you hand it back.</p>
              <Button size="sm" variant="outline" onClick={() => toggleDrive(true)}>Give control back to Civi</Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
            <p className="text-xs text-muted-foreground">{AGENT_LABEL[agent] ?? "Watch Civi work"}{agent === "driving" ? "…" : ""}</p>
            <div className="flex shrink-0 gap-2">
              {session.data?.connect_url && (agent === "driving" ? (
                <button onClick={() => toggleDrive(false)} className="rounded-full border px-3 py-1 text-xs hover:bg-secondary">Take over</button>
              ) : agent === "needs_user" ? null : agent !== "awaiting_approval" ? (
                <button onClick={() => toggleDrive(true)} className="rounded-full border px-3 py-1 text-xs hover:bg-secondary">Let Civi drive</button>
              ) : null)}
              <a href={session.data!.live_url!} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-secondary">
                <ExternalLink className="h-3 w-3" /> Full view
              </a>
              <button onClick={stop} disabled={ending}
                className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-secondary disabled:opacity-40">
                <Square className="h-3 w-3" /> {ending ? "Ending…" : "End"}
              </button>
            </div>
          </div>
          {steps.length > 0 && (
            <button onClick={() => setShowSteps(true)} title="See everything Civi has done"
              className="flex w-full items-center gap-2 border-t px-4 py-2.5 text-left text-xs text-muted-foreground hover:bg-secondary/60">
              <span className="relative flex h-2 w-2 shrink-0">
                {session.data?.agent_status === "driving" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span key={steps.length} className="min-w-0 flex-1 truncate animate-in fade-in slide-in-from-bottom-1 duration-300">
                <span className="font-semibold text-foreground">{steps.length}.</span> {friendlyStep(steps[steps.length - 1]!.note)}
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide">View all</span>
            </button>
          )}
          {showSteps && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 p-4 backdrop-blur-sm" onClick={() => setShowSteps(false)}>
              <div className="relative max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border bg-card/85 shadow-soft backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <p className="text-sm font-semibold">What Civi is doing</p>
                  <button onClick={() => setShowSteps(false)} aria-label="Close" className="rounded-full p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
                </div>
                <ol className="max-h-[65vh] space-y-1.5 overflow-y-auto px-4 py-3 text-xs text-muted-foreground">
                  {steps.map((st, i) => (
                    <li key={i}><span className="font-semibold text-foreground">{i + 1}.</span> {friendlyStep(st.note)}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">This browser session has ended.</p>
      )}
      <Dialog open={!!showFbSetup} onOpenChange={(o) => { if (!o) setFbDismissed(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request to join relevant groups near…</DialogTitle>
            <DialogDescription>
              Join groups on Facebook
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus placeholder="City or ZIP code (e.g. Tucson, AZ or 85701)" value={fbLoc}
            onChange={(e) => setFbLoc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runFbSetup(); }} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFbDismissed(true)}>Not now</Button>
            <Button onClick={runFbSetup} disabled={fbBusy || fbLoc.trim().length < 2}>{fbBusy ? "Starting…" : "Find groups"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const LEAD_ACTIONS = [
  { Icon: CalendarHeart, title: "Plan an Event", desc: "Research, organize, promote & measure", prompt: "I want to plan an event. Walk me through it — start by asking what kind of event, where, when, how many people, budget, venue, vendors, audience and goal." },
  { Icon: Megaphone, title: "Social Outreach", desc: "Campaigns, posts & follow-up", prompt: "I want to run a social outreach campaign. Ask me about my goal, audience, location, channels and schedule, then build a content and engagement plan." },
  { Icon: Vote, title: "Poll Your Community", desc: "Feedback & community priorities", prompt: "I want to poll my community. Ask me what I want to learn and who should respond, then draft the questions." },
  { Icon: HeartPulse, title: "Analyze Sentiment", desc: "How communities respond to you", prompt: "I want to analyze community sentiment. Ask me which communities and date range to focus on, then identify recurring themes, concerns and support." },
  { Icon: Mail, title: "Email Campaign", desc: "Approved outreach, sent & tracked", prompt: "I want to run an email campaign. Ask me about the objective, audience and timing, then draft the content." },
  { Icon: Phone, title: "Phone Outreach", desc: "Calls, responses & follow-up", prompt: "I want to coordinate phone outreach. Ask me about the purpose, contacts, script and schedule." },
];

const LEVELS = [
  { id: "manual", label: "Manual", hint: "Civi only suggests next steps" },
  { id: "assisted", label: "Assisted", hint: "Every 30 min Civi queues its next move in Approvals" },
  { id: "auto", label: "Auto", hint: "Every 30 min Civi picks its next move and starts it; joins, posts and bookings still need your OK" },
] as const;

function NextSteps({ threadId, msgCount, busy, onPick }: { threadId: string; msgCount: number; busy: boolean; onPick: (prompt: string) => void }) {
  const fetchSug = useServerFn(getSuggestions);
  const saveLevel = useServerFn(setAutonomy);
  const qc = useQueryClient();
  const sug = useQuery({
    queryKey: ["suggestions", threadId, msgCount],
    queryFn: () => fetchSug({ data: { threadId } }),
    enabled: msgCount > 0 && !busy,
    staleTime: Infinity,
  });
  const org = useQuery({
    queryKey: ["org-autonomy"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("autonomy").maybeSingle();
      return (data?.autonomy ?? "manual") as "manual" | "assisted" | "auto";
    },
  });
  async function pickLevel(level: "manual" | "assisted" | "auto") {
    qc.setQueryData(["org-autonomy"], level);
    try { await saveLevel({ data: { level } }); toast.success(LEVELS.find((l) => l.id === level)!.hint); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change mode"); org.refetch(); }
  }
  const items = sug.data?.items ?? [];
  return (
    <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-1.5">
      {!busy && items.map((it, i) => (
        <button type="button" key={i} onClick={() => onPick(it.prompt)}
          className="animate-in fade-in slide-in-from-bottom-1 rounded-full border bg-card/90 px-3 py-1.5 text-xs shadow-soft backdrop-blur hover:border-primary hover:bg-secondary">
          {it.label}
        </button>
      ))}
      {sug.isFetching && <span className="text-xs text-muted-foreground">Thinking of next steps…</span>}
      <div className="ml-auto flex rounded-full border bg-card/90 p-0.5 text-[11px] shadow-soft backdrop-blur" role="radiogroup" aria-label="How much Civi does on its own">
        {LEVELS.map((l) => (
          <button type="button" key={l.id} title={l.hint} role="radio" aria-checked={org.data === l.id} onClick={() => pickLevel(l.id)}
            className={`rounded-full px-2.5 py-1 ${org.data === l.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatWindow({ threadId }: { threadId: string }) {
  const qc = useQueryClient();
  const send = useServerFn(sendOrganizerMessage);
  const threads = useThreads();
  const thread = threads.data?.find((t) => t.id === threadId);
  const [pending, setPending] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<{ path: string; preview: string; role: "cover" | "inspiration" } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast.error("Use a PNG, JPG or WebP image."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Images must be under 10 MB."); return; }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again.");
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("event-images").upload(path, file, { contentType: file.type });
      if (error) throw error;
      setAttachment({ path, preview: URL.createObjectURL(file), role: "cover" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = useQuery({
    queryKey: ["messages", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages").select("id, role, content").eq("thread_id", threadId).order("created_at");
      if (error) throw error;
      return data as Msg[];
    },
  });

  const pinned = useQuery({
    queryKey: ["pinned_browser", threadId, msgs.data?.length ?? 0],
    queryFn: async () => {
      const { data } = await supabase.from("browser_sessions").select("id, task")
        .eq("thread_id", threadId).eq("status", "running").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    refetchInterval: 15000,
  });
  const all = [...(msgs.data ?? []), ...pending];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [all.length, busy]);
  useEffect(() => { inputRef.current?.focus(); }, [busy]);

  async function submit(text: string) {
    const typed = text.trim();
    if ((!typed && !attachment) || busy || uploading) return;
    const content = attachment
      ? `${typed || (attachment.role === "cover" ? "Use this picture as the event cover." : "Use this picture as inspiration for the event cover.")}\n\n[[image:${attachment.role}|${attachment.path}]]`
      : typed;
    setAttachment(null);
    setInput("");
    setPending([{ id: "p", role: "user", content }]);
    setBusy(true);
    try {
      await send({ data: { threadId, content } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["messages", threadId] }),
        qc.invalidateQueries({ queryKey: ["threads"] }),
        qc.invalidateQueries({ queryKey: ["memories"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      setInput(content);
      await qc.invalidateQueries({ queryKey: ["messages", threadId] });
    } finally {
      setPending([]);
      setBusy(false);
    }
  }

  return (
    <>
      <PinnedBrowser.Provider value={pinned.data?.id ?? null}>
      <div className="flex-1 overflow-y-auto">
        {pinned.data && (
          <div className="sticky top-0 z-20 border-b bg-background/85 px-5 py-2 backdrop-blur">
            <div className="mx-auto max-w-3xl [&_iframe]:max-h-[38vh]">
              <BrowserCard sessionRowId={pinned.data.id} task={pinned.data.task} />
            </div>
          </div>
        )}
        <div className="mx-auto w-full max-w-3xl px-5 pb-40 pt-8">
          {all.length === 0 && !msgs.isLoading && (
            <div className="flex flex-col items-center pt-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-soft">
                <MessageSquareHeart className="h-7 w-7" />
              </div>
              <h2 className="font-display mt-5 text-3xl font-bold">
                {thread?.kind === "main" ? "What are we moving forward?" : thread?.title}
              </h2>
              <p className="mt-2 text-muted-foreground">Pick a lead action, or just start typing.</p>
              <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                {LEAD_ACTIONS.map((a) => (
                  <button
                    key={a.title}
                    onClick={() => submit(a.prompt)}
                    className="group flex items-start gap-3 rounded-2xl border bg-card p-4 text-left shadow-soft transition-colors hover:bg-secondary"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent transition-colors group-hover:bg-background">
                      <a.Icon className="h-4.5 w-4.5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{a.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{a.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-5">
            {all.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl bg-user-bubble px-5 py-3 text-user-bubble-foreground">
                    {m.content.replace(/\n*\[\[image:(?:cover|inspiration)\|[^\]]+\]\]/g, "").trim()}
                    {[...m.content.matchAll(/\[\[image:(cover|inspiration)\|([^\]]+)\]\]/g)].map((x) => (
                      <div key={x[2]} className="mt-2"><AttachedImage path={(x[2] ?? "").trim()} role={x[1] ?? "cover"} /></div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={m.id}>
                  <div className="max-w-[92%] rounded-3xl bg-bubble px-6 py-4">
                    <MessageBody content={m.content.replace(CHOICES_MARKER, "").trim()} />
                  </div>
                  {m.id === all[all.length - 1]?.id && !busy && (() => {
                    const c = m.content.match(CHOICES_MARKER);
                    if (!c) return null;
                    return (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(c[1] ?? "").split("|").map((o) => o.trim()).filter(Boolean).map((o) => (
                          <button key={o} onClick={() => submit(o)}
                            className="rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-soft transition-colors hover:bg-secondary">
                            {o}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ),
            )}
            {busy && (
              <div className="inline-flex gap-1.5 rounded-3xl bg-bubble px-5 py-4" aria-label="Organizer is thinking">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
          </div>
          <div ref={endRef} />
        </div>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-5 pt-8"
      >
        {attachment && (
          <div className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-2xl border bg-card p-2 shadow-soft">
            <img src={attachment.preview} alt="Attached picture" className="h-14 w-14 rounded-xl object-cover" />
            <div className="flex flex-1 flex-wrap gap-1.5 text-xs">
              {(["cover", "inspiration"] as const).map((r) => (
                <button
                  type="button" key={r} onClick={() => setAttachment({ ...attachment, role: r })}
                  className={`rounded-full border px-3 py-1 ${attachment.role === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                >
                  {r === "cover" ? "Use as event cover" : "Inspiration for AI cover"}
                </button>
              ))}
            </div>
            <button type="button" aria-label="Remove picture" onClick={() => setAttachment(null)} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <NextSteps threadId={threadId} msgCount={msgs.data?.length ?? 0} busy={busy} onPick={(p) => submit(p)} />
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-full border bg-card py-2 pl-2 pr-2 shadow-soft">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          <button
            type="button" aria-label="Attach a picture" onClick={() => fileRef.current?.click()} disabled={uploading || busy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            <ImagePlus className={`h-5 w-5 ${uploading ? "animate-pulse" : ""}`} />
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); }
            }}
            placeholder="Message your organizer"
            className="max-h-40 flex-1 resize-none bg-transparent py-2 outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || uploading || (!input.trim() && !attachment)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
      </PinnedBrowser.Provider>
    </>
  );
}

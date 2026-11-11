import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getSuggestions, setAutonomy } from "@/lib/suggestions.functions";
import { speakText, transcribeSpeech } from "@/lib/voice.functions";
import { Mic, Volume2, VolumeX, Loader2 } from "lucide-react";
import { ArrowUp, ImagePlus, X, CalendarHeart, ExternalLink, Mail, Megaphone, MonitorUp, Phone, Square, Hand, Play, Maximize2, Vote, HeartPulse, MessageSquareHeart, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendOrganizerMessage } from "@/lib/organizer.functions";
import { endBrowserSession, browserAgentStep, setBrowserDriving, startFacebookSetup } from "@/lib/browser.functions";
import { useThreads, useOrg } from "./chat";
import { isScoutBriefing } from "@/lib/discovery.shared";
import { ChatSearch } from "@/components/ChatSearch";
import { FormLibrary } from "@/components/polls/FormLibrary";
import { LetterheadCheck, shouldShowLetterheadReminder } from "@/components/LetterheadCheck";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EventbriteDraftControls } from '@/components/EventbriteDraftControls';
import { AgentPreparing } from '@/components/AgentPreparing';
import { PendingApprovalsBar } from '@/components/PendingApprovalsBar';
import { refreshVenueCalls } from '@/lib/calling.functions';

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  head: () => ({ meta: [
    { title: "Agent conversation — Civi Meet" }, { name: "description", content: "Plan outreach and community events with Civi and your connected channel agents." },
    { property: "og:title", content: "Agent conversation — Civi Meet" }, { property: "og:description", content: "Organization-specific organizing help from Civi." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ThreadPage,
});

type Msg = { id: string; role: string; content: string };

function ThreadPage() {
  const { threadId } = Route.useParams();
  return <ChatWindow key={threadId} threadId={threadId} />;
}

const BROWSER_MARKER = /\[\[browser:\s*([0-9a-f-]{36})\s*\|(.+?)\]\]|\[\[image:(cover|inspiration|post)\|([^\]]+)\]\]|\[\[doc:\s*([0-9a-f-]{36})\s*\|([^|\]]+)(?:\|\s*([a-z]+)\s*)?\]\]/g;

function DocCard({ id, title, kind }: { id: string; title: string; kind: string }) {
  return (
    <Link to="/documents/$id" params={{ id }} className="group flex max-w-sm items-center gap-3 rounded-2xl border bg-card p-3 shadow-soft transition hover:border-primary">
      <span className="grid h-12 w-10 shrink-0 place-items-center rounded-md border bg-background"><FileText className="h-5 w-5 text-muted-foreground" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="text-xs text-muted-foreground"><span className="capitalize">{kind}</span> · Open or download PDF</span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
    </Link>
  );
}

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
      {url.data ? <img src={url.data} alt={role === "cover" ? "Event cover" : role === "post" ? "Photo for the LinkedIn post" : "Inspiration picture"} className="max-h-56 max-w-full object-cover" /> : <div className="h-32 w-48 animate-pulse bg-muted" />}
      <figcaption className="px-3 py-1.5 text-xs text-muted-foreground">{role === "cover" ? "Use as event cover" : role === "post" ? "Photo for your LinkedIn post (goes out with it)" : "Inspiration for the cover"}</figcaption>
    </figure>
  );
}

const CHOICES_MARKER = /\[\[choices:\s*([^\]]+)\]\]/;

function flattenText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (typeof node === "object" && "props" in node) return flattenText((node.props as { children?: React.ReactNode }).children);
  return "";
}

function MessageBody({ content, onAction }: { content: string; onAction?: ((text: string) => void) | undefined }) {
  const eventId = content.match(/\[\[eventbrite_draft:(\d+)\]\]/)?.[1] ?? content.match(/https:\/\/www\.eventbrite\.com\/myevent\?eid=(\d+)/)?.[1];
  content = content.replace(/\[\[eventbrite_draft:\d+\]\]/g, '');
  type Part = { kind: "text"; text: string } | { kind: "browser"; id: string; task: string } | { kind: "image"; role: string; path: string } | { kind: "doc"; id: string; title: string; dkind: string };
  const parts: Part[] = [];
  let last = 0;
  for (const match of content.matchAll(BROWSER_MARKER)) {
    const idx = match.index ?? 0;
    if (idx > last) parts.push({ kind: "text", text: content.slice(last, idx) });
    if (match[5]) parts.push({ kind: "doc", id: match[5], title: (match[6] ?? "Document").trim(), dkind: (match[7] ?? "document").trim() });
    else if (match[3]) parts.push({ kind: "image", role: match[3], path: (match[4] ?? "").trim() });
    else parts.push({ kind: "browser", id: match[1] ?? "", task: (match[2] ?? "").trim() });
    last = idx + match[0].length;
  }
  if (last < content.length) parts.push({ kind: "text", text: content.slice(last) });

  return (
    <div className="space-y-3">
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <div key={i} className="prose-chat leading-relaxed">
            <ReactMarkdown components={onAction ? {
              strong: ({ children }) => (
                <button type="button" onClick={() => onAction(flattenText(children))}
                  className="cursor-pointer rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/20">
                  {children}
                </button>
              ),
            } : undefined}>{p.text}</ReactMarkdown>
          </div>
        ) : p.kind === "doc" ? (
          <DocCard key={i} id={p.id} title={p.title} kind={p.dkind} />
        ) : p.kind === "image" ? (
          <AttachedImage key={i} path={p.path} role={p.role} />
        ) : (
          <PinnedAware key={p.id} id={p.id} task={p.task} />
        ),
      )}
      {eventId && <EventbriteDraftControls eventId={eventId} />}
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
  const [frameH, setFrameH] = useState(380);
  const [dragging, setDragging] = useState(false);
  const [frameW, setFrameW] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const v = Number(localStorage.getItem("civi-browser-w")); if (v > 0) setFrameW(v); }, []);
  function startCorner(e: React.PointerEvent, dir: "both" | "x") {
    e.preventDefault(); e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const x0 = e.clientX, y0 = e.clientY, h0 = frameH;
    const parentW = cardRef.current?.parentElement?.clientWidth ?? 800;
    const w0 = cardRef.current?.offsetWidth ?? parentW;
    setDragging(true);
    let lw = w0, lh = h0;
    const move = (ev: PointerEvent) => {
      lw = Math.round(Math.min(parentW, Math.max(320, w0 + ev.clientX - x0)));
      setFrameW(lw);
      if (dir === "both") { lh = Math.round(Math.min(window.innerHeight * 0.8, Math.max(160, h0 + ev.clientY - y0))); setFrameH(lh); }
    };
    const up = () => {
      setDragging(false);
      localStorage.setItem("civi-browser-w", String(lw));
      localStorage.setItem("civi-browser-h", String(lh));
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  }
  useEffect(() => { const v = Number(localStorage.getItem("civi-browser-h")); if (v > 0) setFrameH(v); }, []);
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const y0 = e.clientY, h0 = frameH;
    setDragging(true);
    let last = h0;
    const move = (ev: PointerEvent) => {
      last = Math.round(Math.min(window.innerHeight * 0.8, Math.max(160, h0 + ev.clientY - y0)));
      setFrameH(last);
    };
    const up = () => {
      setDragging(false);
      localStorage.setItem("civi-browser-h", String(last));
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
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
    <div ref={cardRef} className="relative mx-auto max-w-full overflow-hidden rounded-2xl border bg-card shadow-soft" style={frameW ? { width: frameW } : undefined}>
      {running && (
        <>
          <div aria-label="Drag to change browser width" onPointerDown={(e) => startCorner(e, "x")} className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none hover:bg-accent/20" />
          <div aria-label="Drag to resize the browser" onPointerDown={(e) => startCorner(e, "both")} className="absolute bottom-0 right-0 z-20 h-5 w-5 cursor-nwse-resize touch-none rounded-tl-md bg-muted-foreground/30 hover:bg-accent/60" />
        </>
      )}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <MonitorUp className="h-4 w-4 shrink-0 text-accent" />
        <span className="truncate text-sm font-medium">{task}</span>
        {running && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">· {AGENT_LABEL[agent] ?? "Watching"}</span>}
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
          <div className="relative border-t" style={{ height: frameH }}>
            <iframe
              src={session.data!.live_url!}
              title={`Live browser: ${task}`}
              className={`h-full w-full bg-background ${dragging ? "pointer-events-none" : ""}`}
              allow="clipboard-read; clipboard-write"
            />
            <div className="absolute right-2 top-2 flex gap-1.5 opacity-70 transition-opacity hover:opacity-100">
              {session.data?.connect_url && (agent === "driving" ? (
                <button onClick={() => toggleDrive(false)} title="Take over" aria-label="Take over" className="flex h-8 w-8 items-center justify-center rounded-full bg-background/50 text-foreground shadow-soft backdrop-blur-md hover:bg-background/80 disabled:opacity-40"><Hand className="h-4 w-4" /></button>
              ) : agent !== "needs_user" && agent !== "awaiting_approval" ? (
                <button onClick={() => toggleDrive(true)} title="Let Civi drive" aria-label="Let Civi drive" className="flex h-8 w-8 items-center justify-center rounded-full bg-background/50 text-foreground shadow-soft backdrop-blur-md hover:bg-background/80 disabled:opacity-40"><Play className="h-4 w-4" /></button>
              ) : null)}
              <a href={session.data!.live_url!} target="_blank" rel="noreferrer" title="Full view" aria-label="Full view" className="flex h-8 w-8 items-center justify-center rounded-full bg-background/50 text-foreground shadow-soft backdrop-blur-md hover:bg-background/80 disabled:opacity-40"><Maximize2 className="h-4 w-4" /></a>
              <button onClick={stop} disabled={ending} title="Stop and close browser" aria-label="Stop" className="flex h-8 w-8 items-center justify-center rounded-full bg-background/50 text-foreground shadow-soft backdrop-blur-md hover:bg-background/80 disabled:opacity-40"><Square className="h-4 w-4" /></button>
            </div>
          </div>
          <div
            role="separator" aria-orientation="horizontal" aria-label="Drag to resize the browser"
            onPointerDown={startResize}
            className="flex h-5 cursor-row-resize touch-none items-center justify-center border-t bg-secondary/60 hover:bg-secondary"
          >
            <span className="h-1.5 w-12 rounded-full bg-muted-foreground/50" />
          </div>
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
  { Icon: Vote, title: "Poll Your Community", desc: "Feedback & community priorities", prompt: "I want to poll my community — show me the ready-made forms." },
  { Icon: HeartPulse, title: "Analyze Sentiment", desc: "How communities respond to you", prompt: "I want to analyze community sentiment. Ask me which communities and date range to focus on, then identify recurring themes, concerns and support." },
  { Icon: Mail, title: "Email Campaign", desc: "Approved outreach, sent & tracked", prompt: "I want to run an email campaign. Ask me about the objective, audience and timing, then draft the content." },
  { Icon: Phone, title: "Phone Outreach", desc: "Calls, responses & follow-up", prompt: "I want to coordinate phone outreach. Ask me about the purpose, contacts, script and schedule." },
];

const LEVELS = [
  { id: "manual", label: "Manual", hint: "Civi only suggests next steps" },
  { id: "assisted", label: "Assisted", hint: "Every 30 min Civi queues its next move in Approvals" },
  { id: "auto", label: "Auto", hint: "Every 30 min Civi picks its next move and starts it; joins, posts and bookings still need your OK" },
] as const;

function NextSteps({ threadId, msgCount, busy, hasChoices, onPick }: { threadId: string; msgCount: number; busy: boolean; hasChoices?: boolean; onPick: (prompt: string) => void }) {
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
  const items = hasChoices ? [] : (sug.data?.items ?? []);
  return (
    <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-1.5">
      {!busy && items.map((it, i) => (
        <button type="button" key={i} onClick={() => onPick(it.prompt)}
          className="badge-premium animate-in fade-in slide-in-from-bottom-1 rounded-full px-3 py-1.5 text-xs backdrop-blur transition-colors hover:bg-secondary">
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

function LetterheadPrompt({ onDone, onSkipped }: { onDone: () => void; onSkipped: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    shouldShowLetterheadReminder().then((show) => { if (show) setOpen(true); });
  }, []);
  return (<>
    <Button size="sm" className="mt-3" onClick={() => setOpen(true)}><FileText className="h-4 w-4" /> Fill in letterhead details</Button>
    <LetterheadCheck open={open} onOpenChange={setOpen} onSaved={onDone} onSkipped={onSkipped} />
  </>);
}

function ChatWindow({ threadId }: { threadId: string }) {
  const orgQ = useOrg();
  const qc = useQueryClient();
  const send = useServerFn(sendOrganizerMessage);
  const refreshCalls = useServerFn(refreshVenueCalls);
  const callStatus = useQuery({
    queryKey: ["venue-calls", threadId],
    queryFn: async () => {
      const result = await refreshCalls({ data: { threadId } });
      if (result.completed) await qc.invalidateQueries({ queryKey: ["messages", threadId] });
      return result;
    },
    refetchInterval: 20000,
  });
  const threads = useThreads();
  const thread = threads.data?.find((t) => t.id === threadId);
  const preparing = useQuery({ queryKey: ["agent-preparing", threadId], queryFn: () => false, enabled: false });
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
      return (data as Msg[]).filter((m) => !isScoutBriefing(m.content));
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
  useEffect(() => { const sc = endRef.current?.closest(".overflow-y-auto"); if (sc) { stickRef.current = true; sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" }); } }, [all.length, busy]);
  useEffect(() => { inputRef.current?.focus(); }, [busy]);

  const voice = useVoice();
  const transcribe = useServerFn(transcribeSpeech);
  const [autoRead, setAutoRead] = useState(false);
  useEffect(() => { setAutoRead(localStorage.getItem("civi-autoread") === "1"); }, []);
  const [rec, setRec] = useState<"idle" | "recording" | "working">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  async function toggleMic() {
    if (rec === "recording") { recRef.current?.stop(); return; }
    if (rec !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec("working");
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          const { text } = await transcribe({ data: { audio: btoa(bin), mime: blob.type } });
          if (text) submit(text); else toast("I didn't catch that — try again.");
        } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't hear that"); }
        finally { setRec("idle"); }
      };
      recRef.current = mr;
      mr.start();
      setRec("recording");
    } catch { toast.error("Allow microphone access to talk to Civi."); }
  }
  const lastSpoken = useRef<string | null>(null);
  useEffect(() => {
    const last = msgs.data?.[msgs.data.length - 1];
    if (!autoRead || !last || last.role !== "assistant" || busy) return;
    if (lastSpoken.current === null) { lastSpoken.current = last.id; return; }
    if (lastSpoken.current === last.id) return;
    lastSpoken.current = last.id;
    voice.play(last.id, last.content);
  }, [msgs.data, autoRead, busy]);

  const runRef = useRef(0);
  function stopReply() {
    runRef.current++;
    setPending([]);
    setBusy(false);
    toast("Stopped. Send a new message whenever you're ready.");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

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
    const run = ++runRef.current;
    try {
      await send({ data: { threadId, content } });
      if (run !== runRef.current) { qc.invalidateQueries({ queryKey: ["messages", threadId] }); return; }
      qc.invalidateQueries({ queryKey: ["documents"] });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["messages", threadId] }),
        qc.invalidateQueries({ queryKey: ["threads"] }),
        qc.invalidateQueries({ queryKey: ["memories"] }),
      ]);
    } catch (e) {
      if (run !== runRef.current) return;
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      setInput(content);
      await qc.invalidateQueries({ queryKey: ["messages", threadId] });
    } finally {
      if (run === runRef.current) { setPending([]); setBusy(false); }
    }
  }

  const composerRef = useRef<HTMLFormElement>(null);
  const [composerH, setComposerH] = useState(160);
  const stickRef = useRef(true);
  useEffect(() => {
    const el = composerRef.current; const content = endRef.current?.parentElement;
    const sc = endRef.current?.closest(".overflow-y-auto");
    if (!el || !content || !sc) return;
    // Track whether the user is reading the newest messages; keep them pinned there as things above the composer grow.
    const onScroll = () => { stickRef.current = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 200; };
    sc.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      setComposerH(el.offsetHeight);
      if (stickRef.current) requestAnimationFrame(() => { sc.scrollTop = sc.scrollHeight; });
    });
    ro.observe(el); ro.observe(content);
    return () => { ro.disconnect(); sc.removeEventListener("scroll", onScroll); };
  }, []);
  useEffect(() => {
    const sc = endRef.current?.closest(".overflow-y-auto");
    if (sc && stickRef.current) sc.scrollTop = sc.scrollHeight;
  }, [composerH]);
  return (
    <>
      <PinnedBrowser.Provider value={pinned.data?.id ?? null}>
      <ChatSearch threadId={threadId} leadActions={LEAD_ACTIONS} />
      {(callStatus.data?.active || callStatus.data?.unavailable) ? <div role="status" className="border-b px-5 py-2 text-center text-sm text-muted-foreground">{callStatus.data.unavailable ? "Call report unavailable — checking again shortly. No automatic redial." : "Availability call in progress — the report will appear here when it ends."}</div> : null}
      <div className="flex-1 overflow-y-auto">
        {pinned.data && (
          <div className="sticky top-0 z-20 border-b bg-background/85 px-5 py-2 backdrop-blur">
            <div className="mx-auto max-w-3xl">
              <BrowserCard sessionRowId={pinned.data.id} task={pinned.data.task} />
            </div>
          </div>
        )}
        {thread?.kind === "event" && (
          <div className="sticky top-0 z-10 border-b bg-background/85 px-5 py-2 backdrop-blur">
            <div className="mx-auto flex max-w-3xl items-center gap-2 text-sm">
              <CalendarHeart className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-semibold">{thread.title}</span>
              <span className="shrink-0 text-muted-foreground">· {thread.event_date ? new Date(thread.event_date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Date TBD"}</span>
            </div>
          </div>
        )}
        <div className="mx-auto w-full max-w-3xl px-5 pt-8">
          {preparing.data && <AgentPreparing name={thread?.title ?? "Your agent"} />}
          {!preparing.data && all.length === 0 && !msgs.isLoading && !thread?.title?.endsWith(" Agent") && (
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
                <div key={m.id} id={`msg-${m.id}`} className="flex justify-end rounded-3xl">
                  <div className="bubble-premium max-w-[80%] whitespace-pre-wrap rounded-3xl px-5 py-3">
                    {m.content.replace(/\n*\[\[image:(?:cover|inspiration)\|[^\]]+\]\]/g, "").trim()}
                    {[...m.content.matchAll(/\[\[image:(cover|inspiration)\|([^\]]+)\]\]/g)].map((x) => (
                      <div key={x[2]} className="mt-2"><AttachedImage path={(x[2] ?? "").trim()} role={x[1] ?? "cover"} /></div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={m.id} id={`msg-${m.id}`} className="rounded-3xl">
                  <div className="max-w-[92%] rounded-3xl bg-bubble px-6 py-4">
                    <MessageBody content={m.content.replace(CHOICES_MARKER, "").replace(/\[\[(form_library|letterhead_check)\]\]/g, "").trim()}
                      onAction={m.content.includes("What would you like me to do") ? (t) => submit(`${t} — yes, do the one you just suggested.`) : undefined} />
                    {m.content.includes("[[letterhead_check]]") && m.id === all[all.length - 1]?.id && <LetterheadPrompt onDone={() => submit("Letterhead details are saved — go ahead and create the document.")} onSkipped={() => submit("Skip the missing letterhead details for now and create the document using only the details already provided. Do not ask for letterhead details again this session.")} />}
                    {m.content.includes("[[form_library]]") && m.id === all[all.length - 1]?.id && <FormLibrary logo={orgQ.data?.logo_url} orgName={orgQ.data?.name} onDone={(t) => submit(t)} />}
                  </div>
                  {m.id !== "p" && (
                    <button onClick={() => voice.play(m.id, m.content)} aria-label={voice.speakingId === m.id ? "Stop reading" : "Read aloud"} title={voice.speakingId === m.id ? "Stop" : "Read aloud"}
                      className={`ml-3 mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${voice.speakingId === m.id ? "text-accent" : ""}`}>
                      {voice.speakingId === m.id ? <span className="flex items-end gap-0.5">{[0,1,2].map((i) => <span key={i} className="w-0.5 animate-pulse rounded-full bg-current" style={{ height: 6 + i * 3, animationDelay: `${i * 0.15}s` }} />)}</span> : <Volume2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  {m.id === all[all.length - 1]?.id && !busy && (() => {
                    const c = m.content.match(CHOICES_MARKER);
                    if (!c) return null;
                    return (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(c[1] ?? "").split("|").map((o) => o.trim()).filter(Boolean).map((o) => (
                          <button key={o} onClick={() => submit(o)}
                            className="badge-premium rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary">
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
          <div ref={endRef} aria-hidden style={{ height: composerH + 24 }} />
        </div>
      </div>
      <form
        ref={composerRef}
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-5 pt-8"
      >
        <PendingApprovalsBar threadId={threadId} />
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
        <NextSteps threadId={threadId} msgCount={msgs.data?.length ?? 0} busy={busy} hasChoices={(() => { const l = all[all.length - 1]; return !!l && l.role !== "user" && CHOICES_MARKER.test(l.content); })()} onPick={(p) => submit(p)} />
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
          <button type="button" onClick={() => { const v = !autoRead; setAutoRead(v); localStorage.setItem("civi-autoread", v ? "1" : "0"); toast(v ? "Civi will read replies aloud" : "Read-aloud off"); }}
            aria-label={autoRead ? "Turn off read-aloud" : "Read replies aloud"} title={autoRead ? "Read-aloud on" : "Read replies aloud"}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-secondary ${autoRead ? "text-accent" : "text-muted-foreground"}`}>
            {autoRead ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button type="button" onClick={toggleMic} disabled={busy || rec === "working"}
            aria-label={rec === "recording" ? "Stop and send" : "Talk to Civi"} title={rec === "recording" ? "Tap to send" : "Talk to Civi"}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${rec === "recording" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
            {rec === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />}
            {rec === "working" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="relative h-5 w-5" />}
          </button>
          {busy ? (
            <button type="button" onClick={stopReply} aria-label="Stop" title="Stop Civi's reply"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow transition-colors hover:bg-primary/90">
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || uploading || (!input.trim() && !attachment)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
          )}
        </div>
      </form>
      </PinnedBrowser.Provider>
    </>
  );
}


let currentAudio: HTMLAudioElement | null = null;
function speakable(md: string) {
  return md.replace(/\[\[[\s\S]*?\]\]/g, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*_`>|~]/g, "").replace(/\n{2,}/g, ". ").replace(/\s+/g, " ").trim().slice(0, 4400);
}
function useVoice() {
  const speak = useServerFn(speakText);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  async function play(id: string, content: string) {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if (speakingId === id) { setSpeakingId(null); return; }
    const text = speakable(content);
    if (!text) return;
    setSpeakingId(id);
    try {
      const { audio } = await speak({ data: { text } });
      const a = new Audio(`data:audio/mpeg;base64,${audio}`);
      currentAudio = a;
      a.onended = () => setSpeakingId((s) => (s === id ? null : s));
      await a.play();
    } catch (e) { setSpeakingId(null); toast.error(e instanceof Error ? e.message : "Couldn't play voice"); }
  }
  return { play, speakingId };
}

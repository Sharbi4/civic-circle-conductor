import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, CalendarHeart, ExternalLink, Mail, Megaphone, MonitorUp, Phone, Square, Vote, HeartPulse, MessageSquareHeart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendOrganizerMessage } from "@/lib/organizer.functions";
import { endBrowserSession } from "@/lib/browser.functions";
import { useThreads } from "./chat";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ThreadPage,
});

type Msg = { id: string; role: string; content: string };

function ThreadPage() {
  const { threadId } = Route.useParams();
  return <ChatWindow key={threadId} threadId={threadId} />;
}

const BROWSER_MARKER = /\[\[browser:\s*([0-9a-f-]{36})\s*\|(.+?)\]\]/g;

function MessageBody({ content }: { content: string }) {
  type Part = { kind: "text"; text: string } | { kind: "browser"; id: string; task: string };
  const parts: Part[] = [];
  let last = 0;
  for (const match of content.matchAll(BROWSER_MARKER)) {
    const idx = match.index ?? 0;
    if (idx > last) parts.push({ kind: "text", text: content.slice(last, idx) });
    parts.push({ kind: "browser", id: match[1] ?? "", task: (match[2] ?? "").trim() });
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
        ) : (
          <BrowserCard key={p.id} sessionRowId={p.id} task={p.task} />
        ),
      )}
    </div>
  );
}

function BrowserCard({ sessionRowId, task }: { sessionRowId: string; task: string }) {
  const qc = useQueryClient();
  const end = useServerFn(endBrowserSession);
  const [ending, setEnding] = useState(false);

  const session = useQuery({
    queryKey: ["browser_session", sessionRowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("browser_sessions").select("id, live_url, status").eq("id", sessionRowId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const running = session.data?.status === "running" && session.data.live_url;

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
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
            <p className="text-xs text-muted-foreground">Watch Civi work — or click in and take over.</p>
            <div className="flex shrink-0 gap-2">
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
        </>
      ) : (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">This browser session has ended.</p>
      )}
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

function ChatWindow({ threadId }: { threadId: string }) {
  const qc = useQueryClient();
  const send = useServerFn(sendOrganizerMessage);
  const threads = useThreads();
  const thread = threads.data?.find((t) => t.id === threadId);
  const [pending, setPending] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const all = [...(msgs.data ?? []), ...pending];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [all.length, busy]);
  useEffect(() => { inputRef.current?.focus(); }, [busy]);

  async function submit(text: string) {
    const content = text.trim();
    if (!content || busy) return;
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
      <div className="flex-1 overflow-y-auto">
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
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="max-w-[92%] rounded-3xl bg-bubble px-6 py-4">
                  <MessageBody content={m.content} />
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
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-full border bg-card py-2 pl-6 pr-2 shadow-soft">
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
            disabled={busy || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </>
  );
}

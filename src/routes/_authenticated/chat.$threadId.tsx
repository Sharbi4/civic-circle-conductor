import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendOrganizerMessage } from "@/lib/organizer.functions";
import { useThreads } from "./chat";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ThreadPage,
});

type Msg = { id: string; role: string; content: string };

function ThreadPage() {
  const { threadId } = Route.useParams();
  return <ChatWindow key={threadId} threadId={threadId} />;
}

const STARTERS = [
  "Plan a volunteer recruitment push for this month",
  "Draft a post announcing our next community meeting",
  "Build a 2-week outreach calendar across our channels",
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
            <div className="flex flex-col items-center pt-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-soft">
                <Megaphone className="h-7 w-7" />
              </div>
              <h2 className="font-display mt-5 text-3xl font-bold">
                {thread?.kind === "main" ? "Your organizer is ready." : thread?.title}
              </h2>
              <p className="mt-2 text-muted-foreground">Tell it what you want to move forward.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => submit(s)} className="rounded-full border bg-card px-4 py-2 text-sm hover:bg-secondary">
                    {s}
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
                  <div className="prose-chat leading-relaxed">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
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

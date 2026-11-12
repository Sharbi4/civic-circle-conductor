import { useEffect, useMemo, useRef, useState } from "react";
import { formatAppTime } from "@/lib/appTimeZone";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const RANGES = [{ k: "all", label: "All", days: 0 }, { k: "1", label: "Today", days: 1 }, { k: "7", label: "7 days", days: 7 }, { k: "30", label: "30 days", days: 30 }] as const;

export function ChatSearch({ threadId, leadActions }: { threadId: string; leadActions: { title: string; prompt: string }[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<string>("all");
  const [leadOnly, setLeadOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 150); }, [open]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); if ((e.metaKey || e.ctrlKey) && e.key === "f" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); setOpen(true); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  const msgs = useQuery({
    queryKey: ["chat-search", threadId], enabled: open,
    queryFn: async () => (await supabase.from("messages").select("id, role, content, created_at").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(500)).data ?? [],
  });
  const leadOf = (c: string) => leadActions.find((a) => c.trim() === a.prompt)?.title;
  const results = useMemo(() => {
    const days = RANGES.find((r) => r.k === range)?.days ?? 0;
    const since = days ? Date.now() - days * 86400000 : 0;
    const needle = q.trim().toLowerCase();
    return (msgs.data ?? []).filter((m) => new Date(m.created_at).getTime() >= since && (!leadOnly || leadOf(m.content)) && (!needle || m.content.toLowerCase().includes(needle))).slice(0, 60);
  }, [msgs.data, q, range, leadOnly]);
  const active = open && (q.trim() || range !== "all" || leadOnly);

  function jump(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.animate([{ boxShadow: "0 0 0 3px hsl(200 90% 70% / .6)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1600 });
  }
  const snippet = (c: string) => {
    const t = c.replace(/\[\[[^\]]*\]\]/g, "").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
    const i = q.trim() ? t.toLowerCase().indexOf(q.trim().toLowerCase()) : 0;
    return (i > 40 ? "…" : "") + t.slice(Math.max(0, i - 40), Math.max(0, i - 40) + 120);
  };

  return (
    <div className="absolute right-3 top-3 z-40 flex flex-col items-end">
      <div className={`flex h-8 items-center overflow-hidden rounded-full border bg-background/80 backdrop-blur transition-all duration-300 ease-out ${open ? "w-[min(340px,80vw)] shadow-soft" : "w-8 border-transparent bg-transparent"}`}>
        <button type="button" aria-label={open ? "Close search" : "Search chat"} onClick={() => setOpen(!open)} className="grid h-8 w-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground">
          {open ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
        </button>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this chat…" tabIndex={open ? 0 : -1}
          className={`h-8 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`} />
      </div>
      {open && (
        <div className="mt-2 w-[min(340px,80vw)] rounded-2xl border bg-background/95 p-2 shadow-soft backdrop-blur animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-wrap gap-1">
            {RANGES.map((r) => <button key={r.k} type="button" onClick={() => setRange(r.k)} className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${range === r.k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"}`}>{r.label}</button>)}
            <button type="button" onClick={() => setLeadOnly(!leadOnly)} className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors ${leadOnly ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"}`}><Zap className="h-3 w-3" /> Lead actions</button>
          </div>
          {active && (
            <ul className="mt-2 max-h-[50vh] space-y-0.5 overflow-y-auto">
              {msgs.isLoading && <li className="px-2 py-3 text-xs text-muted-foreground">Searching…</li>}
              {!msgs.isLoading && results.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">Nothing found.</li>}
              {results.map((m) => {
                const lead = leadOf(m.content);
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => jump(m.id)} className="w-full rounded-xl px-2.5 py-2 text-left hover:bg-secondary">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>{formatAppTime(m.created_at)}</span>
                        <span>· {m.role === "user" ? "You" : "Civi"}</span>
                        {lead && <span className="inline-flex items-center gap-0.5 normal-case tracking-normal text-accent"><Zap className="h-2.5 w-2.5" />{lead}</span>}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs">{lead ? `Started "${lead}"` : snippet(m.content)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

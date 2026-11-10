import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MessageCircle, Plus, Plug, LogOut, Pin, Brain } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONNECTORS } from "@/lib/connectors";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Organizer — Civi Meet" },
      { name: "description", content: "Chat with your AI community organizer." },
      { property: "og:title", content: "Organizer — Civi Meet" },
      { property: "og:description", content: "Chat with your AI community organizer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatLayout,
});

export function useOrg() {
  return useQuery({
    queryKey: ["org"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("organizations").select("*").eq("user_id", u.user!.id).maybeSingle();
      return data;
    },
  });
}

export function useThreads() {
  return useQuery({
    queryKey: ["threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("threads").select("*").order("kind").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function ChatLayout() {
  const org = useOrg();
  if (org.isLoading) return <div className="min-h-screen" />;
  if (!org.data?.onboarded) return <Onboarding existing={org.data} />;
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar orgName={org.data.name ?? ""} />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function Sidebar({ orgName }: { orgName: string }) {
  const threads = useThreads();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { threadId?: string };
  const [tab, setTab] = useState<"chats" | "connectors" | "memory">("chats");
  const main = threads.data?.find((t) => t.kind === "main");
  const side = threads.data?.filter((t) => t.kind !== "main") ?? [];

  async function newSide() {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("threads").insert({ user_id: u.user!.id, kind: "side" }).select().single();
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["threads"] });
    navigate({ to: "/chat/$threadId", params: { threadId: data.id } });
  }

  const railBtn = (key: typeof tab, Icon: typeof MessageCircle, label: string) => (
    <button
      aria-label={label}
      onClick={() => setTab(key)}
      className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${tab === key ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary"}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );

  return (
    <>
      <nav className="hidden w-[72px] flex-col items-center gap-3 border-r bg-rail py-5 md:flex">
        <div className="font-display mb-3 text-xl font-bold text-primary">C</div>
        {railBtn("chats", MessageCircle, "Chats")}
        {railBtn("connectors", Plug, "Connectors")}
        {railBtn("memory", Brain, "Memory")}
        <div className="flex-1" />
        <button aria-label="Sign out" onClick={() => supabase.auth.signOut()} className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground hover:bg-secondary">
          <LogOut className="h-5 w-5" />
        </button>
      </nav>
      <aside className="hidden w-[280px] flex-col border-r bg-sidebar md:flex">
        <div className="px-5 pb-3 pt-5">
          <div className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">{orgName}</div>
        </div>
        {tab === "chats" && (
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {main && (
              <Link
                to="/chat/$threadId"
                params={{ threadId: main.id }}
                className={`block rounded-2xl px-3 py-2.5 font-medium ${params.threadId === main.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent"}`}
              >
                Main chat
              </Link>
            )}
            <div className="mt-4 flex items-center justify-between px-3 text-sm text-muted-foreground">
              Side chats
              <button aria-label="New side chat" onClick={newSide} className="rounded-lg p-1 hover:bg-sidebar-accent">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {side.map((t) => (
                <Link
                  key={t.id}
                  to="/chat/$threadId"
                  params={{ threadId: t.id }}
                  className={`flex items-center gap-2 truncate rounded-2xl px-3 py-2.5 ${params.threadId === t.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent"}`}
                >
                  {t.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{t.title}</span>
                </Link>
              ))}
              {side.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No side chats yet.</p>}
            </div>
          </div>
        )}
        {tab === "connectors" && (
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <p className="px-3 pb-3 text-sm text-muted-foreground">
              Connect a channel and a dedicated agent opens as its own side chat.
            </p>
            {CONNECTORS.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent">
                <span>{c.name}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Soon</span>
              </div>
            ))}
          </div>
        )}
        {tab === "memory" && <MemoryPanel />}
      </aside>
    </>
  );
}

function MemoryPanel() {
  const org = useOrg();
  const mem = useQuery({
    queryKey: ["memories"],
    queryFn: async () => (await supabase.from("memories").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-4 text-sm">
      <div className="font-semibold">Mission</div>
      <p className="mt-1 text-muted-foreground">{org.data?.mission}</p>
      <div className="mt-5 font-semibold">What the organizer remembers</div>
      <ul className="mt-2 space-y-2">
        {mem.data?.map((m) => (
          <li key={m.id} className="rounded-xl bg-secondary px-3 py-2">{m.content}</li>
        ))}
        {mem.data?.length === 0 && <li className="text-muted-foreground">Nothing yet — just chat.</li>}
      </ul>
    </div>
  );
}

function Onboarding({ existing }: { existing: { name: string | null; mission: string | null } | null | undefined }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(existing?.name ? 1 : 0);
  const [name, setName] = useState(existing?.name ?? "");
  const [mission, setMission] = useState(existing?.mission ?? "");
  const [busy, setBusy] = useState(false);

  async function save(finish: boolean) {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user!.id;
    const { error } = await supabase.from("organizations").upsert({ user_id: uid, name, mission, onboarded: finish });
    if (!error && finish) {
      const { data: has } = await supabase.from("threads").select("id").eq("kind", "main").maybeSingle();
      if (!has) await supabase.from("threads").insert({ user_id: uid, kind: "main", title: "Main chat" });
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (finish) qc.invalidateQueries();
    else setStep(1);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <div className="text-sm text-muted-foreground">Step {step + 1} of 2</div>
        {step === 0 ? (
          <form onSubmit={(e) => { e.preventDefault(); save(false); }}>
            <h1 className="font-display mt-2 text-4xl font-bold">What's your organization called?</h1>
            <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aurora Tenants United" className="mt-6 h-12 rounded-2xl text-lg" />
            <Button type="submit" disabled={busy || !name.trim()} className="mt-5 rounded-full px-8">Continue</Button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); save(true); }}>
            <h1 className="font-display mt-2 text-4xl font-bold">What's your mission?</h1>
            <p className="mt-2 text-muted-foreground">This becomes the background for your organizer and every agent.</p>
            <Textarea autoFocus required rows={5} value={mission} onChange={(e) => setMission(e.target.value)} placeholder="We organize renters in Aurora to win fair housing protections…" className="mt-6 rounded-2xl text-base" />
            <div className="mt-5 flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(0)}>Back</Button>
              <Button type="submit" disabled={busy || !mission.trim()} className="rounded-full px-8">Meet your organizer</Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type React from "react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessageCircle, Plus, Plug, LogOut, Pin, Brain, Inbox, Megaphone, CalendarCheck, CreditCard, Sparkles, Check, X, Compass, Trash2, KeyRound, Mic, FileText, ImagePlus, BarChart3, Menu, ListChecks, UserCircle, ChevronDown, Loader2 } from "lucide-react";
import { PollsPanel } from "@/components/polls/PollsPanel";
import { TasksPanel } from "@/components/tasks/TasksPanel";
import { AccountPanel } from "@/components/account/AccountPanel";
import { SwipeToIgnore } from '@/components/SwipeToIgnore';
import { takeDiscoveryAction } from "@/lib/discovery.functions";
import { discoveryIdeas } from "@/lib/discovery.shared";
import { decideApproval } from '@/lib/approvals.functions';
import { approvalKind, approvalStateLabel } from '@/lib/approvals.shared';
import { isChatUnread } from '@/lib/inbox.shared';
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONNECTORS } from "@/lib/connectors";
import { startLinkedInConnect, completeLinkedInConnect, getLinkedInStatus, disconnectLinkedIn, runLinkedInApproval, setLinkedInOrgPage, LINKEDIN_WELCOME } from "@/lib/linkedin.functions";
import { startEventbriteConnect, completeEventbriteConnect, getEventbriteStatus, disconnectEventbrite, runEventbriteApproval, EVENTBRITE_WELCOME } from "@/lib/eventbrite.functions";
import { saveSiteCredential } from "@/lib/credentials.functions";
import { sendOrganizerMessage } from "@/lib/organizer.functions";
import { runOnboardingResearch, scanOrgProfile } from "@/lib/research.functions";
import { transcribeSpeech } from "@/lib/voice.functions";
import { writeAgentWelcome } from "@/lib/suggestions.functions";
import { startXConnect, completeXConnect, getXStatus, disconnectX, runXApproval, X_WELCOME } from "@/lib/x.functions";
import { runFacebookApproval, startBrowserSession } from "@/lib/browser.functions";
import { SiFacebook, SiNextdoor, SiX } from "react-icons/si";
import { FaLinkedin } from "react-icons/fa";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { startNextdoorConnect, completeNextdoorConnect, getNextdoorStatus, disconnectNextdoor } from "@/lib/nextdoor.functions";

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

export function useApprovals() {
  return useQuery({
    queryKey: ["approvals"],
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useThreads() {
  return useQuery({
    queryKey: ["threads"],
    refetchInterval: 10000,
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
  const [navOpen, setNavOpen] = useState(false);
  if (org.isLoading) return <div className="min-h-screen" />;
  if (!org.data?.onboarded) return <Onboarding existing={org.data} />;
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar orgName={org.data.name ?? ""} mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <button type="button" aria-label="Open menu" onClick={() => setNavOpen(true)}
          className="absolute left-3 top-3 z-40 grid h-8 w-8 place-items-center rounded-full border bg-background/80 text-muted-foreground backdrop-blur md:hidden">
          <Menu className="h-4 w-4" />
        </button>
        <Outlet />
      </main>
    </div>
  );
}

function Sidebar({ orgName, mobileOpen, onClose }: { orgName: string; mobileOpen: boolean; onClose: () => void }) {
  const threads = useThreads();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { threadId?: string };
  useEffect(() => { onClose(); }, [params.threadId]);
  const [tab, setTab] = useState<"chats" | "connectors" | "memory" | "approvals" | "scout" | "logins" | "documents" | "polls" | "tasks" | "account">("chats");
  const approvals = useApprovals();
  const pendingCount = approvals.data?.filter((a) => a.status === "pending").length ?? 0;
  const main = threads.data?.find((t) => t.kind === "main");
  const side = threads.data?.filter((t) => t.kind !== "main") ?? [];
  const activeThread = threads.data?.find((t) => t.id === params.threadId);
  useEffect(() => {
    if (!activeThread || !isChatUnread(activeThread.latest_assistant_at, activeThread.last_read_at) || document.visibilityState !== 'visible') return;
    supabase.from('threads').update({ last_read_at: new Date().toISOString() }).eq('id', activeThread.id).then(({error}) => { if (!error) qc.invalidateQueries({queryKey:['threads']}); });
  }, [activeThread?.id, activeThread?.latest_assistant_at]);
  async function togglePin(id: string, pinned: boolean) {
    const { error } = await supabase.from("threads").update({ pinned }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["threads"] });
  }
  async function deleteChat(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    const { error } = await supabase.from("threads").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["threads"] });
    if (params.threadId === id && main) navigate({ to: "/chat/$threadId", params: { threadId: main.id } });
    toast.success("Chat deleted");
  }

  async function newSide() {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("threads").insert({ user_id: u.user!.id, kind: "side" }).select().single();
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["threads"] });
    navigate({ to: "/chat/$threadId", params: { threadId: data.id } });
  }

  const railBtn = (key: typeof tab, Icon: typeof MessageCircle, label: string, badge = 0) => (
    <button
      aria-label={label}
      onClick={() => setTab(key)}
      className={`relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${tab === key ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary"}`}
    >
      <Icon className="h-5 w-5" />
      {badge > 0 && (
        <span className="badge-premium absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );

  const [sbW, setSbW] = useState(280);
  useEffect(() => { const v = Number(localStorage.getItem("civi-sidebar-w")); if (v >= 220 && v <= 560) setSbW(v); }, []);
  function startSbDrag(e: React.PointerEvent) {
    e.preventDefault(); const x0 = e.clientX, w0 = sbW; let w = w0;
    const move = (ev: PointerEvent) => { w = Math.min(560, Math.max(220, w0 + ev.clientX - x0)); setSbW(w); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; document.body.style.userSelect = ""; localStorage.setItem("civi-sidebar-w", String(w)); };
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  return (
    <div className={mobileOpen ? "fixed inset-0 z-50 flex bg-background md:static md:z-auto md:contents" : "hidden md:contents"}>
      {mobileOpen && <button type="button" aria-label="Close menu" onClick={onClose} className="absolute right-3 top-3 z-50 grid h-8 w-8 place-items-center rounded-full border bg-background md:hidden"><X className="h-4 w-4" /></button>}
      <nav className="flex w-[64px] shrink-0 flex-col items-center gap-3 overflow-y-auto border-r bg-rail py-5 md:w-[72px]">
        <div className="font-display mb-3 text-xl font-bold text-primary">C</div>
        {railBtn("chats", MessageCircle, "Chats")}
        {railBtn("approvals", Inbox, "Approvals", pendingCount)}
        {railBtn("tasks", ListChecks, "Goals & tasks")}
        {railBtn("connectors", Plug, "Connectors")}
        {railBtn("documents", FileText, "Documents")}
        {railBtn("polls", BarChart3, "Polls & feedback")}
        {railBtn("scout", Compass, "Discovery")}
        {railBtn("memory", Brain, "Memory")}
        {railBtn("logins", KeyRound, "Settings: saved logins")}
        {railBtn("account", UserCircle, "My account")}
        <div className="flex-1" />
        <button aria-label="Sign out" onClick={() => supabase.auth.signOut()} className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground hover:bg-secondary">
          <LogOut className="h-5 w-5" />
        </button>
      </nav>
      <aside style={{ width: mobileOpen && typeof window !== "undefined" && window.innerWidth < 768 ? undefined : sbW }} className="relative flex min-w-0 flex-1 flex-col border-r bg-sidebar md:flex-none md:shrink-0">
        <div role="separator" aria-orientation="vertical" aria-label="Resize sidebar" title="Drag to resize · double-click to reset" onPointerDown={startSbDrag} onDoubleClick={() => { setSbW(280); localStorage.setItem("civi-sidebar-w", "280"); }}
          className="absolute -right-1.5 top-0 z-20 h-full w-3 cursor-col-resize after:absolute after:left-1/2 after:top-0 after:h-full after:w-px after:bg-transparent hover:after:bg-accent" />
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
                Main chat {params.threadId !== main.id && isChatUnread(main.latest_assistant_at, main.last_read_at) && <span aria-label="Unread messages" className="ml-2 inline-block h-2 w-2 rounded-full bg-primary" />}
              </Link>
            )}
            <div className="mt-4 flex items-center justify-between px-3 text-sm text-muted-foreground">
              Side chats
              <NewChatMenu onBlank={newSide} />
            </div>
            <div className="mt-1 space-y-0.5">
              {[...side].sort((a, b) => Number(b.pinned) - Number(a.pinned)).map((t) => (
                <div key={t.id} className={`group flex items-center rounded-2xl ${params.threadId === t.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent"}`}>
                  <Link to="/chat/$threadId" params={{ threadId: t.id }} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
                    {t.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{t.title}</span>
                    {params.threadId !== t.id && isChatUnread(t.latest_assistant_at, t.last_read_at) && <span aria-label="Unread messages" className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </Link>
                  <div className="flex shrink-0 gap-0.5 pr-2 opacity-60 transition-opacity group-hover:opacity-100">
                    <button title={t.pinned ? "Unpin chat" : "Pin chat"} aria-label={t.pinned ? "Unpin chat" : "Pin chat"} onClick={() => togglePin(t.id, !t.pinned)} className="rounded-full p-1.5 hover:bg-background/60"><Pin className={`h-3.5 w-3.5 ${t.pinned ? "fill-current" : ""}`} /></button>
                    <button title="Delete chat" aria-label="Delete chat" onClick={() => deleteChat(t.id, t.title)} className="rounded-full p-1.5 hover:bg-background/60"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
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
            {CONNECTORS.map((c) =>
              c.id === "eventbrite" ? (
                <EventbriteConnectorRow key={c.id} />
              ) : c.id === "nextdoor" ? (
                <NextdoorConnectorRow key={c.id} />
              ) : c.id === "x" ? (
                <XConnectorRow key={c.id} />
              ) : c.id === "linkedin" ? (
                <LinkedInConnectorRow key={c.id} />
              ) : (
                <div key={c.id} className="flex items-center justify-between rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent">
                  <span>{c.name}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Soon</span>
                </div>
              ),
            )}
          </div>
        )}
        {tab === "approvals" && <ApprovalsPanel />}
        {tab === "scout" && <ScoutPanel onConnect={() => setTab("connectors")} onOpenChat={onClose} />}
        {tab === "memory" && <MemoryPanel />}
        {tab === "logins" && <LoginsPanel />}
        {tab === "documents" && <DocumentsPanel />}
        {tab === "polls" && <PollsPanel />}
        {tab === "tasks" && <TasksPanel />}
        {tab === "account" && <AccountPanel />}
      </aside>
    </div>
  );
}

function EventbriteConnectorRow() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["eventbrite-status"], queryFn: () => getEventbriteStatus() });

  function waitForOAuth(popup: Window) {
    return new Promise<string>((resolve, reject) => {
      let poll: number | undefined;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        if (poll !== undefined) window.clearInterval(poll);
      };
      const onMessage = (event: MessageEvent) => {
        // The OAuth popup can land on the published domain while the opener is
        // the preview (Eventbrite allows only one redirect URI), so accept our
        // own app origins rather than only this window's origin.
        if (!event.origin.endsWith(".lovable.app") || event.source !== popup) return;
        const type = event.data?.type;
        if (event.data?.connectorId !== "eventbrite") return;
        if (type !== "civiOauthComplete" && type !== "civiOauthFailed") return;
        cleanup();
        if (type === "civiOauthComplete" && typeof event.data?.code === "string") resolve(event.data.code);
        else { popup.close(); reject(new Error("Eventbrite connection failed.")); }
      };
      window.addEventListener("message", onMessage);
      poll = window.setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        reject(new Error("Eventbrite window closed before finishing."));
      }, 500);
    });
  }

  async function connect() {
    setBusy(true);
    const popup = window.open("", "civi-eventbrite-oauth", "width=600,height=720");
    if (!popup) { setBusy(false); toast.error("Popup blocked — allow popups and try again."); return; }
    try {
      const { authorizationUrl } = await startEventbriteConnect();
      const completion = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      const result = await completeEventbriteConnect({ data: { code } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["eventbrite-status"] }),
        qc.invalidateQueries({ queryKey: ["threads"] }),
      ]);
      toast.success(`Connected to Eventbrite as ${result.accountName}`);
      if (result.threadId) navigate({ to: "/chat/$threadId", params: { threadId: result.threadId } });
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Eventbrite connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectEventbrite();
      await qc.invalidateQueries({ queryKey: ["eventbrite-status"] });
      toast.success("Eventbrite disconnected.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }

  const connected = status.data?.connected;
  return (
    <div className="rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent">
      <div className="flex items-center justify-between">
        <span>Eventbrite</span>
        {status.isLoading ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">…</span>
        ) : connected ? (
          <span className="badge-premium rounded-full px-2.5 py-0.5 text-xs font-semibold">Connected</span>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={connect} className="h-7 rounded-full px-3 text-xs">
            {busy ? "Connecting…" : "Connect"}
          </Button>
        )}
      </div>
      {connected && (
        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{status.data?.accountName}</span>
          <button onClick={disconnect} disabled={busy} className="ml-2 shrink-0 underline hover:text-foreground">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function NextdoorConnectorRow() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["nextdoor-status"], queryFn: () => getNextdoorStatus() });

  function waitForOAuth(popup: Window) {
    return new Promise<string>((resolve, reject) => {
      let poll: number | undefined;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        if (poll !== undefined) window.clearInterval(poll);
      };
      const onMessage = (event: MessageEvent) => {
        // The OAuth popup can land on the published domain while the opener is
        // the preview (Nextdoor allows only one redirect URI), so accept our
        // own app origins rather than only this window's origin.
        if (!event.origin.endsWith(".lovable.app") || event.source !== popup) return;
        const type = event.data?.type;
        if (event.data?.connectorId !== "nextdoor") return;
        if (type !== "civiOauthComplete" && type !== "civiOauthFailed") return;
        cleanup();
        if (type === "civiOauthComplete" && typeof event.data?.code === "string") resolve(event.data.code);
        else { popup.close(); reject(new Error("Nextdoor connection failed.")); }
      };
      window.addEventListener("message", onMessage);
      poll = window.setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        reject(new Error("Nextdoor window closed before finishing."));
      }, 500);
    });
  }

  async function connect() {
    setBusy(true);
    const popup = window.open("", "civi-nextdoor-oauth", "width=600,height=720");
    if (!popup) { setBusy(false); toast.error("Popup blocked — allow popups and try again."); return; }
    try {
      const { authorizationUrl } = await startNextdoorConnect();
      const completion = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      const result = await completeNextdoorConnect({ data: { code } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["nextdoor-status"] }),
        qc.invalidateQueries({ queryKey: ["threads"] }),
      ]);
      toast.success(`Connected to Nextdoor as ${result.accountName}`);
      if (result.threadId) navigate({ to: "/chat/$threadId", params: { threadId: result.threadId } });
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Nextdoor connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectNextdoor();
      await qc.invalidateQueries({ queryKey: ["nextdoor-status"] });
      toast.success("Nextdoor disconnected.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }

  const connected = status.data?.connected;
  return (
    <div className="rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent">
      <div className="flex items-center justify-between">
        <span>Nextdoor</span>
        {status.isLoading ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">…</span>
        ) : connected ? (
          <span className="badge-premium rounded-full px-2.5 py-0.5 text-xs font-semibold">Connected</span>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={connect} className="h-7 rounded-full px-3 text-xs">
            {busy ? "Connecting…" : "Connect"}
          </Button>
        )}
      </div>
      {connected && (
        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{status.data?.accountName}</span>
          <button onClick={disconnect} disabled={busy} className="ml-2 shrink-0 underline hover:text-foreground">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function LinkedInConnectorRow() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["linkedin-status"], queryFn: () => getLinkedInStatus() });

  function waitForOAuth(popup: Window) {
    return new Promise<string>((resolve, reject) => {
      let poll: number | undefined;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        if (poll !== undefined) window.clearInterval(poll);
      };
      const onMessage = (event: MessageEvent) => {
        // The OAuth popup can land on the published domain while the opener is
        // the preview (LinkedIn allows only one redirect URI), so accept our
        // own app origins rather than only this window's origin.
        if (event.origin !== window.location.origin || event.source !== popup) return;
        const type = event.data?.type;
        if (event.data?.connectorId !== "linkedin") return;
        if (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed") return;
        cleanup();
        if (type === "appUserConnectorOAuthComplete" && typeof event.data?.code === "string") resolve(event.data.code);
        else { popup.close(); reject(new Error("LinkedIn connection failed.")); }
      };
      window.addEventListener("message", onMessage);
      poll = window.setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        reject(new Error("LinkedIn window closed before finishing."));
      }, 500);
    });
  }

  async function connect() {
    setBusy(true);
    const popup = window.open("", "civi-linkedin-oauth", "width=600,height=720");
    if (!popup) { setBusy(false); toast.error("Popup blocked — allow popups and try again."); return; }
    try {
      const { authorizationUrl } = await startLinkedInConnect();
      const completion = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      const result = await completeLinkedInConnect({ data: { code } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["linkedin-status"] }),
        qc.invalidateQueries({ queryKey: ["threads"] }),
      ]);
      toast.success(`Connected to LinkedIn as ${result.accountName}`);
      if (result.threadId) navigate({ to: "/chat/$threadId", params: { threadId: result.threadId } });
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "LinkedIn connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectLinkedIn();
      await qc.invalidateQueries({ queryKey: ["linkedin-status"] });
      toast.success("LinkedIn disconnected.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }

  const connected = status.data?.connected;
  return (
    <div className="rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent">
      <div className="flex items-center justify-between">
        <span>LinkedIn</span>
        {status.isLoading ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">…</span>
        ) : connected ? (
          <span className="badge-premium rounded-full px-2.5 py-0.5 text-xs font-semibold">Connected</span>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={connect} className="h-7 rounded-full px-3 text-xs">
            {busy ? "Connecting…" : "Connect"}
          </Button>
        )}
      </div>
      {connected && (
        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{status.data?.accountName}</span>
          <button onClick={disconnect} disabled={busy} className="ml-2 shrink-0 underline hover:text-foreground">
            Disconnect
          </button>
        </div>
      )}
      {connected && <LinkedInPageField current={status.data?.orgPageId ?? ""} />}
    </div>
  );
}

function XConnectorRow() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["x-status"], queryFn: () => getXStatus() });

  function waitForOAuth(popup: Window) {
    return new Promise<string>((resolve, reject) => {
      let poll: number | undefined;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        if (poll !== undefined) window.clearInterval(poll);
      };
      const onMessage = (event: MessageEvent) => {
        // The OAuth popup can land on the published domain while the opener is
        // the preview (X allows only one redirect URI), so accept our
        // own app origins rather than only this window's origin.
        if (event.origin !== window.location.origin || event.source !== popup) return;
        const type = event.data?.type;
        if (event.data?.connectorId !== "x") return;
        if (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed") return;
        cleanup();
        if (type === "appUserConnectorOAuthComplete" && typeof event.data?.code === "string") resolve(event.data.code);
        else { popup.close(); reject(new Error("X connection failed.")); }
      };
      window.addEventListener("message", onMessage);
      poll = window.setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        reject(new Error("X window closed before finishing."));
      }, 500);
    });
  }

  async function connect() {
    setBusy(true);
    const popup = window.open("", "civi-x-oauth", "width=600,height=720");
    if (!popup) { setBusy(false); toast.error("Popup blocked — allow popups and try again."); return; }
    try {
      const { authorizationUrl } = await startXConnect();
      const completion = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      const result = await completeXConnect({ data: { code } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["x-status"] }),
        qc.invalidateQueries({ queryKey: ["threads"] }),
      ]);
      toast.success(`Connected to X as ${result.accountName}`);
      if (result.threadId) navigate({ to: "/chat/$threadId", params: { threadId: result.threadId } });
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "X connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectX();
      await qc.invalidateQueries({ queryKey: ["x-status"] });
      toast.success("X disconnected.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }

  const connected = status.data?.connected;
  return (
    <div className="rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent">
      <div className="flex items-center justify-between">
        <span>X</span>
        {status.isLoading ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">…</span>
        ) : connected ? (
          <span className="badge-premium rounded-full px-2.5 py-0.5 text-xs font-semibold">Connected</span>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={connect} className="h-7 rounded-full px-3 text-xs">
            {busy ? "Connecting…" : "Connect"}
          </Button>
        )}
      </div>
      {connected && (
        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{status.data?.accountName}</span>
          <button onClick={disconnect} disabled={busy} className="ml-2 shrink-0 underline hover:text-foreground">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function LinkedInPageField({ current }: { current: string }) {
  const qc = useQueryClient();
  const save = useServerFn(setLinkedInOrgPage);
  const [val, setVal] = useState(current);
  const [saving, setSaving] = useState(false);
  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setSaving(true);
    try {
      await save({ data: { orgPageId: val.trim() } });
      toast.success(val.trim() ? "Events will be organized under your company page." : "Events will be organized under your profile.");
      qc.invalidateQueries({ queryKey: ["linkedin-status"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally { setSaving(false); }
  }
  return (
    <form onSubmit={submit} className="mt-2 flex items-center gap-1.5">
      <input
        value={val} onChange={(e) => setVal(e.target.value)} inputMode="numeric" aria-label="LinkedIn company page ID"
        placeholder="Company page ID (optional)"
        className="h-7 min-w-0 flex-1 rounded-full border border-input bg-background px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
      />
      <Button type="submit" size="sm" variant="outline" disabled={saving || val === current} className="h-7 rounded-full px-2.5 text-xs">Save</Button>
    </form>
  );
}

const APPROVAL_TYPE: Record<string, { Icon: typeof Megaphone; label: string }> = {
  outreach: { Icon: Megaphone, label: "Outreach" },
  booking: { Icon: CalendarCheck, label: "Booking" },
  payment: { Icon: CreditCard, label: "Payment" },
  other: { Icon: Sparkles, label: "Action" },
};

function ApprovalsPanel() {
  const approvals = useApprovals();
  const threads = useThreads();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const runDecision = useServerFn(decideApproval);
  const preferences = useQuery({ queryKey: ['approval_preferences'], queryFn: async () => {
    const { data, error } = await supabase.from('approval_preferences').select('id, label');
    if (error) throw error;
    return data;
  }});
  const main = threads.data?.find((t) => t.kind === "main");
  const pending = approvals.data?.filter((a) => a.status === "pending") ?? [];
  const resolved = approvals.data?.filter((a) => a.status !== "pending" && a.status !== "ignored") ?? [];
  async function ignore(id: string) {
    setBusyId(id);
    const { error } = await supabase.from('approvals').update({status:'ignored',resolved_at:new Date().toISOString()}).eq('id',id).eq('status','pending');
    setBusyId(null);
    if(error) {toast.error("Couldn't ignore this item");return;}
    await qc.invalidateQueries({queryKey:['approvals']});
    toast('Ignored — no action will be taken', {action:{label:'Undo',onClick:async()=>{await supabase.from('approvals').update({status:'pending',resolved_at:null}).eq('id',id).eq('status','ignored');qc.invalidateQueries({queryKey:['approvals']});}}});
  }

  async function respond(id: string, decision: "approved" | "declined", title: string, browserSessionId?: string | null, payload?: unknown, mode: 'once' | 'always' = 'once') {
    if (busyId) return;
    setBusyId(id);
    try {
      if (decision === 'declined') {
        const { error } = await supabase.from('approvals').update({ status: 'declined', resolved_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
        if (error) throw error;
        toast('Declined — no action will be taken');
        return;
      }
      const result = await runDecision({ data: { approvalId: id, mode } });
      const kind = approvalKind(payload);
      if (kind.startsWith('fb_')) {
        toast('Queued — waiting for Facebook to finish');
      } else if (browserSessionId) {
        const { error } = await supabase.from('browser_sessions').update({ agent_status: 'driving', submit_approved: true, active_approval_id: id }).eq('id', browserSessionId);
        if (error) throw error;
        await supabase.from('approvals').update({ run_state: 'running' }).eq('id', id);
        toast('Working in the browser');
      } else if ('ok' in result && result.ok === false) toast.error('Failed — see the chat for details');
      else if (kind === 'eventbrite_create') toast.success('Success — Eventbrite draft created');
      else if (kind.startsWith('linkedin_') || kind === 'x_post') toast.success('Success — confirmed by the service');
      else toast('Approved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't complete this action");
    } finally {
      await Promise.all([qc.invalidateQueries({ queryKey: ['approvals'] }), qc.invalidateQueries({ queryKey: ['messages'] }), qc.invalidateQueries({ queryKey: ['approval_preferences'] }), qc.invalidateQueries({ queryKey: ['browser_session'] })]);
      setBusyId(null);
    }
  }

  const card = (a: NonNullable<typeof approvals.data>[number]) => {
    const { Icon, label } = APPROVAL_TYPE[a.action_type] ?? APPROVAL_TYPE["other"] ?? { Icon: Sparkles, label: "Action" };
    return (
      <SwipeToIgnore key={a.id} onIgnore={() => ignore(a.id)} disabled={a.status !== 'pending' || busyId !== null}><div className="rounded-2xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-4 w-4 text-accent" />
          {label}
          {a.status === 'pending' && <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label={`Ignore ${a.title}`} title="Ignore" disabled={busyId !== null} onClick={() => ignore(a.id)}><X className="h-3.5 w-3.5" /></Button>}
          {a.status !== "pending" && (
            <span className={`ml-auto rounded-full px-2 py-0.5 ${a.status === "approved" ? "bg-secondary text-foreground" : "bg-secondary text-muted-foreground line-through"}`}>
              {a.status === "approved" ? approvalStateLabel(a.run_state, a.payload) : a.status}
            </span>
          )}
        </div>
        <div className="mt-2 font-medium">{a.title}</div>
        {a.details && <p className="mt-1 text-sm text-muted-foreground">{a.details}</p>}
        {a.approval_mode === 'always' && <p className="mt-2 text-xs text-muted-foreground">Always approved for this action and account</p>}
        {a.run_error && <p className="mt-2 text-sm text-destructive">{a.run_error}</p>}
        {busyId === a.id && <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{approvalKind(a.payload).includes('post') ? 'Posting…' : 'Working…'}</p>}
        {a.status === "pending" && (
          <div className="mt-3 flex gap-2">
            <div className="flex items-center">
              <Button size="sm" disabled={busyId !== null} onClick={() => respond(a.id, "approved", a.title, a.browser_session_id, a.payload)} className="rounded-l-full rounded-r-none">
                <Check className="h-4 w-4" /> Approve
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" disabled={busyId !== null} className="rounded-l-none rounded-r-full border-l border-primary-foreground/30 px-2" aria-label={`Approval options for ${a.title}`}><ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => respond(a.id, 'approved', a.title, a.browser_session_id, a.payload, 'once')}>Approve one time</DropdownMenuItem>
                  <DropdownMenuItem disabled={!approvalKind(a.payload)} onSelect={() => respond(a.id, 'approved', a.title, a.browser_session_id, a.payload, 'always')}>Always approve this action</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => respond(a.id, "declined", a.title, a.browser_session_id, a.payload)} className="rounded-full">
              <X className="h-4 w-4" /> Decline
            </Button>
          </div>
        )}
      </div></SwipeToIgnore>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-4">
      <p className="px-3 pb-3 text-sm text-muted-foreground">
        Review actions or grant ongoing approval for an action on this account.
      </p>
      {(preferences.data?.length ?? 0) > 0 && <div className="mb-4 border-b pb-3">
        <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Always approved</h3>
        {preferences.data?.map((p) => <div key={p.id} className="flex items-center justify-between gap-2 text-sm"><span>{p.label}</span><Button variant="ghost" size="icon" aria-label={`Stop always approving ${p.label}`} title="Ask each time" onClick={async () => {
          const { error } = await supabase.from('approval_preferences').delete().eq('id', p.id);
          if (error) toast.error(error.message); else { toast('Civi will ask each time'); qc.invalidateQueries({ queryKey: ['approval_preferences'] }); }
        }}><X className="h-4 w-4" /></Button></div>)}
      </div>}
      <div className="space-y-2.5">
        {pending.map(card)}
        {pending.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            Nothing waiting on you. Ask Civi to plan outreach or an event and it will queue actions here.
          </p>
        )}
        {resolved.length > 0 && (
          <>
            <div className="px-3 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decided</div>
            {resolved.map(card)}
          </>
        )}
        {main && pending.length > 0 && (
          <button
            onClick={() => navigate({ to: "/chat/$threadId", params: { threadId: main.id } })}
            className="w-full rounded-2xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent"
          >
            Discuss with your organizer →
          </button>
        )}
      </div>
    </div>
  );
}

function ScoutPanel({ onConnect, onOpenChat }: { onConnect: () => void; onOpenChat: () => void }) {
  const navigate = useNavigate();
  const takeAction = useServerFn(takeDiscoveryAction);
  const [acting, setActing] = useState<string | null>(null);
  const [connectionNeeded, setConnectionNeeded] = useState<{ findingId: string; ideaIndex: number; name: string } | null>(null);
  async function act(findingId: string, ideaIndex: number) {
    if (acting) return;
    setActing(`${findingId}:${ideaIndex}`);
    try {
      const result = await takeAction({ data: { findingId, ideaIndex } });
      if (result.needsConnection) {
        setConnectionNeeded({ findingId, ideaIndex, name: result.needsConnection === 'eventbrite' ? 'Eventbrite' : result.needsConnection === 'linkedin' ? 'LinkedIn' : 'X' });
        return;
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ['threads'] }), qc.invalidateQueries({ queryKey: ['messages'] }), qc.invalidateQueries({ queryKey: ['approvals'] })]);
      if (result.threadId) { navigate({ to: '/chat/$threadId', params: { threadId: result.threadId } }); onOpenChat(); }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not start this idea'); }
    finally { setActing(null); }
  }
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ city: "", state: "", neighborhoods: "", interests: "", priorities: "", partner_types: "" });

  const areas = useQuery({
    queryKey: ["focus_areas"],
    queryFn: async () => (await supabase.from("focus_areas").select("*").order("created_at")).data ?? [],
  });
  const findings = useQuery({
    queryKey: ["scout_findings"],
    refetchInterval: 30000,
    queryFn: async () => (await supabase.from("scout_findings").select("*").order("created_at", { ascending: false }).limit(5)).data ?? [],
  });
  const resources = useQuery({
    queryKey: ["resources"],
    queryFn: async () => (await supabase.from("resources").select("*").order("created_at", { ascending: false }).limit(30)).data ?? [],
  });

  async function addArea() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("focus_areas").insert({ user_id: u.user!.id, ...form });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setForm({ city: "", state: "", neighborhoods: "", interests: "", priorities: "", partner_types: "" });
    setShowForm(false);
    await qc.invalidateQueries({ queryKey: ["focus_areas"] });
    toast.success("Focus area added — Community Scout will research it on its next run.");
  }

  async function removeArea(id: string) {
    const { error } = await supabase.from("focus_areas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["focus_areas"] });
  }

  async function removeResource(id: string) {
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["resources"] });
  }

  const field = (key: keyof typeof form, label: string, required = false) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && " *"}</label>
      <Input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="mt-1 h-9 rounded-xl text-sm"
      />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-4">
      <h2 className="px-3 pb-3 text-lg font-semibold">Discovery</h2>
      {connectionNeeded && <div role="alert" className="mb-4 border-b px-3 pb-3">
        <p className="text-sm">Connect {connectionNeeded.name} to take this action.</p>
        <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={onConnect}><Plug className="h-4 w-4" />Connect {connectionNeeded.name}</Button><Button size="sm" variant="outline" disabled={acting !== null} onClick={() => act(connectionNeeded.findingId, connectionNeeded.ideaIndex)}>Try again</Button><Button variant="ghost" size="icon" aria-label="Dismiss connection request" onClick={() => setConnectionNeeded(null)}><X className="h-4 w-4" /></Button></div>
      </div>}

      <div className="flex items-center justify-between px-3 text-sm font-semibold">
        Focus areas
        {(areas.data?.length ?? 0) < 10 && (
          <button aria-label="Add focus area" onClick={() => setShowForm(!showForm)} className="rounded-lg p-1 hover:bg-sidebar-accent">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {showForm && (
        <div className="mt-2 space-y-2.5 rounded-2xl border bg-card p-4 shadow-soft">
          <div className="grid grid-cols-2 gap-2">
            {field("city", "City or community", true)}
            {field("state", "State", true)}
          </div>
          {field("neighborhoods", "Neighborhoods or service radius")}
          {field("interests", "Community interests")}
          {field("priorities", "Organizational priorities")}
          {field("partner_types", "Partners or vendors to discover")}
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={busy || !form.city.trim() || !form.state.trim()} onClick={addArea} className="rounded-full">Save area</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="rounded-full">Cancel</Button>
          </div>
        </div>
      )}

      <div className="mt-1 space-y-1">
        {areas.data?.map((a) => (
          <div key={a.id} className="group flex items-center justify-between rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent">
            <div className="min-w-0">
              <div className="truncate font-medium">{a.city}, {a.state}</div>
              {a.priorities && <div className="truncate text-xs text-muted-foreground">{a.priorities}</div>}
            </div>
            <button aria-label={`Remove ${a.city}`} onClick={() => removeArea(a.id)} className="ml-2 shrink-0 rounded-lg p-1 text-muted-foreground opacity-0 hover:bg-secondary group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {areas.data?.length === 0 && !showForm && (
          <p className="px-3 py-2 text-sm text-muted-foreground">No focus areas yet — add one so the Scout knows where to look.</p>
        )}
      </div>

      {findings.data && findings.data.length > 0 && (
        <>
          <div className="mt-5 px-3 text-sm font-semibold">Latest findings</div>
          <div className="mt-1 space-y-2">
            {findings.data.map((f) => (
              <div key={f.id} className="rounded-2xl border bg-card p-3 text-sm shadow-soft">
                <div className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</div>
                <div className="prose prose-sm mt-1 max-w-none leading-relaxed dark:prose-invert prose-a:text-primary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.summary}</ReactMarkdown>
                </div>
                <div className="mt-3 divide-y border-t">
                  {discoveryIdeas(f.ideas, f.summary).map((idea, i) => <div key={`${f.id}:${i}`} className="py-3">
                    <span className="text-xs font-medium uppercase text-muted-foreground">{idea.kind} idea · {idea.connector === 'internal' ? 'Document' : idea.connector === 'eventbrite' ? 'Eventbrite' : idea.connector === 'linkedin' ? 'LinkedIn' : 'X'}</span>
                    <h4 className="mt-1 font-medium">{idea.title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{idea.description}</p>
                    <Button size="sm" className="mt-2" disabled={acting !== null} aria-label={`Take action: ${idea.title}`} onClick={() => act(f.id, i)}>{acting === `${f.id}:${i}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{acting === `${f.id}:${i}` ? 'Starting…' : 'Take action'}</Button>
                  </div>)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-5 px-3 text-sm font-semibold">Resource directory</div>
      <p className="px-3 pb-1 text-xs text-muted-foreground">Vendors, venues and partners Civi has saved — reused across events so research is never repeated.</p>
      <div className="mt-1 space-y-1">
        {resources.data?.map((r) => (
          <div key={r.id} className="group flex items-start justify-between rounded-2xl px-3 py-2 hover:bg-sidebar-accent">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{r.type}</span>
              </div>
              {r.details && <div className="truncate text-xs text-muted-foreground">{r.details}</div>}
              {r.source?.startsWith("http") && (
                <a href={r.source} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-primary hover:underline">
                  Source ↗
                </a>
              )}
            </div>
            <button aria-label={`Remove ${r.name}`} onClick={() => removeResource(r.id)} className="ml-2 shrink-0 rounded-lg p-1 text-muted-foreground opacity-0 hover:bg-secondary group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {resources.data?.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">Nothing saved yet — ask Civi to research vendors or venues and it will file them here.</p>
        )}
      </div>
    </div>
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

const HEARD = ["Facebook", "Instagram", "Friend or colleague", "Search", "Event", "Other"];
const PAGES = [
  { k: "facebook", label: "Facebook", ph: "facebook.com/yourorg" },
  { k: "instagram", label: "Instagram", ph: "instagram.com/yourorg" },
  { k: "x", label: "X", ph: "x.com/yourorg" },
  { k: "linkedin", label: "LinkedIn", ph: "linkedin.com/company/yourorg" },
  { k: "website", label: "Website", ph: "yourorg.org" },
];
const APPS = ["Facebook", "Instagram", "X", "LinkedIn", "Nextdoor", "Eventbrite", "Gmail", "Mailchimp", "Google Sheets", "Canva", "Square", "Slack"];

function Onboarding({ existing }: { existing: { name: string | null; mission: string | null } | null | undefined }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(existing?.name ? 1 : 0);
  const [name, setName] = useState(existing?.name ?? "");
  const [address, setAddress] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [heard, setHeard] = useState("");
  const [mission, setMission] = useState(existing?.mission ?? "");
  const [pages, setPages] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState("");
  const [apps, setApps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [researching, setResearching] = useState(false);
  const [rec, setRec] = useState<"idle" | "recording" | "working">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const research = useServerFn(runOnboardingResearch);
  const scan = useServerFn(scanOrgProfile);
  const transcribe = useServerFn(transcribeSpeech);
  const STEPS = 5;

  async function upsert(extra: Record<string, unknown> = {}) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("organizations").upsert({ user_id: u.user!.id, name, mission, address: address || null, contact_email: cEmail.trim() || null, contact_phone: cPhone.trim() || null, referral_source: heard || null, ...extra });
    if (error) toast.error(error.message);
    return !error;
  }
  const norm = (v: string) => (v.trim() && !/^https?:\/\//.test(v.trim()) ? `https://${v.trim()}` : v.trim());

  async function next() {
    setBusy(true);
    try {
      if (step === 2) {
        const p = Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, norm(v)]).filter(([, v]) => v));
        if (!(await upsert({ public_pages: p }))) return;
        setStep(3);
        if (!profile && Object.keys(p).length) {
          setScanning(true);
          try { const r = await scan({ data: { pages: p } }); setProfile(r.profile); }
          catch (e) { console.error(e); toast.error("Couldn't scan your pages — you can write your profile instead."); }
          finally { setScanning(false); }
        }
        return;
      }
      if (step === 3) { if (await upsert({ profile: profile || null })) setStep(4); return; }
      if (step === 4) return finish();
      if (await upsert()) setStep(step + 1);
    } finally { setBusy(false); }
  }

  async function finish() {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user!.id;
    if (!(await upsert({ apps_used: apps, profile: profile || null, onboarded: true }))) return;
    if (profile.trim()) await supabase.from("memories").insert({ user_id: uid, content: `🏛️ Organization profile: ${profile.trim().slice(0, 1500)}` });
    const { data: has } = await supabase.from("threads").select("id").eq("kind", "main").maybeSingle();
    if (!has) {
      const { data: t } = await supabase.from("threads").insert({ user_id: uid, kind: "main", title: "Main chat" }).select("id").single();
      if (t) await supabase.from("messages").insert({
        thread_id: t.id, user_id: uid, role: "assistant",
        content: `Hi! I'm Civi, your AI organizer for **${name || "your organization"}**. 👋\n\nI've read your public pages and saved your profile. I can find local groups and vendors, plan and list events, run outreach, and keep your pages fresh — and I always ask before anything goes out.\n\nHow would you like to get started?\n\n[[choices: Set up now with Civi | I'll set up over time]]`,
      });
    }
    setResearching(true);
    try { await research(); } catch (e) { console.error(e); }
    setResearching(false);
    qc.invalidateQueries();
  }

  async function toggleMic() {
    if (rec === "recording") { recRef.current?.stop(); return; }
    if (rec !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream); const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRec("working");
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
          const buf = new Uint8Array(await blob.arrayBuffer()); let bin = "";
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          const { text } = await transcribe({ data: { audio: btoa(bin), mime: blob.type } });
          if (text) setProfile((p) => (p ? `${p}\n${text}` : text)); else toast("I didn't catch that — try again.");
        } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't hear that"); }
        finally { setRec("idle"); }
      };
      recRef.current = mr; mr.start(); setRec("recording");
    } catch { toast.error("Allow microphone access to talk to Civi."); }
  }

  const canNext = step === 0 ? !!name.trim() && !!address.trim() && !!heard : step === 1 ? !!mission.trim() : true;
  const titles = ["Let's set up your organization", "What's your mission?", "Where can people find you?", "Here's your profile", "What apps do you use?"];
  const subs = [
    "A few basics so Civi knows who it's working for.",
    "This becomes the background for your organizer and every agent.",
    "Add up to five public pages. Civi will read them and write your profile.",
    "Edit anything, or tap the mic and tell Civi more.",
    "Civi will suggest connecting these so it can work where you already are.",
  ];

  return (
    <main className="dark fixed inset-0 flex items-center justify-center overflow-hidden bg-background p-4 text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative flex h-full max-h-[640px] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border bg-card/80 p-7 shadow-[0_0_80px_-20px_color-mix(in_oklab,var(--primary)_45%,transparent)] backdrop-blur-xl sm:p-9">
        {researching ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="relative h-14 w-14"><span className="absolute inset-0 animate-ping rounded-full bg-primary/30" /><span className="absolute inset-3 rounded-full bg-primary" /></div>
            <h1 className="font-display mt-6 text-3xl font-bold">Civi is researching your community…</h1>
            <p className="mt-2 text-muted-foreground">Looking up local allies, events, venues and food vendors so your agents start out informed.</p>
          </div>
        ) : (<>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: STEPS }).map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />)}
          </div>
          <div className="mt-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">Step {step + 1} of {STEPS}</div>
          <h1 className="font-display mt-2 text-3xl font-bold leading-tight">{titles[step]}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subs[step]}</p>

          <div key={step} className="mt-6 flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-right-4 duration-300">
            {step === 0 && (<div className="space-y-3">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Organization or business name" className="h-12 rounded-2xl" />
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address or city, e.g. 123 Main St, Tucson AZ" className="h-12 rounded-2xl" />
              <div className="grid grid-cols-2 gap-3">
                <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="Contact email" className="h-12 rounded-2xl" />
                <Input type="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="Phone" className="h-12 rounded-2xl" />
              </div>
              <div className="pt-2 text-sm text-muted-foreground">How did you hear about Civi Meet?</div>
              <div className="flex flex-wrap gap-2">
                {HEARD.map((h) => <button type="button" key={h} onClick={() => setHeard(h)} className={`rounded-full border px-3.5 py-1.5 text-sm transition ${heard === h ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60"}`}>{h}</button>)}
              </div>
            </div>)}
            {step === 1 && <Textarea autoFocus value={mission} onChange={(e) => setMission(e.target.value)} placeholder="We organize renters in Tucson to win fair housing protections…" className="min-h-0 flex-1 resize-none rounded-2xl text-base" />}
            {step === 2 && (<div className="space-y-2.5">
              {PAGES.map((p) => (
                <div key={p.k} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-sm text-muted-foreground">{p.label}</span>
                  <Input value={pages[p.k] ?? ""} onChange={(e) => setPages({ ...pages, [p.k]: e.target.value })} placeholder={p.ph} className="h-11 rounded-xl" />
                </div>))}
            </div>)}
            {step === 3 && (scanning ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="relative h-12 w-12"><span className="absolute inset-0 animate-ping rounded-full bg-primary/30" /><span className="absolute inset-3 rounded-full bg-primary" /></div>
                <p className="mt-5 font-medium">Reading your pages and searching the web…</p>
                <p className="mt-1 text-sm text-muted-foreground">This takes about 20 seconds.</p>
              </div>
            ) : (<div className="relative flex min-h-0 flex-1 flex-col">
              <Textarea value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="Who you are, who you serve, your programs and events, your voice…" className="min-h-0 flex-1 resize-none rounded-2xl pb-14 text-sm" />
              <button type="button" onClick={toggleMic} aria-label="Tell Civi more" className={`absolute bottom-3 right-3 flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm backdrop-blur transition ${rec === "recording" ? "border-primary bg-primary text-primary-foreground" : "bg-background/70 hover:border-primary/60"}`}>
                <Mic className="h-4 w-4" />{rec === "recording" ? "Listening… tap to stop" : rec === "working" ? "Adding…" : "Tell Civi more"}
              </button>
            </div>))}
            {step === 4 && (<div className="flex flex-wrap content-start gap-2">
              {APPS.map((a) => { const on = apps.includes(a); return <button type="button" key={a} onClick={() => setApps(on ? apps.filter((x) => x !== a) : [...apps, a])} className={`rounded-full border px-3.5 py-1.5 text-sm transition ${on ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60"}`}>{a}</button>; })}
            </div>)}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button type="button" variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Back</Button>
            <Button type="button" disabled={busy || scanning || !canNext} onClick={next} className="rounded-full px-8">
              {step === 2 ? (Object.values(pages).some((v) => v.trim()) ? "Scan my pages" : "Skip") : step === 4 ? "Meet your organizer" : "Continue"}
            </Button>
          </div>
        </>)}
      </div>
    </main>
  );
}

function DocumentsPanel() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const docs = useQuery({
    queryKey: ["documents"],
    queryFn: async () => (await supabase.from("documents").select("id, title, kind, created_at").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const org = useQuery({ queryKey: ["org-letterhead"], queryFn: async () => (await supabase.from("organizations").select("name, address, logo_url").maybeSingle()).data });
  async function uploadLogo(f?: File) {
    if (!f) return;
    try {
      const { logoToDataUrl } = await import("@/lib/logo");
      const dataUrl = await logoToDataUrl(f);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("organizations").update({ logo_url: dataUrl }).eq("user_id", u.user!.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["org-letterhead"] });
      toast.success("Logo added to all your documents.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add that logo"); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this document?")) return;
    await supabase.from("documents").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["documents"] });
  }
  return (
    <div className="flex-1 overflow-y-auto px-2 pb-4">
      <h2 className="px-3 pb-1 font-medium">Documents</h2>
      <p className="px-3 pb-3 text-xs text-muted-foreground">Checklists, plans and letters Civi drafts — on your letterhead, ready to download.</p>
      <div className="mx-1 mb-3 flex items-center gap-3 rounded-2xl border bg-card p-3">
        {org.data?.logo_url ? <img src={org.data.logo_url} alt="Organization logo" className="h-9 w-9 shrink-0 object-contain" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-secondary"><ImagePlus className="h-4 w-4 text-muted-foreground" /></span>}
        <span className="min-w-0 flex-1 text-sm">{org.data?.logo_url ? "Letterhead logo" : "Add your logo to documents"}</span>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}>{org.data?.logo_url ? "Change" : "Upload"}</Button>
      </div>
      {(docs.data ?? []).length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No documents yet — ask Civi for an event checklist or a plan.</p>}
      {(docs.data ?? []).map((d) => (
        <div key={d.id} className="group flex items-center gap-2 rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Link to="/documents/$id" params={{ id: d.id }} className="min-w-0 flex-1">
            <span className="block truncate text-sm">{d.title}</span>
            <span className="text-xs capitalize text-muted-foreground">{d.kind} · {new Date(d.created_at).toLocaleDateString()}</span>
          </Link>
          <button aria-label="Delete document" onClick={() => remove(d.id)} className="opacity-0 transition group-hover:opacity-100"><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      ))}
    </div>
  );
}

function LoginsPanel() {
  const qc = useQueryClient();
  const save = useServerFn(saveSiteCredential);
  const [f, setF] = useState({ label: "", domain: "", username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ["site_credentials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_credentials").select("id, label, domain, username").order("label");
      if (error) throw error;
      return data;
    },
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: { ...f, label: f.label || f.domain } });
      setF({ label: "", domain: "", username: "", password: "" });
      toast.success("Login saved securely");
      qc.invalidateQueries({ queryKey: ["site_credentials"] }); qc.invalidateQueries({ queryKey: ["fb-login"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't save"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("site_credentials").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["site_credentials"] }); qc.invalidateQueries({ queryKey: ["fb-login"] });
  }
  return (
    <div className="flex-1 overflow-y-auto px-3 pb-4">
      <h2 className="px-3 pb-1 font-medium">Saved logins</h2>
      <p className="px-3 pb-3 text-sm text-muted-foreground">
        Civi signs in with these when its live browser reaches that website. Passwords are encrypted, never shown again, and never sent to the AI.
      </p>
      <form onSubmit={submit} className="space-y-2 px-3 pb-4">
        <Input placeholder="Website (e.g. eventbrite.com)" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} required />
        <Input placeholder="Name (optional)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <Input placeholder="Username or email" autoComplete="off" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
        <Input type="password" placeholder="Password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save login"}</Button>
      </form>
      <div className="space-y-1">
        {list.data?.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent">
            <div className="min-w-0">
              <div className="truncate font-medium">{c.label}</div>
              <div className="truncate text-xs text-muted-foreground">{c.domain} · {c.username} · ••••••</div>
            </div>
            <button aria-label={`Delete ${c.label}`} onClick={() => remove(c.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {list.data?.length === 0 && <p className="px-3 text-sm text-muted-foreground">No saved logins yet.</p>}
      </div>
    </div>
  );
}


function NewChatMenu({ onBlank }: { onBlank: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const startBrowser = useServerFn(startBrowserSession);
  const eb = useQuery({ queryKey: ["eventbrite-status"], queryFn: () => getEventbriteStatus() });
  const nd = useQuery({ queryKey: ["nextdoor-status"], queryFn: () => getNextdoorStatus() });
  const li = useQuery({ queryKey: ["linkedin-status"], queryFn: () => getLinkedInStatus() });
  const x = useQuery({ queryKey: ["x-status"], queryFn: () => getXStatus() });
  const fb = useQuery({
    queryKey: ["fb-login"],
    queryFn: async () => {
      const { data } = await supabase.from("site_credentials").select("domain");
      return (data ?? []).some((c) => c.domain.endsWith("facebook.com"));
    },
  });
  const items = [
    eb.data?.connected && { id: "eb", name: "Eventbrite", title: "Eventbrite Agent", icon: <CalendarCheck className="h-4 w-4" /> },
    x.data?.connected && { id: "x", name: "X", title: "X Agent", icon: <SiX className="h-4 w-4" /> },
    li.data?.connected && { id: "li", name: "LinkedIn", title: "LinkedIn Agent", icon: <FaLinkedin className="h-4 w-4" /> },
    nd.data?.connected && { id: "nd", name: "Nextdoor", title: "Nextdoor Agent", icon: <SiNextdoor className="h-4 w-4" /> },
    fb.data && { id: "fb", name: "Facebook", title: "Facebook Agent", icon: <SiFacebook className="h-4 w-4" /> },
  ].filter(Boolean) as { id: string; name: string; title: string; icon: ReactNode }[];

  async function open(it: (typeof items)[number]) {
    const { data: u } = await supabase.auth.getUser();
    let threadId: string | undefined;
    if (it.id !== "fb") {
      const { data: ex } = await supabase.from("threads").select("id").eq("kind", "side").eq("title", it.title).limit(1).maybeSingle();
      threadId = ex?.id;
    }
    if (!threadId) {
      const { data, error } = await supabase.from("threads").insert({ user_id: u.user!.id, kind: "side", title: it.title }).select("id").single();
      if (error) { toast.error(error.message); return; }
      threadId = data.id;
    }
    await qc.invalidateQueries({ queryKey: ["threads"] });
    navigate({ to: "/chat/$threadId", params: { threadId } });
    if (it.id === "eb" || it.id === "x" || it.id === "li") {
      // A fresh (or empty) agent chat opens with org-specific ideas for each thing the agent can do.
      const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("thread_id", threadId);
      if (!count) {
        const accountName = it.id === "li" ? li.data?.accountName ?? "your LinkedIn account" : it.id === "x" ? x.data?.accountName ?? "your X account" : eb.data?.accountName ?? "your Eventbrite account";
        const fallback = it.id === "li" ? LINKEDIN_WELCOME(accountName) : it.id === "x" ? X_WELCOME(accountName) : EVENTBRITE_WELCOME(accountName);
        const tid = toast.loading("Civi is thinking up ideas for you…");
        try {
          await writeAgentWelcome({ data: { threadId, agent: it.id === "li" ? "linkedin" : it.id === "x" ? "x" : "eventbrite", accountName, fallback } });
        } catch {
          await supabase.from("messages").insert({ thread_id: threadId, user_id: u.user!.id, role: "assistant", content: fallback });
        }
        toast.dismiss(tid);
        qc.invalidateQueries({ queryKey: ["messages"] });
      }
    }
    if (it.id === "fb") {
      try {
        await startBrowser({ data: { threadId, task: "Open https://www.facebook.com/ and sign in with the saved Facebook login, then wait for the organizer's next task" } });
        qc.invalidateQueries({ queryKey: ["messages"] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Couldn't open the browser";
        toast.error(msg);
        await supabase.from("messages").insert({ thread_id: threadId, user_id: u.user!.id, role: "assistant",
          content: `⚠️ I couldn't open the Facebook browser: ${/402|minutes/i.test(msg) ? "your browser service is out of free minutes for now." : msg}\n\n[[choices: Try again | Open Facebook later]]` });
        qc.invalidateQueries({ queryKey: ["messages"] });
      }
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="New side chat" className="rounded-lg p-1 hover:bg-sidebar-accent"><Plus className="h-4 w-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onBlank}><MessageCircle className="h-4 w-4" /> New chat</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Connected agents</DropdownMenuLabel>
        {items.map((it) => (
          <DropdownMenuItem key={it.id} onClick={() => open(it)}>{it.icon} {it.name}</DropdownMenuItem>
        ))}
        {items.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nothing connected yet</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

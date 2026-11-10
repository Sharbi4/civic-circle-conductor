import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageCircle, Plus, Plug, LogOut, Pin, Brain, Inbox, Megaphone, CalendarCheck, CreditCard, Sparkles, Check, X, Compass, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONNECTORS } from "@/lib/connectors";
import { startLinkedInConnect, completeLinkedInConnect, getLinkedInStatus, disconnectLinkedIn, runLinkedInApproval, setLinkedInOrgPage } from "@/lib/linkedin.functions";
import { startEventbriteConnect, completeEventbriteConnect, getEventbriteStatus, disconnectEventbrite, runEventbriteApproval } from "@/lib/eventbrite.functions";
import { saveSiteCredential } from "@/lib/credentials.functions";
import { runFacebookApproval } from "@/lib/browser.functions";
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
  const [tab, setTab] = useState<"chats" | "connectors" | "memory" | "approvals" | "scout" | "logins">("chats");
  const approvals = useApprovals();
  const pendingCount = approvals.data?.filter((a) => a.status === "pending").length ?? 0;
  const main = threads.data?.find((t) => t.kind === "main");
  const side = threads.data?.filter((t) => t.kind !== "main") ?? [];

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
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <>
      <nav className="hidden w-[72px] flex-col items-center gap-3 border-r bg-rail py-5 md:flex">
        <div className="font-display mb-3 text-xl font-bold text-primary">C</div>
        {railBtn("chats", MessageCircle, "Chats")}
        {railBtn("approvals", Inbox, "Approvals", pendingCount)}
        {railBtn("connectors", Plug, "Connectors")}
        {railBtn("scout", Compass, "Community Scout")}
        {railBtn("memory", Brain, "Memory")}
        {railBtn("logins", KeyRound, "Settings: saved logins")}
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
            {CONNECTORS.map((c) =>
              c.id === "eventbrite" ? (
                <EventbriteConnectorRow key={c.id} />
              ) : c.id === "nextdoor" ? (
                <NextdoorConnectorRow key={c.id} />
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
        {tab === "scout" && <ScoutPanel />}
        {tab === "memory" && <MemoryPanel />}
        {tab === "logins" && <LoginsPanel />}
      </aside>
    </>
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
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Connected</span>
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
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Connected</span>
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
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Connected</span>
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
      {connected && <LinkedInPageField current={status.data?.orgPageId ?? ""} />}
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
  const runEb = useServerFn(runEventbriteApproval);
  const runLi = useServerFn(runLinkedInApproval);
  const runFb = useServerFn(runFacebookApproval);
  const main = threads.data?.find((t) => t.kind === "main");
  const pending = approvals.data?.filter((a) => a.status === "pending") ?? [];
  const resolved = approvals.data?.filter((a) => a.status !== "pending") ?? [];

  async function respond(id: string, decision: "approved" | "declined", title: string, browserSessionId?: string | null, payload?: unknown) {
    setBusyId(id);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("approvals")
      .update({ status: decision, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); setBusyId(null); return; }
    if (decision === "approved" && (payload as { kind?: string } | null)?.kind === "eventbrite_create") {
      try {
        const r = await runEb({ data: { approvalId: id } });
        toast.success("Event created on Eventbrite as a draft.");
        if (r.threadId) qc.invalidateQueries({ queryKey: ["messages", r.threadId] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Eventbrite couldn't create the event");
      }
      await qc.invalidateQueries({ queryKey: ["approvals"] });
      setBusyId(null);
      return;
    }
    if (decision === "approved" && (payload as { kind?: string } | null)?.kind?.startsWith("linkedin_")) {
      try {
        const r = await runLi({ data: { approvalId: id } });
        if (r.ok) toast.success("Done on LinkedIn."); else toast.warning("LinkedIn finished with a problem — see the chat.");
        if (r.threadId) qc.invalidateQueries({ queryKey: ["messages", r.threadId] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "LinkedIn couldn't complete that");
      }
      await qc.invalidateQueries({ queryKey: ["approvals"] });
      setBusyId(null);
      return;
    }
    if (decision === "approved" && (payload as { kind?: string } | null)?.kind?.startsWith("fb_")) {
      try {
        const r = await runFb({ data: { approvalId: id } });
        toast.success(r.started ? "Civi is doing it in the Facebook browser now." : "Approved — Civi will do it right after its current browser task.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't start that on Facebook");
      }
      await qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["browser_session"] });
      setBusyId(null);
      return;
    }
    if (browserSessionId) {
      await supabase.from("browser_sessions")
        .update(decision === "approved" ? { agent_status: "driving", submit_approved: true } : { agent_status: "stopped" })
        .eq("id", browserSessionId);
      qc.invalidateQueries({ queryKey: ["browser_session", browserSessionId] });
    }
    if (main && u.user) {
      await supabase.from("messages").insert({
        thread_id: main.id,
        user_id: u.user.id,
        role: "assistant",
        content: decision === "approved"
          ? `✅ You approved: **${title}**. I'll get started on it.`
          : `🚫 You declined: **${title}**. I won't take that action — tell me if you'd like a different approach.`,
      });
      qc.invalidateQueries({ queryKey: ["messages", main.id] });
    }
    await qc.invalidateQueries({ queryKey: ["approvals"] });
    setBusyId(null);
    toast.success(decision === "approved" ? "Approved — Civi will take it from here." : "Declined — Civi won't act on it.");
  }

  const card = (a: NonNullable<typeof approvals.data>[number]) => {
    const { Icon, label } = APPROVAL_TYPE[a.action_type] ?? APPROVAL_TYPE["other"]!;
    return (
      <div key={a.id} className="rounded-2xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-4 w-4 text-accent" />
          {label}
          {a.status !== "pending" && (
            <span className={`ml-auto rounded-full px-2 py-0.5 ${a.status === "approved" ? "bg-secondary text-foreground" : "bg-secondary text-muted-foreground line-through"}`}>
              {a.status}
            </span>
          )}
        </div>
        <div className="mt-2 font-medium">{a.title}</div>
        {a.details && <p className="mt-1 text-sm text-muted-foreground">{a.details}</p>}
        {a.status === "pending" && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busyId === a.id} onClick={() => respond(a.id, "approved", a.title, a.browser_session_id, a.payload)} className="rounded-full">
              <Check className="h-4 w-4" /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => respond(a.id, "declined", a.title, a.browser_session_id, a.payload)} className="rounded-full">
              <X className="h-4 w-4" /> Decline
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-4">
      <p className="px-3 pb-3 text-sm text-muted-foreground">
        Civi asks before any outreach, booking or payment. Review and decide here.
      </p>
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

function ScoutPanel() {
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
      <p className="px-3 pb-3 text-sm text-muted-foreground">
        Community Scout researches your focus areas twice a day and saves what it finds to your resource directory.
      </p>

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
      if (!has) {
        const { data: t } = await supabase.from("threads").insert({ user_id: uid, kind: "main", title: "Main chat" }).select("id").single();
        if (t) await supabase.from("messages").insert({
          thread_id: t.id, user_id: uid, role: "assistant",
          content: `Hi! I'm Civi, your AI organizer for **${name || "your organization"}**. 👋\n\nI can find local groups and vendors, plan and list events, run outreach, and keep your pages fresh — and I always ask before anything goes out.\n\nHow would you like to get started?\n\n[[choices: Set up now with Civi | I'll set up over time]]`,
        });
      }
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
      qc.invalidateQueries({ queryKey: ["site_credentials"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't save"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("site_credentials").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["site_credentials"] });
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

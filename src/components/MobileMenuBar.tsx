import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CiviChatMark } from "@/components/CiviChatMark";

const HINT_KEY = "civi-mobile-menu-hint-seen";

/**
 * Phone-only top bar. The side menu is hidden on small screens, so this bar always shows a
 * labeled Menu button, a one-time tip pointing at it, and lets a swipe in from the left edge open it.
 */
export function MobileMenuBar({ orgName, alertKeys, onOpen }: { orgName: string; alertKeys?: string[] | undefined; onOpen: () => void }) {
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(HINT_KEY)) setShowHint(true); } catch { /* storage blocked: skip the tip */ }
  }, []);
  const dismiss = () => {
    setShowHint(false);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* ignore */ }
  };
  const open = () => { dismiss(); onOpen(); };

  // Swipe right from the left edge of the screen opens the menu, like most phone apps.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    let start: { x: number; y: number } | null = null;
    const down = (e: TouchEvent) => { const t = e.touches[0]; start = t && t.clientX < 24 ? { x: t.clientX, y: t.clientY } : null; };
    const up = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (start && t && t.clientX - start.x > 60 && Math.abs(t.clientY - start.y) < 50) open();
      start = null;
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up, { passive: true });
    return () => { window.removeEventListener("touchstart", down); window.removeEventListener("touchend", up); };
  });

  return (
    <div className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3 md:hidden">
      <span className={showHint ? "mobile-menu-pulse rounded-full" : "rounded-full"}>
        <CiviChatMark mobile alertKeys={alertKeys} onClick={open} />
      </span>
      <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">{orgName}</span>
      {showHint && (
        <div role="status" className="absolute left-3 top-full mt-2 w-64 rounded-2xl border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
          <span aria-hidden className="absolute -top-1.5 left-8 h-3 w-3 rotate-45 border-l border-t bg-popover" />
          <div className="flex items-start gap-2">
            <p className="flex-1">Your events, chats, inbox and tools are in the <strong>Menu</strong>. Tap it or swipe in from the left edge.</p>
            <button type="button" aria-label="Dismiss tip" onClick={dismiss} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
          </div>
          <button type="button" onClick={open} className="mt-2 text-sm font-semibold text-primary">Show me</button>
        </div>
      )}
    </div>
  );
}

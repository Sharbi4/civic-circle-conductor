import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import icon from "@/assets/civimeet-chat-icon.png.asset.json";

export function CiviChatMark({ alertKeys, onClick, mobile = false }: { alertKeys?: string[] | undefined; onClick: () => void; mobile?: boolean }) {
  const seen = useRef<Set<string> | null>(null);
  const [animation, setAnimation] = useState(0);
  useEffect(() => {
    if (!alertKeys) return;
    const previous = seen.current;
    if (previous && alertKeys.some((key) => !previous.has(key))) setAnimation((n) => n + 1);
    seen.current = new Set(alertKeys);
  }, [alertKeys]);
  const waiting = alertKeys?.length ?? 0;
  if (mobile) {
    return (
      <Button variant="outline" onClick={onClick}
        aria-label={waiting ? `Open menu, ${waiting} new item${waiting === 1 ? "" : "s"}` : "Open menu"}
        className="relative h-9 shrink-0 gap-1.5 rounded-full px-3 shadow-sm">
        <Menu className="h-4 w-4" />
        <img key={animation} src={icon.url} alt="" className="civi-mark-arrive h-5 w-5 object-contain" />
        <span className="text-sm font-medium">Menu</span>
        {waiting > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {waiting > 9 ? "9+" : waiting}
          </span>
        )}
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label="Civi Meet, open chats" title="Civi Meet, chats"
      className="mb-1 h-11 w-11 shrink-0 rounded-md p-1">
      <img key={animation} src={icon.url} alt="Civi Meet" className="civi-mark-arrive h-full w-full object-contain" />
    </Button>
  );
}

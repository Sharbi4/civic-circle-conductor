import { useEffect, useRef, useState } from "react";
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
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label={mobile ? "Open Civi Meet menu" : "Civi Meet — open chats"} title={mobile ? "Civi Meet — open menu" : "Civi Meet — chats"}
      className={mobile ? "absolute left-3 top-3 z-40 h-8 w-8 rounded-md bg-background/90 p-1 md:hidden" : "mb-1 h-11 w-11 shrink-0 rounded-md p-1"}>
      <img key={animation} src={icon.url} alt="Civi Meet" className="civi-mark-arrive h-full w-full object-contain" />
    </Button>
  );
}
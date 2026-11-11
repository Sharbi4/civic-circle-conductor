import { useEffect, useState } from "react";
import icon from "@/assets/civimeet-chat-icon.png.asset.json";

const phrases = ["Cooking up something worth your time…", "Getting ready to knock your socks off…", "Connecting the dots. Making a little magic…", "Thinking big. Getting the good ideas ready…", "Finding your next ‘why didn’t we think of that?’…", "Warming up a few brilliant possibilities…"];

export function AgentPreparing({ name }: { name: string }) {
  const [phrase, setPhrase] = useState("Getting the good ideas ready…");
  useEffect(() => {
    const last = sessionStorage.getItem("civi-preparing-phrase");
    const options = phrases.filter((p) => p !== last);
    const next = options[Math.floor(Math.random() * options.length)] ?? phrases[0] ?? "Thinking…";
    sessionStorage.setItem("civi-preparing-phrase", next);
    setPhrase(next);
  }, []);
  return <div role="status" aria-live="polite" className="flex min-h-[360px] flex-col items-center justify-center gap-6 px-4 py-12 text-center">
    <img src={icon.url} alt="" className="agent-preparing-mark h-24 w-24 object-contain" />
    <div className="space-y-3"><p className="text-sm font-medium text-muted-foreground">{name}</p><h2 className="font-display text-2xl font-semibold sm:text-3xl">{phrase}</h2></div>
    <div aria-hidden="true" className="flex h-4 items-center gap-2"><span className="typing-dot h-2 w-2 rounded-full bg-primary" /><span className="typing-dot h-2 w-2 rounded-full bg-primary [animation-delay:150ms]" /><span className="typing-dot h-2 w-2 rounded-full bg-primary [animation-delay:300ms]" /></div>
  </div>;
}
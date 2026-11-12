import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useThreads } from "./chat";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({ meta: [
    { title: "Organizer chat, Civi Meet" }, { name: "description", content: "Talk with Civi to organize community outreach, events and volunteer work." },
    { property: "og:title", content: "Organizer chat, Civi Meet" }, { property: "og:description", content: "Your organization’s community organizing conversations." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ChatIndex,
});

function ChatIndex() {
  const threads = useThreads();
  const main = threads.data?.find((t) => t.kind === "main");
  if (!main) return null;
  return <Navigate to="/chat/$threadId" params={{ threadId: main.id }} replace />;
}

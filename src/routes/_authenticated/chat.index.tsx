import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useThreads } from "./chat";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const threads = useThreads();
  const main = threads.data?.find((t) => t.kind === "main");
  if (!main) return null;
  return <Navigate to="/chat/$threadId" params={{ threadId: main.id }} replace />;
}

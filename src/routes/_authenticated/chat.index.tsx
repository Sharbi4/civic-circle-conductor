import { createFileRoute } from "@tanstack/react-router";
import { ActivitiesWorkspace } from "@/components/activities/ActivitiesWorkspace";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({ meta: [
    { title: "Activities — Civi Meet" }, { name: "description", content: "Shared community activity plans, responsibilities, approvals and completed-work receipts." },
    { property: "og:title", content: "Activities — Civi Meet" }, { property: "og:description", content: "One shared organizing record across all your channels." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ActivitiesWorkspace,
});

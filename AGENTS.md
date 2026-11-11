<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- AI calls go through `@lovable.dev/ai-gateway` in `src/lib/*.functions.ts` server functions with `requireSupabaseAuth`; why: keeps prompts and keys server-side and RLS scoped per user.
- Per-org data (organizations, threads, messages, memories) is keyed by auth user id with owner-only RLS; why: each organization gets isolated agent memory.
- Formal outputs (checklists, plans, letters) are saved as documents via a [[document: ...]] marker and rendered on one shared letterhead template; why: every org gets consistent, official, downloadable documents.
- Polls/feedback/sign-ups are built in: Civi emits a [[poll: {...}]] marker, saved to owner-only polls; public /p/$id page reads and writes only through validated server functions (no anon table access); why: shareable links without exposing responses.
- LinkedIn photo and event-cover transfers share a server-only authenticated PUT helper; stop publication if an approved photo fails so the published content matches the approval.
- Shared scheduler/recovery/report callbacks process owner-scoped durable task runs with database claims, atomic completion and a provider-start boundary; unknown outcomes require review rather than replay to avoid duplicated work.
- Retired activity and usage schema remains preserved but unused by the chat-centered app; keep applied migration history intact so rollback never destroys organization data.
- Thread read timestamps and assistant-message timestamps persist unread state per owner; ignored approvals are retained without executing actions, so dismissing is not approval or deletion.

- Standing approvals are owner-scoped by action, connection revision, page and target; provider execution shares an atomic claim and persisted outcome across manual and scheduled turns, so approval is never mistaken for success and actions cannot be replayed.

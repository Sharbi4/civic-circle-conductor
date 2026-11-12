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
- All document creation (organizer and daily reports) passes through buildDocument: shared completeness rules expand thin drafts against org/event facts, then a real licensed Wikimedia photo or, failing that, a labeled Civi illustration is stored in owner-prefixed private storage and signed at render time; unfinished or picture-less documents are held back, because every saved document must be ready to use.
- Letterhead reminders share an owner-keyed sessionStorage claim reset on sign-out; explicit editing remains available, because chat and PDF downloads must not repeatedly interrupt the same session.
- The chat brand mark reuses the uploaded CDN asset and animates only on entry or newly observed inbox items; reduced motion disables it, because alerts should not cause continuous distracting animation.
- Polls/feedback/sign-ups are built in: Civi emits a [[poll: {...}]] marker, saved to owner-only polls; public /p/$id page reads and writes only through validated server functions (no anon table access); why: shareable links without exposing responses.
- LinkedIn uses explicitly chosen direct per-user OAuth with server-only single-use owner-bound state and encrypted tokens; API calls use api.linkedin.com and authenticated image PUTs preserve LinkedIn's exact allowed upload URL, because the managed proxy cannot route the media host. Standing permissions bind to the direct connection revision; never publish without the approved image.
- LinkedIn authorization failures expose safe actionable messages to the initiating window and log only stage, status and allowlisted error codes; why: diagnose failures without leaking OAuth codes, tokens or provider response details.
- Shared scheduler/recovery/report callbacks process owner-scoped durable task runs with database claims, atomic completion and a provider-start boundary; unknown outcomes require review rather than replay to avoid duplicated work.
- Availability calls reuse one-time owner-scoped approvals and a dedicated safety-scoped ElevenLabs agent per call; persist the initiation boundary and never redial unknown outcomes, because shared voice-agent configuration and call initiation must not grant booking or payment authority.
- Call reports verify stored owner, thread, conversation and agent IDs; chat and shared jobs refresh results using approval-ID message deduplication, because concurrent completion checks must never duplicate reports or redial.
- Retired activity and usage schema remains preserved but unused by the chat-centered app; keep applied migration history intact so rollback never destroys organization data.
- Thread read timestamps and assistant-message timestamps persist unread state per owner; ignored approvals are retained without executing actions, so dismissing is not approval or deletion.

- Standing approvals are owner-scoped by action, connection revision, page and target; provider execution shares an atomic claim and persisted outcome across manual and scheduled turns, so approval is never mistaken for success and actions cannot be replayed.

- Scout writes briefings and validated action ideas only to owner-scoped Discovery findings; historical Scout messages stay stored but are hidden from chat, and Take action verifies the required connection before starting the organization’s agent.

- Browser execution and media helpers live in server-only modules; client-reachable function declarations dynamically load them only inside handlers to keep provider credentials and automation dependencies out of frontend bundles.
- Server fetches never use redirect: 'error' (the Worker runtime throws on it); use 'manual' and reject 3xx explicitly.
- OAuth return pages also broadcast results on BroadcastChannel 'civi-oauth' and openers tolerate a severed popup; why: providers like X cut window.opener.
- Eventbrite draft controls bind publication approval to an exact event and connection revision; reminders and scheduled publication are task rows consumed by the existing shared scheduler. Publication uses an atomic approval claim and a live-status readback; interrupted work requires review, not replay.
- New channel welcome preparation is tracked per thread in the query cache and rendered inline by AgentPreparing; why: no corner toast.
- Browser research limits return a summary and recommendation, not a takeover; scheduled tasks own a 'scheduled' thread.
- Event steps are a keyed dependency/timer plan on task rows; shared code decides readiness, the scheduler queues every ready step, and tagged approvals finish steps on real success, so one blocked step never stalls an event.
- LinkedIn browser tasks, session starts, retargets and direct navigation are blocked through shared routing guards; why: LinkedIn work uses the existing owner-bound API connection rather than browser authentication.
- Event chats: threads kind 'event' + event_date, one linked Event goal; [[event_chat]] marker updates them; why: events are the central unit.
- Event page data lives in owner-only event_profiles/sticky_notes keyed by goal; organizer prompt treats it as truth.
- Live-browser web searches go to DuckDuckGo (Google search URLs and verification pages are rewritten) and repeated pages/searches are re-asked once; why: Google blocks automated browsers and loops waste the step budget.
- Automatic instruction turns (research hand-backs, plan steps, resumes, scheduled runs) are saved as role 'system' via runOrganizer({hidden:true}) and filtered by isHiddenTurn; why: the model needs them but the organizer must never see them as their own messages.
- Browser-opened PDFs/Word files are read server-side (unpdf/fflate, falling back to an in-page fetch) and their facts plus event conflicts are stored as step notes; why: the browser shows no text for documents and booking facts live in them.
- Research results reach the event page through event_venue/event_contact/event_vendor markers parsed by eventPage.shared and merged (never un-booking) by eventPage.server, from both chat replies and browser summaries; why: the event page must reflect what research found.

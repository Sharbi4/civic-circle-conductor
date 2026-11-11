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
- All organizer document creation passes through the shared document standard and Wikimedia photo enrichment; real reusable photos are stored in owner-prefixed private storage and signed at render time, because source hotlinks and invented documentary imagery are not reliable deliverables.
- Letterhead reminders share an owner-keyed sessionStorage claim reset on sign-out; explicit editing remains available, because chat and PDF downloads must not repeatedly interrupt the same session.
- The chat brand mark reuses the uploaded CDN asset and animates only on entry or newly observed inbox items; reduced motion disables it, because alerts should not cause continuous distracting animation.
- Polls/feedback/sign-ups are built in: Civi emits a [[poll: {...}]] marker, saved to owner-only polls; public /p/$id page reads and writes only through validated server functions (no anon table access); why: shareable links without exposing responses.
- LinkedIn uses explicitly chosen direct per-user OAuth with server-only single-use owner-bound state and encrypted tokens; API calls use api.linkedin.com and authenticated image PUTs preserve LinkedIn's exact allowed upload URL, because the managed proxy cannot route the media host. Standing permissions bind to the direct connection revision; never publish without the approved image.
- LinkedIn authorization failures expose safe actionable messages to the initiating window and log only stage, status and allowlisted error codes; why: diagnose failures without leaking OAuth codes, tokens or provider response details.
- Shared scheduler/recovery/report callbacks process owner-scoped durable task runs with database claims, atomic completion and a provider-start boundary; unknown outcomes require review rather than replay to avoid duplicated work.
- Availability calls reuse one-time owner-scoped approvals and a dedicated safety-scoped ElevenLabs agent per call; persist the initiation boundary and never redial unknown outcomes, because shared voice-agent configuration and call initiation must not grant booking or payment authority.
- Retired activity and usage schema remains preserved but unused by the chat-centered app; keep applied migration history intact so rollback never destroys organization data.
- Thread read timestamps and assistant-message timestamps persist unread state per owner; ignored approvals are retained without executing actions, so dismissing is not approval or deletion.

- Standing approvals are owner-scoped by action, connection revision, page and target; provider execution shares an atomic claim and persisted outcome across manual and scheduled turns, so approval is never mistaken for success and actions cannot be replayed.

- Scout writes briefings and validated action ideas only to owner-scoped Discovery findings; historical Scout messages stay stored but are hidden from chat, and Take action verifies the required connection before starting the organization’s agent.

- Browser execution and media helpers live in server-only modules; client-reachable function declarations dynamically load them only inside handlers to keep provider credentials and automation dependencies out of frontend bundles.
- Server fetches never use redirect: 'error' (the Worker runtime throws on it); use 'manual' and reject 3xx explicitly.
- OAuth return pages also broadcast results on BroadcastChannel 'civi-oauth' and openers tolerate a severed popup; why: providers like X cut window.opener.
- LinkedIn profile photos travel with the encrypted owner-scoped connection and only their safe display URL enters connection status; account avatars share that refreshed status without replacing organization letterhead logos.
- X status reads the authenticated member photo through the owner's stored connection; shared account avatars prefer LinkedIn then X, while X's connector row always uses its own photo. Cache status reads for five minutes and invalidate on connection changes to avoid unnecessary provider calls.
- Eventbrite status retrieves only the authenticated member image (expanded image or its media ID) with the owner's encrypted token; its connector avatar is independent, and shared avatars use it after LinkedIn and X. Never substitute an event cover or organization logo for a member photo.
- Eventbrite draft controls bind publication approval to an exact event and connection revision; reminders and scheduled publication are task rows consumed by the existing shared scheduler. Publication uses an atomic approval claim and a live-status readback; interrupted work requires review, not replay.

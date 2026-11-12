# Civi Meet roadmap
- [x] Add verified-number phone fallback guidance and owner-only completed-call reporting through chat refresh and shared jobs; preserve secure-payment boundaries. Real-call end-to-end verification remains pending below; live listening is not implemented (ElevenLabs enterprise feature).
- [x] Prioritize venue availability and real browser reservation preparation before promotion; retain separate booking/payment approval and secure credential handoff. Verified selected meetup launches a real read-only browser session.
- [x] Connect outbound calling services and add one-time approved availability call initiation with AI disclosure, isolated scripts, saved provider boundary and secure payment-link instructions; verified both accounts and imported outbound number. No real call has been placed.
- [x] Verify an approved real outbound availability call and its completed-call report: browser research now hands findings back to the organizer, which queues the venue_call approval; one-time approval placed a real call to the Ward 3 Council Office and the completed report (voicemail reached, message left) posted to the chat with the approval marked done. Binding phone bookings/payments remain unsupported; use browser booking and secure payment handoff.
- [x] Set the shared enterprise document standard and sourced real photography; verified a saved 1,489-word Tucson spotlight with eight substantive sections, licensed photo, citations, phone/desktop layout and no runtime errors. Existing documents remain unchanged.
- [x] Add Eventbrite draft controls: save for later, day/week/custom reminders, scheduled publishing and publish now with confirmed results; reuse shared scheduler. Real draft reminder/schedule/cancellation verified, 23 tests pass; event remains unpublished pending venue confirmation.
- [x] Add Eventbrite member avatars to the connection row and shared account fallback, preserving organization logos.
- [x] Wire X account photos into the X connection row and shared account avatar (LinkedIn first, X fallback), without replacing organization logos.
- [x] Wire LinkedIn member photos to account avatars without replacing organization logos; 14 focused tests pass and signed-in phone/desktop fallback verified. Real photo display awaits successful LinkedIn reconnect after publishing.
- [x] Fix X / Eventbrite / LinkedIn connect windows losing their link back to Civi Meet ("window closed before finishing").
- [x] Preserve useful LinkedIn connection failure messages and add credential-safe authorization diagnostics; rejected-credential regression verified.
- [ ] Complete live LinkedIn consent: root cause found — the live server rejected the no-redirect request setting used for LinkedIn's token exchange, so every Allow failed. Fixed and tested; waiting on publish + one reconnect.
- [x] Build the explicitly selected separate LinkedIn authorization: owner-bound single-use consent, encrypted per-organization tokens, direct API calls and exact signed photo PUTs, reconnect UI, and confirmed posting status. App credentials saved; signed-in authorization start, phone/desktop reconnect UI, invalid-state rejection and 20 focused tests verified.
- [x] Keep Scout briefings only in Discovery; add blog/event/post ideas with Take action and missing-connection prompts. Verified existing findings, phone/desktop layout, missing-X prompt and real blog request reaching Civi; document creation correctly waits for missing organization details.
- [x] Add scoped always-approve choices and persistent provider-confirmed execution status. Signed-in one-time failure, internal success, saved permissions and revocation verified; external publication not retried.
- [ ] Verify real LinkedIn photo publication after replacement authorization: publish the new callback, register https://civimeet.com/api/public/oauth/linkedin/return in LinkedIn, and have the organization reconnect. Old managed OAuth tokens cannot be reused. Direct upload routing is tested; real consent and real provider-confirmed publication remain blocked until deployment and reconnection. Preserve failed drafts/photos and never omit approved images or retry automatically.
- [x] Add swipe-to-ignore notification/approval cards with Undo and unread dots beside chats. Verified signed-in swipe saves ignored status without executing work; opening unread chat clears its dot.
- [x] Restore the pre-activity chat-centered app and remove later usage controls while preserving the three shared scheduled jobs and existing data. Verified main-chat redirect, account fields, absent activity/usage UI, authenticated recovery, schedule metadata and safety tests.
- [x] Consolidate background work into 15-minute scheduling, 30-minute safe recovery, and daily organization reports; organizing work stays in database tasks with atomic claims/completion.
- [x] Sign-in, onboarding (org name + mission), main organizer chat, side chats, per-org memory
- [x] Eventbrite connector: per-org OAuth connect flow (popup → encrypted token storage → "Eventbrite Agent" side chat); Connect/Disconnect in connectors panel. Civi creates real Eventbrite events (draft) after approval; attendee management still to build
- [x] Live browser view — Civi opens real Browserbase sessions ([[browse:]] marker), live iframe card in chat with End session; Civi drives it itself (navigate, search, fill, submit after approval) via a step loop. Browserbase connection re-keyed to the upgraded account and verified live (session opened, Eventbrite navigated and driven). Sessions created with keepAlive so the browser survives between agent steps; End uses POST REQUEST_RELEASE (verified COMPLETED)
- [ ] Eventbrite app registration: provide Application URL + OAuth Redirect URI values for both preview and published hosts; verify first real OAuth connect with corrected credentials
- [ ] Scheduled agent tasks (5/15/30 min)
- [x] Six lead actions: Plan an Event, Social Outreach, Poll Your Community, Analyze Sentiment, Email Campaign, Phone Outreach — kickoff cards in chat empty state + full workflow guidance in the system prompt (lead action → task plan → execution tools)
- [ ] Agent task plans: visible multi-step plan per objective with statuses the organizer can watch and redirect
- [x] Resource directory: vendors/venues/partners saved via [[resource:]] markers from chat and Community Scout; browsable in the Scout panel
- [x] Community Scout: scheduled background job (twice daily, up to 10 focus areas per org) — researches the live web (Firecrawl search), cites sources per finding, saves resources with source links, posts a findings report to the main chat; falls back to unverified model knowledge if search is unavailable; Facebook-group recommendations require admin approval
- [x] LinkedIn connector: per-org connect, LinkedIn Agent side chat, posts published after approval (Events API still to build)
- [ ] Remaining connectors: Facebook, Instagram, Instagram DMs, X, Gmail, TikTok
- [~] Nextdoor connector: per-org OAuth connect flow + callback route + Connect button built (mirrors Eventbrite); waiting on Nextdoor to issue client ID/secret (they required the redirect URI first: https://civic-circle-conductor.lovable.app/api/oauth/nextdoor/return); add NEXTDOOR_CLIENT_ID/NEXTDOOR_CLIENT_SECRET secrets, publish, then verify first connect. Token refresh (expires_in) not yet stored; posting via Share API not yet implemented
- [ ] Streaming replies
- [x] Muse-style animated homepage + Civi character
- [ ] Food vendor database (Facebook agent searches vendors, saves them; used for event outreach)
- [ ] Settings page: connectors + secure saved logins the agent can fill into forms
- [ ] Voice agent (ElevenLabs or OpenAI voice)
- [x] Civi character: unique character modeled on the user's uploaded reference (not a robot)
- [x] Civi character: robot penguin
- [x] Approvals inbox: Civi queues outreach/booking/payment proposals; Approve/Decline cards in a sidebar inbox, decision posted back to main chat

- [x] Event cover upload: attach own image/logo or inspiration picture in chat; use it (or AI edit of it) as Eventbrite/LinkedIn cover
- [x] LinkedIn events: create+publish, edit, re-publish via approvals (company page ID optional)
- [x] LinkedIn company page publishing: org scopes (rw_organization_admin, w_organization_social, r_organization_social) added to connect flow; posts and events publish as the organization when a page ID is set. Requires the "Community Management API" product enabled in the LinkedIn developer app + reconnect in Civi. Live org-post verification pending.
- [x] LinkedIn event covers: uploaded/inspiration/AI cover uploaded via LinkedIn assets API and set as the event's backgroundImage on create and edit (live LinkedIn verification still pending a real approved event)
- [x] Settings → Saved logins: encrypted per-org website logins; live browser fills them on matching sites (password never sent to AI)
- [x] Browser handoff: Civi asks for control ('Your turn') and resumes when handed back
- [x] First Facebook sign-in pop-up: city/ZIP → find groups (no joining without approval) + Page TLC review
- [ ] Facebook Page: upload photos, scheduled recurring posts with generated/uploaded images (via browser, approval-gated)
- [x] New-user welcome: Civi offers 'Set up now' vs 'over time' as tap-to-choose replies; guided setup step by step
- [x] Browser memory: one browser per chat, new tasks keep earlier steps/results as context
- [ ] Browser keeps driving when the chat is closed (now only steps while a chat page is open)
- [x] Eventbrite: uploaded cover auto-attached to event requests, cropped 2:1, verified on listing after create
- [x] Browser buttons as see-through icons on the browser; more zoom
- [x] Pin / delete buttons on side chats
- [x] Event planning leads with ideas + shared event playbook; browser saves vendors to directory
- [x] + menu lists connected agents with logos; Facebook opens browser with saved login
- [x] Perplexity research during onboarding + event planning
- [x] ElevenLabs voice: read replies aloud + talk to Civi
- [ ] Square vendor payments (approval-gated) — waiting on Square setup
- [ ] Event promotion media: photos on X + LinkedIn done; remaining — AI video generation + upload, Facebook browser media upload
- [ ] Tasks & Goals sidebar panel (table + Civi awareness done; UI pending)

- [x] Correct LinkedIn image transfers to authenticated PUT; never silently publish text-only after a photo failure. Transfer regression tests passed.
- [ ] Verify a real LinkedIn photo upload and post after the correction; requires a new approved attempt, without automatically replaying earlier approved posts.
- [x] Remove the "Private preview" label from the public homepage.
- [x] Event plan engine: each event step knows its channel, what it waits for (steps or a time relative to the event), its state and result link; scheduler runs every ready step; approvals finish steps; unconnected channels skip with a draft; post-event recap/thank-you/feedback on a timer; Facebook kept to Page posts, personal invites by email.
- [x] Publish so the sitemap is live, then rescan SEO and confirm homepage, sign-in, Terms, Privacy and Data Deletion pass.

## Investor demo (Friday) — fix by Thursday
- [x] Event page fills from the chat (venue, budget, headcount) and shows the same steps as the chat.
- [x] "Event goals: N open · N overdue" counter lists its items.
- [x] Times shown in the organization's time zone (approvals, calendar events), not UTC.
- [x] Connectors show the connected email address instead of "Gmail account"/"Google account".
- [x] Phone: message box placeholder not cut off.
- [x] Demo account: clean believable nonprofit with logo + letterhead, one half-done event with result links, poll with responses, Discovery briefings; no test leftovers.
- [x] Demo safety: Assisted mode / no real social accounts in the demo.

## Test round 2 (Elle)
- [x] Browser venue research: stop repeating searches; open forms it finds; handle Google check
- [x] Research plan dates: never give deadlines already past
- [x] Facebook group search: handle security check; browser panel shows current task title/page
- [x] Choice buttons on summaries show raw **asterisks**
- [x] Approve a real action from Approvals, confirm it lands in the right chat, show the chat history (routing confirmed; Gmail itself needs Reconnect — Google expired its access)
- [x] Documents are always complete (no thin outlines/placeholders) and always have a picture (real matching photo or labeled Civi illustration); demo documents redone

## Demo-critical fixes (Elle, Nov 12)
- [x] Internal continuation prompts (research hand-back, phone-fallback/venue_call instructions) are hidden system turns, never visible user messages
- [x] Browser reads PDFs/Word files it opens, uses their facts and flags conflicts with the event (e.g. closed on the event's day)
- [x] Research summaries answer the actual goal (vendors → named vendors with links, prices, contacts); no venue template; never "no findings" after reading pages
- [x] Markers for venue, contacts and vendors write to the event page from chat and browser research
- [x] Markdown tables render in chat
- [x] Skipped steps show "Skipped — draft ready" in What Civi has done; View links for X and LinkedIn posts

## Test round 3 (Elle, Nov 12)
- [ ] Stop sign-outs mid-session (shared demo account: signing out anywhere ended every device's session)
- [ ] Browser research keeps per-page notes (name, URL, prices/minimums, capacity, contact); summary uses them, price range per vendor
- [ ] After a conflict (e.g. venue closed on event day), lead with alternatives: venue open that day or nearby date/time
- [ ] Save venue phone/email to event Contacts; save every vendor asked for
- [ ] LinkedIn post View link; investigate failed "Reminder" Gmail draft on the demo meetup
- [ ] Demo account: keep today's town hall as second demo event, delete yesterday's

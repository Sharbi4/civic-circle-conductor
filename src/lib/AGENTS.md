# Connector status notes
- LinkedIn profile photos travel with the encrypted owner-scoped connection and only their safe display URL enters connection status; account avatars share that refreshed status without replacing organization letterhead logos.
- X status reads the authenticated member photo through the owner's stored connection; shared account avatars prefer LinkedIn then X, while X's connector row always uses its own photo. Cache status reads for five minutes and invalidate on connection changes to avoid unnecessary provider calls.
- Eventbrite status retrieves only the authenticated member image (expanded image or its media ID) with the owner's encrypted token; its connector avatar is independent, and shared avatars use it after LinkedIn and X. Never substitute an event cover or organization logo for a member photo.

# Chat, research and event page notes
- Automatic instruction turns (research hand-backs, plan steps, resumes, scheduled runs) are saved as role 'system' via runOrganizer({hidden:true}) and filtered by isHiddenTurn; why: the model needs them but the organizer must never see them as their own messages.
- Browser-opened PDFs/Word files are read server-side (unpdf/fflate, falling back to an in-page fetch) and their facts plus event conflicts are stored as step notes; why: the browser shows no text for documents and booking facts live in them.
- Research results reach the event page through event_venue/event_contact/event_vendor markers parsed by eventPage.shared and merged (never un-booking) by eventPage.server, from both chat replies and browser summaries; why: the event page must reflect what research found.

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, ShieldCheck, Trash2 } from "lucide-react";
import logo from "@/assets/civimeet-logo.png.asset.json";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy, Civi Meet" },
      {
        name: "description",
        content:
          "How Civi Meet collects, uses and protects your organization's information, saved logins and connected accounts.",
      },
      { property: "og:title", content: "Privacy Policy, Civi Meet" },
      {
        property: "og:description",
        content:
          "What Civi Meet stores, who it shares it with, and how you stay in control of every post, booking and payment.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const PROMISES = [
  {
    icon: ShieldCheck,
    title: "Nothing goes out without you",
    body: "Posts, event listings, joins, bookings and payments wait for your approval. Civi prepares them; you release them.",
  },
  {
    icon: Eye,
    title: "You can watch the work",
    body: "Browser activity is shown to you as it happens, and you can take over the browser at any moment.",
  },
  {
    icon: Trash2,
    title: "Yours to remove",
    body: "Disconnect a platform, delete a saved login, or ask us to delete your organization's data at any time.",
  },
];

const COLLECTED = [
  {
    title: "Your account",
    body: "Email address and password, plus the unique ID we use to keep your organization's data separate from every other organization's.",
  },
  {
    title: "Your organization",
    body: "Name, address, mission, how you heard about Civi Meet, the public pages you give us (Facebook, Instagram, X, LinkedIn, website), the apps you already use, your logo, your city or ZIP for local searches, and your settings for autonomy and notification checks.",
  },
  {
    title: "Your conversations with Civi",
    body: "Threads, side chats, messages you send and replies Civi writes, plus the documents Civi produces for you such as checklists, plans and letters.",
  },
  {
    title: "What Civi remembers and learns",
    body: "Facts you or Civi record as durable memory, your focus areas, and the vendor, venue and group leads Civi collects, with the source page for each one.",
  },
  {
    title: "Connected platform accounts",
    body: "For each platform you connect (Eventbrite, LinkedIn, X, Nextdoor, Gmail, Google Calendar, Google Drive), the account name and an encrypted access token that lets Civi act on your behalf. Google data is covered in detail in section 5.",
  },
  {
    title: "Saved logins for the live browser",
    body: "The site, the username, and an encrypted password for accounts you want Civi to sign in to while it works in the browser.",
  },
  {
    title: "Browser activity records",
    body: "Which site was opened, the goal you gave, the steps Civi took, whether a login was used, and when the session started and ended. Page content Civi reads while working is processed in the moment; we do not keep a copy of the sites you browse.",
  },
  {
    title: "Approval requests",
    body: "What Civi wanted to do, the details, your decision, and when you made it.",
  },
  {
    title: "Information requests",
    body: "If you fill in the request form on our homepage: your email, optional phone number, organization and message.",
  },
];

const SHARED_WITH = [
  {
    name: "AI model providers",
    body: "Generate Civi's replies, plans and event images. Your organization's context is sent so the output fits your mission. They process it only to run Civi Meet for you, and Google user data sent to them is not used to train their models.",
  },
  {
    name: "Browserbase",
    body: "Runs the hosted browser session you watch while Civi searches, fills forms and signs in on your behalf.",
  },
  {
    name: "Firecrawl and Perplexity",
    body: "Read the public pages you point us at and search the open web, so Civi's research and citations come from real sources.",
  },
  {
    name: "ElevenLabs",
    body: "Turns Civi's replies into speech when you play them aloud, and your spoken words into text when you dictate.",
  },
  {
    name: "The platforms you connect",
    body: "Eventbrite, LinkedIn, X, Nextdoor and Facebook receive what is needed to publish or act there, under your account and only after your approval.",
  },
  {
    name: "Lovable (our app platform and connector gateway)",
    body: "Hosts the app, routes requests to AI models, and securely stores the access tokens for the Google, X and other accounts you connect, so Civi can act only where you've allowed it.",
  },
  {
    name: "Our hosting and database provider",
    body: "Stores your data and runs sign-in. Access is limited to what is needed to operate the service.",
  },
];

function PrivacyPage() {
  return (
    <div className="dark relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_70%)]" />

      <header className="relative flex items-center justify-between px-6 py-5 md:px-16">
        <Link to="/">
          <img src={logo.url} alt="Civi Meet" className="h-9 w-auto rounded-xl bg-white px-3 py-1.5" />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium hover:bg-card"
        >
          <ArrowLeft className="h-4 w-4" /> Back to site
        </Link>
      </header>

      <main className="relative mx-auto w-full max-w-3xl px-6 pb-32 md:px-0">
        <p className="text-sm text-muted-foreground">Effective November 14, 2026</p>
        <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight md:text-6xl">Privacy Policy</h1>
        <p className="mt-6 text-lg text-muted-foreground">
          Civi Meet is an AI organizer for nonprofits, campaigns and community groups. This policy explains what we
          collect, why we collect it, who helps us run the service, and the controls you keep over everything Civi
          does.
        </p>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {PROMISES.map((p) => (
            <div key={p.title} className="rounded-3xl border border-border/60 bg-card/60 p-5 shadow-glow backdrop-blur-xl">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
                <p.icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-semibold">{p.title}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">1. What we collect</h2>
          <p className="mt-3 text-muted-foreground">
            Everything below belongs to your organization and is kept separate from every other organization's.
          </p>
          <div className="mt-6 space-y-3">
            {COLLECTED.map((c, i) => (
              <div key={c.title} className="rounded-2xl border border-border/60 bg-card/40 p-5">
                <p className="text-sm font-semibold">
                  <span className="mr-2 text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  {c.title}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">2. How we use it</h2>
          <ul className="mt-4 space-y-2.5 text-muted-foreground">
            {[
              "To answer you, plan events, draft outreach and keep your community updates coming.",
              "To remember your mission, your city, your vendors and your voice so you never repeat yourself.",
              "To sign in to sites you asked us to work in, and to prepare posts, listings and bookings for your approval.",
              "To show you what the browser is doing and record what was done.",
              "To reply to information requests you send us.",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 rounded-2xl border border-border/60 bg-card/40 p-5 text-sm">
            We do not sell your personal information, and we do not use your organization's data to build products for
            other customers.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">3. Who helps us run Civi Meet</h2>
          <p className="mt-3 text-muted-foreground">
            These services process the information needed to do the job you asked for. We do not send them more than
            that job requires.
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-border/60">
            {SHARED_WITH.map((s) => (
              <div key={s.name} className="grid gap-1 border-b border-border/60 bg-card/40 p-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] sm:gap-5">
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">4. Saved logins and connected accounts</h2>
          <div className="mt-4 space-y-3 text-muted-foreground">
            <p>
              Passwords you save for the live browser, and the access tokens from platforms you connect, are stored in
              encrypted form and are only used to sign in or act on the site you pointed Civi to. They are never shown
              back in chat, and passwords you type into a page while Civi is watching are not recorded in the step log.
            </p>
            <p>
              You can delete a saved login, disconnect a platform, or end a browser session at any time. Doing so stops
              Civi from using that access immediately.
            </p>
          </div>
        </section>

        <section id="google-user-data" className="mt-16 scroll-mt-8">
          <h2 className="font-display text-2xl font-semibold">5. Google user data</h2>
          <div className="mt-4 space-y-4 text-muted-foreground">
            <p>
              If you connect Gmail, Google Calendar or Google Drive, Civi Meet accesses only what the features you use
              need, and only after you grant access on Google's consent screen.
            </p>
            <div>
              <h3 className="font-semibold text-foreground">What we access</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>
                  <span className="font-medium text-foreground">Gmail</span> (<code>gmail.modify</code>): when you ask
                  Civi about your email, it reads the sender, subject, date and a short preview of recent messages so it
                  can summarize them and draft replies. It saves drafts, sends emails you approve, and labels, marks read
                  or archives messages when you ask. Civi never permanently deletes email.
                </li>
                <li>
                  <span className="font-medium text-foreground">Google Calendar</span> (<code>calendar.events</code>):
                  reads your upcoming events to avoid conflicts, and creates, updates or cancels events you approve.
                </li>
                <li>
                  <span className="font-medium text-foreground">Google Drive</span> (<code>drive.file</code>): creates
                  and edits only the documents Civi makes for you or files you choose to use with Civi Meet. We cannot
                  see the rest of your Drive.
                </li>
                <li>Your Google account email address and name, to show which account is connected.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">How we use it</h3>
              <p className="mt-2">
                Google user data is used only to provide and improve the features you see in Civi Meet. It is never used
                for advertising, never sold, never used for credit or lending decisions, and never used to build
                products or shared knowledge for other organizations. People at Civi Meet do not read it, except with
                your permission, for security or legal reasons, or when it is needed to operate the service.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Who it is shared with</h3>
              <p className="mt-2">
                To do the work you ask for, the relevant parts are sent to the AI model providers that write Civi's
                replies, through our app platform, and our connector gateway stores your Google access token securely.
                These providers process it only to run Civi Meet for you. We do not transfer Google user data to anyone
                else, except when required by law or with your explicit consent.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">AI and model training</h3>
              <p className="mt-2">
                We do not use Google user data, raw or aggregated, to develop, improve or train AI or machine-learning
                models beyond your own organization's personalized experience, and we do not transfer it to third-party
                AI services that use it to train their models.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">How it is protected</h3>
              <p className="mt-2">
                Data is encrypted in transit and at rest. Access tokens are stored encrypted, and each organization's
                records can be seen only by its own members. Sends, calendar changes and document edits wait for your
                approval.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Retention and deletion</h3>
              <p className="mt-2">
                Civi reads Gmail, Calendar and Drive content live when a task needs it and does not keep separate
                copies. What appears in your chats, such as Civi's summaries and drafts, stays until you delete it.
                Disconnecting a Google service in Connectors revokes our access and deletes the stored token
                immediately. Deleting your organization removes your chats, memories and connection records (see{" "}
                <a href="/data-deletion" className="text-primary underline">data deletion</a>). You can also
                remove access at any time at{" "}
                <a href="https://myaccount.google.com/permissions" className="text-primary underline" target="_blank" rel="noreferrer">
                  myaccount.google.com/permissions
                </a>
                .
              </p>
            </div>
            <div className="rounded-2xl border bg-secondary/40 p-4">
              <h3 className="font-semibold text-foreground">Limited Use</h3>
              <p className="mt-2">
                Civi Meet's use and transfer to any other app of information received from Google APIs will adhere to
                the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  className="text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. The use of raw or derived user data received from Workspace
                APIs will adhere to the Google User Data Policy, including the Limited Use requirements.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">6. Approvals and your control</h2>
          <p className="mt-4 text-muted-foreground">
            Posting, joining groups, creating or publishing events, bookings, negotiations and payments are prepared by
            Civi and held until you approve them. You choose how much Civi starts on its own, and you can take over the
            browser mid-task. Nothing consequential happens while you hold control.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">7. How long we keep it</h2>
          <p className="mt-4 text-muted-foreground">
            We keep your organization's data while your account is active. Ask us to delete your organization and we
            remove your chats, documents, memories, saved logins, connected accounts and browser records, unless we are
            required by law to keep something.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">8. Security</h2>
          <p className="mt-4 text-muted-foreground">
            Data is transferred over encrypted connections and stored in a database with access restricted to what
            operating the service requires. Each organization's records are limited to its own members. No system is
            perfectly secure, so we also keep consequential actions behind your approval.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">9. Children and unrelated visitors</h2>
          <p className="mt-4 text-muted-foreground">
            Civi Meet is for adults running organizations. We do not knowingly collect information from children. When
            Civi reads public community pages, it is there to find groups, vendors and venues, not to build profiles of
            individual people.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">10. Changes to this policy</h2>
          <p className="mt-4 text-muted-foreground">
            If we change this policy we will update the date at the top of this page and, for material changes, tell
            you in the app.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-2xl font-semibold">11. Contact</h2>
          <p className="mt-4 text-muted-foreground">
            To ask about your data, request a copy, or ask us to delete it, use the request form on our homepage or
            reply to any message from us. Tell us which organization you belong to and what you would like done.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Request more information <ArrowLeft className="h-4 w-4 rotate-180" />
          </Link>
        </section>
      </main>
    </div>
  );
}

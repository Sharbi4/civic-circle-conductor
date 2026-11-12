import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/civimeet-logo.png.asset.json";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service, Civi Meet" },
      { name: "description", content: "The terms for using Civi Meet, including connected accounts, Google and other APIs, the live browser, calls, documents and approvals." },
      { property: "og:title", content: "Terms of Service, Civi Meet" },
      { property: "og:description", content: "Rules for using Civi Meet's AI organizer, connectors, browser automation, calling and document tools." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

const SECTIONS: { title: string; body: string[] }[] = [
  { title: "Accepting these terms", body: [
    "By creating an account or using Civi Meet (the \"Service\"), you agree to these Terms on behalf of yourself and the organization you represent. If you do not agree, do not use the Service. You must be at least 18 and authorized to act for your organization.",
  ]},
  { title: "What Civi Meet does", body: [
    "Civi Meet is an AI organizer that helps nonprofits, campaigns and community groups plan events, draft content, research venues and vendors, prepare documents and forms, place approved phone calls, and act in connected platforms on your behalf.",
    "AI output can be wrong or incomplete. You are responsible for reviewing drafts, documents, bookings, posts and messages before you approve them.",
  ]},
  { title: "Your account and organization data", body: [
    "Keep your login secure and tell us of any unauthorized use. Each organization's data is kept separate. You own the content you provide and the content Civi creates for you, and you grant us a limited license to process it only to operate the Service.",
  ]},
  { title: "Connected accounts and APIs", body: [
    "You may connect third-party accounts, including Google (Gmail), LinkedIn, X, Eventbrite, Facebook, Nextdoor, Square, ElevenLabs, Browserbase and others. By connecting, you authorize Civi Meet to access and act on those accounts within the permissions (scopes) you grant, only to perform tasks you request or approve.",
    "Your use of each connected platform remains subject to that platform's own terms and policies. You can disconnect any account at any time, which stops Civi's access immediately.",
    "Google user data: Civi Meet's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. We use Gmail data only to read, draft and send email you request, do not use it for advertising, do not sell it, do not use it to train general AI models, and do not let humans read it except with your consent, for security, or as required by law.",
  ]},
  { title: "Approvals and automated actions", body: [
    "Posts, event publishing, group joins, outreach, form submissions, bookings, calls and payments are held for your approval unless you choose \"always approve\" for a specific action. Standing approvals can be revoked at any time. You are responsible for actions you approve.",
  ]},
  { title: "Live browser and saved logins", body: [
    "Civi may operate a hosted browser to research and complete tasks you request. You can watch and take over at any time. Saved logins are encrypted and used only for the sites you specify. Do not ask Civi to access sites you are not authorized to use.",
  ]},
  { title: "Phone calls", body: [
    "Outbound calls are made by an AI voice agent only after you approve them. Calls disclose that they are handled by an AI assistant and may be transcribed and monitored. You are responsible for complying with calling, recording-consent and telemarketing laws where you and the recipient are located. The voice agent will not make binding commitments or take payment details by phone.",
  ]},
  { title: "Documents, forms and applications", body: [
    "Civi may fill in applications and generate documents using your organization's information. It will not invent identification numbers, insurance details or signatures. Review every document before submitting it.",
  ]},
  { title: "Payments", body: [
    "Any payments to vendors or venues are made through your connected payment accounts and only after your approval. Civi Meet is not a party to your agreements with vendors, venues or attendees.",
  ]},
  { title: "Acceptable use", body: [
    "Do not use the Service for spam, harassment, deceptive or illegal political activity, impersonation, unlawful discrimination, scraping in violation of a site's terms, or any illegal purpose. Follow election, fundraising and nonprofit laws that apply to you. We may suspend accounts that violate these rules.",
  ]},
  { title: "Third-party services", body: [
    "The Service relies on third parties such as AI model providers, hosting, browser, search, voice and the platforms you connect. We are not responsible for their availability or actions.",
  ]},
  { title: "Disclaimers and liability", body: [
    "The Service is provided \"as is\" without warranties of any kind. To the fullest extent permitted by law, Civi Meet is not liable for indirect, incidental or consequential damages, or for losses resulting from actions you approved, third-party platforms, or AI output. Our total liability is limited to the amount you paid us in the 12 months before the claim.",
  ]},
  { title: "Termination", body: [
    "You may stop using the Service and request deletion at any time via our data deletion page. We may suspend or end access for violations of these Terms. On termination, connected-account access is revoked.",
  ]},
  { title: "Changes and contact", body: [
    "We may update these Terms and will change the date above; material changes will be announced in the app. Questions? Use the request form on our homepage.",
  ]},
];

function TermsPage() {
  return (
    <div className="dark relative min-h-screen bg-background text-foreground">
      <header className="relative flex items-center justify-between px-6 py-5 md:px-16">
        <Link to="/">
          <img src={logo.url} alt="Civi Meet" className="h-9 w-auto rounded-xl bg-white px-3 py-1.5" />
        </Link>
        <Link to="/" className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium hover:bg-card">
          <ArrowLeft className="h-4 w-4" /> Back to site
        </Link>
      </header>
      <main className="relative mx-auto w-full max-w-3xl px-6 pb-32 md:px-0">
        <p className="text-sm text-muted-foreground">Effective November 12, 2026</p>
        <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight md:text-6xl">Terms of Service</h1>
        <p className="mt-6 text-lg text-muted-foreground">
          These Terms cover everything Civi Meet does, the AI organizer, connected accounts and APIs, the live browser, calls, documents and approvals.
          See also our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>.
        </p>
        {SECTIONS.map((s, i) => (
          <section key={s.title} className="mt-12">
            <h2 className="font-display text-2xl font-semibold">{i + 1}. {s.title}</h2>
            {s.body.map((b) => (
              <p key={b.slice(0, 40)} className="mt-4 text-muted-foreground">{b}</p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

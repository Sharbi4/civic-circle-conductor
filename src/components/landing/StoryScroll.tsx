import { useEffect, useRef, useState } from "react";
import { Check, Search, CalendarDays, MessageCircle, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    k: "01", title: "Tell Civi your mission", body: "Share your organization and city once. Civi researches your community and remembers it for every agent.",
    visual: (
      <div className="space-y-3">
        <Bubble me>We're Tucson Food Justice. We want more volunteers this spring.</Bubble>
        <Bubble>Got it. I found 14 local groups, 9 food trucks and 3 venues near you. Saved to your memory.</Bubble>
      </div>
    ),
  },
  {
    k: "02", title: "It shows up, every day", body: "Civi answers questions in community groups, posts updates and replies to comments — building trust before you ever ask.",
    visual: (
      <div className="space-y-3">
        <Row icon={<MessageCircle className="h-4 w-4" />} t="Answered: “Where's free produce this Saturday?”" s="Tucson Neighbors · 2m ago" />
        <Row icon={<Check className="h-4 w-4" />} t="Joined Southside Community Hub" s="Facebook · approved" />
        <Row icon={<Search className="h-4 w-4" />} t="Checked 6 new comments and mentions" s="Every 5 minutes" />
      </div>
    ),
  },
  {
    k: "03", title: "It plans the event", body: "Civi suggests the name, day, venue and vendors, negotiates quotes, then lists it on Eventbrite and LinkedIn.",
    visual: (
      <div className="rounded-2xl bg-background/60 p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" /> Draft event</div>
        <p className="mt-2 text-xl font-semibold">Spring Volunteer Cookout</p>
        <p className="text-sm text-muted-foreground">Sat, Apr 18 · 9–11am · Reid Park</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {["2 food trucks · quote $640", "120 expected", "Cover image ready"].map((x) => <span key={x} className="rounded-full bg-secondary px-3 py-1">{x}</span>)}
        </div>
      </div>
    ),
  },
  {
    k: "04", title: "You stay in control", body: "Nothing is posted, booked or paid without your approval. Watch the live browser and take over anytime.",
    visual: (
      <div className="rounded-2xl bg-background/60 p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Needs your approval</div>
        <p className="mt-2 font-medium">Book Sonoran Tacos for Apr 18 — $320</p>
        <div className="mt-4 flex gap-2">
          <span className="rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground">Approve</span>
          <span className="rounded-full bg-secondary px-4 py-1.5 text-sm">Decline</span>
        </div>
      </div>
    ),
  },
];

function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return <div className={`max-w-[85%] rounded-3xl px-4 py-2.5 text-sm ${me ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"}`}>{children}</div>;
}
function Row({ icon, t, s }: { icon: React.ReactNode; t: string; s: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-background/60 p-3.5">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary">{icon}</span>
      <div><p className="text-sm font-medium">{t}</p><p className="text-xs text-muted-foreground">{s}</p></div>
    </div>
  );
}

export function StoryScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        const p = Math.min(0.999, Math.max(0, -r.top / total));
        setActive(Math.floor(p * STEPS.length));
      });
    };
    on(); window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);

  return (
    <section id="learn" ref={ref} style={{ height: `${STEPS.length * 75 + 25}svh` }} className="relative w-full">
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden px-5 md:px-20">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-6 md:grid-cols-2 md:gap-12">
          <div className="text-left">
            <div className="flex items-center justify-between md:block">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">How Civi works</p>
              <div className="flex gap-1.5 md:hidden">
                {STEPS.map((s, i) => <span key={s.k} className={`h-1 rounded-full transition-all duration-500 ${i === active ? "w-8 bg-primary" : "w-3 bg-secondary"}`} />)}
              </div>
            </div>
            <div className="relative mt-4 h-44 md:mt-6 md:h-56">
              {STEPS.map((s, i) => (
                <div key={s.k} aria-hidden={i !== active}
                  className={`absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${i === active ? "translate-y-0 opacity-100" : i < active ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0"}`}>
                  <p className="font-mono text-sm text-primary">{s.k}</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">{s.title}</h2>
                  <p className="mt-3 max-w-md text-base text-muted-foreground md:mt-4 md:text-lg">{s.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 hidden gap-2 md:flex">
              {STEPS.map((s, i) => <span key={s.k} className={`h-1 rounded-full transition-all duration-500 ${i === active ? "w-10 bg-primary" : "w-4 bg-secondary"}`} />)}
            </div>
          </div>
          <div className="relative h-[300px] md:h-[380px]">
            {STEPS.map((s, i) => (
              <div key={s.k} aria-hidden={i !== active}
                className={`absolute inset-0 rounded-[2rem] border border-border/60 bg-card/80 p-5 shadow-2xl backdrop-blur-xl transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] md:p-6 ${i === active ? "translate-y-0 scale-100 opacity-100" : i < active ? "-translate-y-8 scale-95 opacity-0" : "translate-y-10 scale-95 opacity-0"}`}>
                <div className="mb-4 flex items-center gap-1.5 md:mb-5">{[0, 1, 2].map((x) => <span key={x} className="h-2.5 w-2.5 rounded-full bg-secondary" />)}<span className="ml-3 text-xs text-muted-foreground">civi · live</span></div>
                {s.visual}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

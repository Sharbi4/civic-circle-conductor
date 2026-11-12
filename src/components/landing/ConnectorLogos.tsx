import { siFacebook, siInstagram, siX, siGmail, siGooglecalendar, siGoogledrive, siSquare, siElevenlabs } from "simple-icons";

// Official brand marks (Simple Icons). LinkedIn and Eventbrite are no longer shipped there, so their official paths are inlined.
const LOGOS = [
  { title: "Eventbrite", hex: "F05537", path: "M10.542 5.81c2.653-.6 5.3.487 6.775 2.54L5.591 11c.405-2.479 2.298-4.591 4.951-5.19zm6.84 9.746a6.47 6.47 0 0 1-3.919 2.634c-2.67.604-5.335-.501-6.804-2.582l11.763-2.657 1.915-.433L24 11.691a11.57 11.57 0 0 0-.305-2.333C22.205 3.04 15.76-.9 9.303.558 2.846 2.017-1.18 8.322.31 14.642c1.491 6.319 7.935 10.259 14.392 8.8 3.805-.86 6.765-3.402 8.25-6.638z" },
  { title: "LinkedIn", hex: "0A66C2", path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" },
  ...[siFacebook, siInstagram, siX, siGmail, siGooglecalendar, siGoogledrive, siSquare, siElevenlabs].map((i) => ({ title: i.title, hex: i.hex, path: i.path })),
];

export function ConnectorLogos({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Connects with</p>
      <ul className="mt-3 flex flex-wrap gap-2.5">
        {LOGOS.map((l) => (
          <li key={l.title} title={l.title} className="grid h-11 w-11 place-items-center rounded-xl bg-foreground shadow-md">
            <svg viewBox="0 0 24 24" role="img" aria-label={l.title} className="h-6 w-6" style={{ fill: `#${l.hex}` }}><path d={l.path} /></svg>
          </li>
        ))}
      </ul>
    </div>
  );
}

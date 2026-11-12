import { appTimeZone } from "./appTimeZone";

/** Rewrites ISO timestamps and 24-hour clock times in text into 12-hour times in the viewer's time zone. */
export function friendlyTimes(text: string, timeZone?: string): string {
  const tz = timeZone ?? appTimeZone();
  const iso = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
  let out = text.replace(iso, (m) => {
    const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(m);
    // A time with no offset is already the event's local clock time: show it as written, never shifted.
    const d = new Date(zoned ? m.replace(" ", "T") : `${m.replace(" ", "T")}Z`);
    if (isNaN(d.getTime())) return m;
    return d.toLocaleString("en-US", { timeZone: zoned ? tz : "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(zoned ? { timeZoneName: "short" } : {}) });
  });
  out = out.replace(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b(?!\s*(?:am|pm|AM|PM|a\.m\.|p\.m\.))/g, (_m, h: string, min: string) => {
    const hr = Number(h);
    return `${hr % 12 || 12}:${min} ${hr < 12 ? "AM" : "PM"}`;
  });
  return out;
}

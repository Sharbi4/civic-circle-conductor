/** Wall-clock times in an organization's own time zone. Pure; works the same in the browser and on the server. */
export const DEFAULT_TIME_ZONE = "America/Phoenix";

export function safeTimeZone(tz?: string | null): string {
  if (!tz) return DEFAULT_TIME_ZONE;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return DEFAULT_TIME_ZONE; }
}

/** How far the zone's wall clock is ahead of UTC at this instant, in ms. */
function offsetMs(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(at));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - Math.floor(at / 1000) * 1000;
}

/** The instant a wall clock in `tz` reads y-m-d hour:00 (month 1-based; day may overflow). */
export function zonedInstant(y: number, m: number, d: number, hour: number, tz: string): Date {
  const zone = safeTimeZone(tz);
  const guess = Date.UTC(y, m - 1, d, hour);
  let t = guess - offsetMs(zone, guess);
  t = guess - offsetMs(zone, t); // second pass settles daylight-saving edges
  return new Date(t);
}

/** "Thu, Nov 19" in the zone. */
export function shortDay(at: Date | number, tz: string): string {
  return new Date(at).toLocaleDateString("en-US", { timeZone: safeTimeZone(tz), weekday: "short", month: "short", day: "numeric" });
}
/** "Thu, Nov 19, 9:00 AM" in the zone. */
export function shortDayTime(at: Date | number, tz: string): string {
  return new Date(at).toLocaleString("en-US", { timeZone: safeTimeZone(tz), weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
/** Today's date (YYYY-MM-DD) in the zone. */
export function todayIn(tz: string, now = Date.now()): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: safeTimeZone(tz) });
}

/** The organization's time zone for every time the app shows; falls back to the device's. */
let orgZone: string | null = null;

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export function setAppTimeZone(tz: string | null | undefined) {
  orgZone = isValidTimeZone(tz) ? tz : null;
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function appTimeZone(): string {
  return orgZone ?? deviceTimeZone();
}

/** Short date + time in the organization's time zone, e.g. "Dec 9, 6:30 PM". */
export function formatAppTime(value: string | number | Date, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { ...opts, timeZone: appTimeZone() });
}

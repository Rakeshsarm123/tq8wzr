const UK = "Europe/London";
const DAY_MS = 86_400_000;

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: UK, weekday: "short", day: "numeric", month: "short" });
const shortDayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: UK, day: "numeric", month: "short" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: UK, day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit" });
const dateKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: UK, year: "numeric", month: "2-digit", day: "2-digit" });
const wholeNumber = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

// Date-only strings are anchored at noon UTC so no time zone can shift them onto another day.
const noonOf = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`);

export const formatDay = (isoDate: string) => dayFormat.format(noonOf(isoDate));
export const formatShortDay = (isoDate: string) => shortDayFormat.format(noonOf(isoDate));
export const formatDate = (isoDate: string) => dateFormat.format(noonOf(isoDate));
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
export const formatDayTime = (iso: string) => `${dayFormat.format(new Date(iso))}, ${formatTime(iso)}`;
export const formatNumber = (value: number) => wholeNumber.format(value);
export const formatMW = (value: number | null) => (value === null ? "–" : `${formatNumber(value)} MW`);
export const formatSignedMW = (value: number) => `${value > 0 ? "+" : ""}${formatMW(value)}`;
export const formatHours = (value: number) => oneDecimal.format(value);
export const formatPrecise = (value: number) => oneDecimal.format(value);
export const formatSignedPrecise = (value: number) => `${value > 0 ? "+" : ""}${formatPrecise(value)}`;

export const ukDate = (iso: string) => dateKeyFormat.format(new Date(iso));
export const addDays = (isoDate: string, days: number) =>
  new Date(noonOf(isoDate).getTime() + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (fromDate: string, toDate: string) =>
  Math.round((noonOf(toDate).getTime() - noonOf(fromDate).getTime()) / DAY_MS);
export const minutesBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours && `${hours} h`, (rest || !hours) && `${rest} min`].filter(Boolean).join(" ");
}

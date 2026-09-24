const jst = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_MS = 86_400_000;

/** 日本時間での今日（`YYYY-MM-DD`）。要件 4.2 の判定は JST で行う */
export const todayJst = (now: Date = new Date()): string => jst.format(now);

/** `today` から `expiresOn` までの日数。当日は 0、期限切れは負の値 */
export const daysUntil = (expiresOn: string, today: string): number =>
  (Date.parse(expiresOn) - Date.parse(today)) / DAY_MS;

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

/** 一覧の 1 行に収める短い期限日。今年なら `M/D`、それ以外は `YY/M/D` */
export const shortDate = (date: string, today: string): string => {
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  return date.slice(0, 4) === today.slice(0, 4) ? md : `${date.slice(2, 4)}/${md}`;
};

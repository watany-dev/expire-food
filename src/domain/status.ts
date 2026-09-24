export type Status = "expired" | "warn" | "normal";

/** 要件 4.2 の表示ルール。期限日 < 今日 は期限切れ、残り日数 < `warn_days` は期限間近 */
export const itemStatus = (daysLeft: number, warnDays: number): Status =>
  daysLeft < 0 ? "expired" : daysLeft < warnDays ? "warn" : "normal";

export const daysLeftLabel = (daysLeft: number): string =>
  daysLeft < 0 ? `${-daysLeft}日過ぎ` : daysLeft === 0 ? "今日まで" : `あと${daysLeft}日`;

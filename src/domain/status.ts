export type Status = "expired" | "warn" | "normal";

/** 要件 4.2 の表示ルール。期限日 < 今日 は期限切れ、残り日数 < `warn_days` は期限間近 */
export const itemStatus = (daysLeft: number, warnDays: number): Status =>
  daysLeft < 0 ? "expired" : daysLeft < warnDays ? "warn" : "normal";

export const daysLeftLabel = (daysLeft: number): string =>
  daysLeft < 0 ? `${-daysLeft}日過ぎ` : daysLeft === 0 ? "今日まで" : `あと${daysLeft}日`;

type Group<T> = { key: "expired" | "soon" | "later"; label: string; items: T[] };

/**
 * 一覧を期限切れ・もうすぐ・それ以降に分ける。空の区分は返さない。
 * 期限間近（黄色）が「それ以降」に入って畳まれないよう、もうすぐの範囲は `warn_days` まで広げる
 */
export const groupByDeadline = <T extends { days_left: number }>(
  items: T[],
  warnDays: number,
): Group<T>[] => {
  const soon = Math.max(14, warnDays - 1);
  const groups: Group<T>[] = [
    { key: "expired", label: "期限切れ", items: items.filter((i) => i.days_left < 0) },
    {
      key: "soon",
      label: `${soon}日以内`,
      items: items.filter((i) => i.days_left >= 0 && i.days_left <= soon),
    },
    { key: "later", label: "それ以降", items: items.filter((i) => i.days_left > soon) },
  ];
  return groups.filter((g) => g.items.length > 0);
};

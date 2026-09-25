import { z } from "zod";

// 無料プランの 1 日あたりの上限。どれもアカウント全体で数え、UTC 0 時にリセットされる
export const FREE_TIER = {
  requests: 100_000, // Workers
  neurons: 10_000, // Workers AI
  rowsRead: 5_000_000, // D1
  rowsWritten: 100_000, // D1
} as const;

type Metric = keyof typeof FREE_TIER;
type DailyUsage = { date: string } & Record<Metric, number>;

const WARN_RATIO = 0.8;

// D1 のデータセットだけ日付（Date）、ほかは日時（Time）で絞り込む
export const USAGE_QUERY = `query Usage($accountTag: string!, $since: Date!, $until: Date!, $sinceTime: Time!, $untilTime: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workers: workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: $sinceTime, datetime_leq: $untilTime }) {
        dimensions { date }
        sum { requests }
      }
      ai: aiInferenceAdaptiveGroups(limit: 100, filter: { datetime_geq: $sinceTime, datetime_leq: $untilTime }) {
        dimensions { date }
        sum { totalNeurons }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: 100, filter: { date_geq: $since, date_leq: $until }) {
        dimensions { date }
        sum { rowsRead rowsWritten }
      }
    }
  }
}`;

// 今日を含む直近 7 日（UTC）
export const usageWindow = (accountTag: string, now: Date) => {
  const dates = Array.from({ length: 7 }, (_, i) =>
    new Date(now.getTime() - (6 - i) * 86_400_000).toISOString().slice(0, 10),
  );
  const since = dates[0] as string;
  const until = dates[6] as string;
  return {
    dates,
    variables: {
      accountTag,
      since,
      until,
      sinceTime: `${since}T00:00:00Z`,
      untilTime: now.toISOString(),
    },
  };
};

const groups = <T extends z.ZodRawShape>(sum: T) =>
  z.array(z.object({ dimensions: z.object({ date: z.string() }), sum: z.object(sum) }));

const response = z.object({
  data: z.object({
    viewer: z.object({
      accounts: z.tuple([
        z.object({
          workers: groups({ requests: z.number() }),
          ai: groups({ totalNeurons: z.number() }),
          d1: groups({ rowsRead: z.number(), rowsWritten: z.number() }),
        }),
      ]),
    }),
  }),
});

const graphqlErrors = z.object({ errors: z.array(z.object({ message: z.string() })).min(1) });

export const parseUsage = (body: unknown, dates: string[]): DailyUsage[] => {
  const parsed = response.safeParse(body);
  if (!parsed.success) {
    const errors = graphqlErrors.safeParse(body);
    throw new Error(
      errors.success
        ? errors.data.errors.map((e) => e.message).join("\n")
        : "unexpected GraphQL response",
    );
  }
  const [{ workers, ai, d1 }] = parsed.data.data.viewer.accounts;
  const total = <S>(
    rows: { dimensions: { date: string }; sum: S }[],
    date: string,
    pick: (sum: S) => number,
  ) => rows.filter((row) => row.dimensions.date === date).reduce((n, row) => n + pick(row.sum), 0);
  return dates.map((date) => ({
    date,
    requests: total(workers, date, (s) => s.requests),
    neurons: total(ai, date, (s) => s.totalNeurons),
    rowsRead: total(d1, date, (s) => s.rowsRead),
    rowsWritten: total(d1, date, (s) => s.rowsWritten),
  }));
};

const METRICS = Object.keys(FREE_TIER) as Metric[];

const cell = (value: number, limit: number) => {
  const ratio = value / limit;
  const mark = ratio >= 1 ? " ✗" : ratio >= WARN_RATIO ? " !" : "";
  return `${value.toLocaleString("en-US")} (${Math.round(ratio * 100)}%)${mark}`;
};

export const formatUsage = (days: DailyUsage[]) => {
  const rows = [
    ["date (UTC)", ...METRICS],
    ["limit / day", ...METRICS.map((m) => FREE_TIER[m].toLocaleString("en-US"))],
    ...days.map((day) => [day.date, ...METRICS.map((m) => cell(day[m], FREE_TIER[m]))]),
  ];
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((row) => row[i]!.length)));
  return {
    text: rows
      .map((row) =>
        row
          .map((c, i) => c.padEnd(widths[i]!))
          .join("  ")
          .trimEnd(),
      )
      .join("\n"),
    warn: days.some((day) => METRICS.some((m) => day[m] >= FREE_TIER[m] * WARN_RATIO)),
  };
};

/**
 * レート制限のキーにする接続元（`cf-connecting-ip`）。IPv6 は /64 に丸める。
 * 1 回線に /64 が割り当てられ、その中でアドレスを変えれば別の枠になってしまうため
 */
export const clientKey = (ip: string | undefined): string => {
  if (ip === undefined || !ip.includes(":")) return `ip:${ip ?? ""}`;
  const [head = "", tail] = ip.split("::");
  const groups = head === "" ? [] : head.split(":");
  if (tail !== undefined) {
    const rest = tail === "" ? [] : tail.split(":");
    groups.push(...Array<string>(Math.max(8 - groups.length - rest.length, 0)).fill("0"), ...rest);
  }
  const prefix = groups.slice(0, 4).map((group) => Number.parseInt(group, 16).toString(16));
  return `ip:${prefix.join(":")}::/64`;
};

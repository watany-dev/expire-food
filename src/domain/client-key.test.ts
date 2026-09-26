import { describe, expect, it } from "vite-plus/test";

import { clientKey } from "./client-key";

describe("clientKey", () => {
  it.each([
    [undefined, "ip:"],
    ["203.0.113.1", "ip:203.0.113.1"],
    ["2001:db8:1:2:3:4:5:6", "ip:2001:db8:1:2::/64"],
    ["2001:0DB8:0001:0002:ffff::1", "ip:2001:db8:1:2::/64"],
    ["2001:db8::1", "ip:2001:db8:0:0::/64"],
    ["2001:db8:1::", "ip:2001:db8:1:0::/64"],
    ["::1", "ip:0:0:0:0::/64"],
    ["::", "ip:0:0:0:0::/64"],
  ])("%s → %s", (ip, key) => {
    expect(clientKey(ip)).toBe(key);
  });

  it("同じ /64 の中のアドレスは同じキーになる", () => {
    expect(clientKey("2001:db8:1:2::a")).toBe(clientKey("2001:db8:1:2:dead:beef:0:1"));
    expect(clientKey("2001:db8:1:2::a")).not.toBe(clientKey("2001:db8:1:3::a"));
  });
});

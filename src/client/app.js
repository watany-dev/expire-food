// 全画面で読み込む。JS が無くても画面は使える（ADR 0004）

// オフライン時の案内だけを出す Service Worker。登録できなくても通常どおり使える
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

// 追加・編集画面では /extract.js と同じグローバルに宣言されるので、名前を重ねない
const shareUrl = document.getElementById("share-url");
const copy = document.getElementById("share-copy");
if (copy && navigator.clipboard) {
  const status = document.getElementById("share-status");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrl.value);
      status.textContent = "コピーしました。";
    } catch {
      status.textContent = "コピーできませんでした。URL を長押ししてコピーしてください。";
    }
  });
  copy.hidden = false;
}

const shareSend = document.getElementById("share-send");
if (shareSend && navigator.share) {
  shareSend.addEventListener("click", () => {
    // 共有シートを閉じたときも reject されるので、何もしない
    navigator.share({ url: shareUrl.value }).catch(() => {});
  });
  shareSend.hidden = false;
}

// 期限日のチップ。日付は JST で数える（要件 4.2）
const dateChips = document.getElementById("date-chips");
if (dateChips) {
  const expiresOn = document.getElementById("expires_on");
  dateChips.addEventListener("click", (event) => {
    const offset = event.target.closest("button")?.dataset.offset;
    if (!offset) return;
    // JST の今日の 0 時を UTC の Date として持ち、getUTC* / setUTC* だけで数える
    const date = new Date(new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10));
    if (offset.endsWith("m")) {
      const day = date.getUTCDate();
      date.setUTCMonth(date.getUTCMonth() + Number.parseInt(offset), 1);
      // 1/31 の 1 か月後は 2 月末にする（3 月にはみ出さない）
      const last = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      date.setUTCDate(Math.min(day, last));
    } else {
      date.setUTCDate(date.getUTCDate() + Number(offset));
    }
    expiresOn.value = date.toISOString().slice(0, 10);
  });
  dateChips.hidden = false;
}

// 実ユーザーの Core Web Vitals を、画面を離れるときに 1 回だけ送る（ADR 0006）
const vitals = { path: location.pathname };
const observe = (type, onEntry, options) => {
  if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return false;
  new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({
    type,
    buffered: true,
    ...options,
  });
  return true;
};
observe("largest-contentful-paint", (entry) => {
  vitals.lcp = Math.round(entry.startTime);
});
// 1 秒以内に続き、5 秒以内に収まるずれを 1 つの塊とし、その合計の最大
let shift;
const onShift = (entry) => {
  if (entry.hadRecentInput) return;
  if (!shift || entry.startTime - shift.last > 1000 || entry.startTime - shift.first > 5000) {
    shift = { sum: 0, first: entry.startTime, last: entry.startTime };
  }
  shift.sum += entry.value;
  shift.last = entry.startTime;
  vitals.cls = Math.max(vitals.cls, Math.round(shift.sum * 10000) / 10000);
};
// ずれが一度も無ければ 0 を送る（エントリは非同期に届くので、先に 0 を入れても上書きされない）
if (observe("layout-shift", onShift)) vitals.cls = 0;
// 1 画面あたりの操作が少ないので、98 パーセンタイルではなく最も遅い操作を INP とする
const onInteraction = (entry) => {
  if (entry.interactionId) vitals.inp = Math.max(vitals.inp ?? 0, Math.round(entry.duration));
};
observe("event", onInteraction, { durationThreshold: 16 });
let sent = false;
addEventListener("visibilitychange", () => {
  if (sent || document.visibilityState !== "hidden") return;
  sent = true;
  navigator.sendBeacon("/api/vitals", JSON.stringify(vitals));
});

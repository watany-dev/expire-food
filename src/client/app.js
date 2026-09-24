// 全画面で読み込む。JS が無くても画面は使える（ADR 0004）

// オフライン時の案内だけを出す Service Worker。登録できなくても通常どおり使える
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

const copy = document.getElementById("share-copy");
if (copy && navigator.clipboard) {
  const url = document.getElementById("share-url");
  const status = document.getElementById("share-status");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url.value);
      status.textContent = "コピーしました。";
    } catch {
      status.textContent = "コピーできませんでした。URL を長押ししてコピーしてください。";
    }
  });
  copy.hidden = false;
}

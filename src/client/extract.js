// 追加・編集フォームの「写真から読み取る」。JS が無くてもフォームは手入力で使える（ADR 0003）
// 期限が決まらなければ、期限の部分だけを囲んで再読するか撮り直す（ADR 0007）
const MAX_BYTES = 2 * 1024 * 1024;
const LONG_SIDE = 800;

const photo = document.getElementById("photo");
const input = document.getElementById("photo-input");
const status = document.getElementById("photo-status");
const crop = document.getElementById("crop");
const canvas = document.getElementById("crop-canvas");
const cropRead = document.getElementById("crop-read");
const nameCandidates = document.getElementById("name-candidates");
const thumb = document.getElementById("photo-thumb");
const THUMB_SIDE = 96;

// 部分再読は縮小前の写真から切り出す（小さな印字を潰さない）
let bitmap = null;
let area = null;

const toJpeg = (source, sx, sy, sw, sh) => {
  const scale = Math.min(1, LONG_SIDE / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  out.getContext("2d").drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return new Promise((resolve) => out.toBlob(resolve, "image/jpeg", 0.8));
};

const send = async (image, part) => {
  if (!image || image.size > MAX_BYTES)
    return { message: "画像が大きすぎます。手入力してください。" };
  const body = new FormData();
  body.append("image", image, "photo.jpg");
  body.append("part", part);
  const res = await fetch("/api/extract", { method: "POST", body });
  if (res.status === 429) {
    return { message: "読み取りの回数が多すぎます。少し待つか、手入力してください。" };
  }
  if (!res.ok) return { message: "読み取れませんでした。手入力してください。" };
  return { result: await res.json() };
};

const drawCrop = () => {
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (!area) return;
  ctx.lineWidth = Math.max(2, canvas.width / 200);
  ctx.strokeStyle = "#d00";
  ctx.strokeRect(area.x, area.y, area.w, area.h);
};

const closeCrop = () => {
  crop.hidden = true;
  area = null;
  bitmap?.close();
  bitmap = null;
};

const openCrop = () => {
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  area = null;
  cropRead.disabled = true;
  drawCrop();
  crop.hidden = false;
};

const fill = (result, part) => {
  if (part === "all" && result.name) document.getElementById("name").value = result.name;
  if (result.expires_on) document.getElementById("expires_on").value = result.expires_on;
  // 種別が読めなければ選択を変えずに確認を促す（追加フォームの初期値は賞味期限。要件 8.1）
  if (result.kind) input.form.elements.kind.value = result.kind;
  if (part === "all") {
    nameCandidates.replaceChildren(
      ...result.name_candidates.map((name) =>
        Object.assign(document.createElement("option"), { value: name }),
      ),
    );
  }
  if (result.next === "retake") {
    return "期限がはっきり写っていません。期限の部分に近づき、ピントを合わせて撮り直すか、手入力してください。";
  }
  if (result.next === "reread") {
    openCrop();
    return "期限が読み取れませんでした。写真の期限の部分を指でなぞって囲み、「囲んだ部分を読み取る」を押してください。";
  }
  const notes = [];
  // 部分再読のあとも、まだ空なら商品名を促す
  if (!document.getElementById("name").value) {
    notes.push(
      nameCandidates.options.length > 0
        ? "商品名を候補から選ぶか入力してください。"
        : "商品名を入力してください。",
    );
  }
  if (!result.expires_on) {
    notes.push(`期限を次から選んで入力してください: ${result.date_candidates.join(" / ")}。`);
  }
  if (!result.kind) notes.push("種別（賞味期限／消費期限）を確認してください。");
  if (result.expires_on && result.confidence !== "high")
    notes.push("期限が正しいか確認してください。");
  return notes.length > 0 ? notes.join("") : "読み取りました。内容を確認して保存してください。";
};

const read = async (image, part) => {
  const { message, result } = await send(image, part);
  if (message) return message;
  if (result.next !== "reread") closeCrop();
  return fill(result, part);
};

const showThumb = () => {
  const scale = Math.min(
    1,
    (THUMB_SIDE * devicePixelRatio) / Math.max(bitmap.width, bitmap.height),
  );
  thumb.width = Math.round(bitmap.width * scale);
  thumb.height = Math.round(bitmap.height * scale);
  thumb.getContext("2d").drawImage(bitmap, 0, 0, thumb.width, thumb.height);
  thumb.hidden = false;
};

const busy = async (task) => {
  input.disabled = true;
  cropRead.disabled = true;
  photo.classList.add("busy");
  status.textContent = "読み取り中…";
  try {
    status.textContent = await task();
  } catch {
    closeCrop();
    status.textContent = "読み取れませんでした。手入力してください。";
  } finally {
    input.disabled = false;
    cropRead.disabled = !area;
    photo.classList.remove("busy");
    thumb.hidden = true;
    // 縮小画像も写真なので、読み終えたら消す
    thumb.width = 0;
  }
};

input.addEventListener("change", () => {
  const file = input.files[0];
  if (!file) return;
  input.value = "";
  closeCrop();
  return busy(async () => {
    bitmap = await createImageBitmap(file);
    showThumb();
    return read(await toJpeg(bitmap, 0, 0, bitmap.width, bitmap.height), "all");
  });
});

// 指でなぞった範囲（キャンバス上の座標）
let start = null;
const point = (event) => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * canvas.width) / rect.width,
    y: ((event.clientY - rect.top) * canvas.height) / rect.height,
  };
};
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  start = point(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (!start) return;
  const p = point(event);
  area = {
    x: Math.min(start.x, p.x),
    y: Math.min(start.y, p.y),
    w: Math.abs(p.x - start.x),
    h: Math.abs(p.y - start.y),
  };
  drawCrop();
});
canvas.addEventListener("pointerup", () => {
  start = null;
  // 指が触れただけの小さな囲みは無視する（画面上で 8px 未満）
  const px = canvas.getBoundingClientRect().width / canvas.width;
  if (area && (area.w * px < 8 || area.h * px < 8)) area = null;
  cropRead.disabled = !area;
  drawCrop();
});

cropRead.addEventListener("click", () =>
  busy(async () => {
    const ratio = bitmap.width / canvas.width;
    // 囲みが印字の端にかかっても読めるよう少し広げる
    const pad = Math.max(area.w, area.h) * 0.1;
    const sx = Math.max(0, (area.x - pad) * ratio);
    const sy = Math.max(0, (area.y - pad) * ratio);
    const sw = Math.min(bitmap.width - sx, (area.w + pad * 2) * ratio);
    const sh = Math.min(bitmap.height - sy, (area.h + pad * 2) * ratio);
    return read(await toJpeg(bitmap, sx, sy, sw, sh), "date");
  }),
);
document.getElementById("crop-cancel").addEventListener("click", () => {
  closeCrop();
  status.textContent = "期限を手入力してください。";
});

photo.hidden = false;

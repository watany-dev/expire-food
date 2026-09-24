// 追加・編集フォームの「写真から読み取る」。JS が無くてもフォームは手入力で使える（ADR 0003）
const MAX_BYTES = 2 * 1024 * 1024;
const LONG_SIDE = 800;

const photo = document.getElementById("photo");
const input = document.getElementById("photo-input");
const status = document.getElementById("photo-status");

const resize = async (file) => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
};

const fill = (result) => {
  if (result.name) document.getElementById("name").value = result.name;
  if (result.expires_on) document.getElementById("expires_on").value = result.expires_on;
  // 種別が読めなければ選択を変えずに確認を促す（追加フォームの初期値は賞味期限。要件 8.1）
  if (result.kind) input.form.elements.kind.value = result.kind;
  const notes = [];
  if (!result.name || !result.expires_on) notes.push("読み取れなかった項目を入力してください。");
  if (!result.kind) notes.push("種別（賞味期限／消費期限）を確認してください。");
  if (result.confidence === "low") notes.push("読み取り結果が不確かです。内容を確認してください。");
  return notes.length > 0 ? notes.join("") : "読み取りました。内容を確認して保存してください。";
};

const read = async (file) => {
  const image = await resize(file);
  if (!image || image.size > MAX_BYTES) return "画像が大きすぎます。手入力してください。";
  const body = new FormData();
  body.append("image", image, "photo.jpg");
  const res = await fetch("/api/extract", { method: "POST", body });
  if (res.status === 429) return "読み取りの回数が多すぎます。少し待つか、手入力してください。";
  if (!res.ok) return "読み取れませんでした。手入力してください。";
  return fill(await res.json());
};

input.addEventListener("change", async () => {
  const file = input.files[0];
  if (!file) return;
  input.disabled = true;
  status.textContent = "読み取り中…";
  try {
    status.textContent = await read(file);
  } catch {
    status.textContent = "読み取れませんでした。手入力してください。";
  } finally {
    input.disabled = false;
    input.value = "";
  }
});

photo.hidden = false;

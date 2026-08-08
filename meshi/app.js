/**
 * スクショ飯 — 本体
 *
 * 考え方は1つだけ。「スクショはもう撮ってある」。
 * だから入力させない。取り込んで並べて、行ったら1タップで落とす。
 *
 * 取り込みは2つの入口がある。
 *   1. 共有シート → Service Worker が inbox に置く → 起動時にここが引き取る（Android）
 *   2. 「スクショを取り込む」→ 写真から複数選択（iPhone も含めてどの端末でも）
 * どちらも中身のハッシュで重複を弾くので、写真を全部選び直しても増えない。
 * 「新しく撮ったぶんだけ足す」が何度でも同じ手順でできる。
 */

const VERSION = "2026-08-08b 食べログ修正版";   // 設定に出す。更新が届いているかを目で確かめるため
const THUMB_MAX = 640;   // 一覧用に縮める長辺(px)
const DB = self.MeshiDB;

/* ---------------- 画面の状態 ---------------- */

const state = {
  tab: "want",       // want | been
  q: "",
  tags: new Set(),   // 絞り込み中のタグ
  places: [],
  shots: new Map(),  // placeId -> [shot]
  openId: null,
};

const urls = new Map();  // 画像の objectURL を使い回す
const $ = (id) => document.getElementById(id);

const el = {
  grid: $("grid"), empty: $("empty"), tagbar: $("tagbar"), toast: $("toast"),
  tabWant: $("tabWant"), tabBeen: $("tabBeen"), countWant: $("countWant"), countBeen: $("countBeen"),
  search: $("search"), searchWrap: $("searchWrap"), searchBtn: $("searchBtn"),
  picker: $("picker"), pickerMore: $("pickerMore"), addBtn: $("addBtn"),
  detail: $("detail"), settings: $("settings"),
};

/* ---------------- 小物 ---------------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function fmtDate(v) {
  if (!v) return "";
  const d = typeof v === "number" ? new Date(v) : new Date(`${v}T00:00:00`);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

let toastTimer = null;
function toast(msg, action) {
  clearTimeout(toastTimer);
  el.toast.innerHTML = esc(msg);
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = action.label;
    b.style.cssText = "margin-left:12px;background:none;border:none;color:#f0a63c;font-weight:700;cursor:pointer";
    b.addEventListener("click", () => { el.toast.hidden = true; action.run(); });
    el.toast.appendChild(b);
  }
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, action ? 6000 : 2600);
}

/* ---------------- 取り込み ---------------- */

/** 同じ画像を二度入れないための指紋。https なら SHA-256、それ以外は中身を間引いた簡易ハッシュ */
async function fingerprint(buf) {
  if (self.crypto && crypto.subtle && crypto.subtle.digest) {
    try {
      const h = await crypto.subtle.digest("SHA-256", buf);
      return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (_) { /* 落ちたら下の簡易版へ */ }
  }
  const v = new Uint8Array(buf);
  const step = Math.max(1, Math.floor(v.length / 4096));
  let h = 2166136261;
  for (let i = 0; i < v.length; i += step) { h ^= v[i]; h = Math.imul(h, 16777619); }
  return `x${(h >>> 0).toString(16)}-${v.length}`;
}

async function loadBitmap(blob) {
  if (self.createImageBitmap) {
    try { return await createImageBitmap(blob); } catch (_) { /* HEIC など。<img> で試す */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("decode failed"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** 一覧用の軽い画像を作る。元画像そのままを何十枚も並べると端末が固まるため */
async function makeThumb(blob) {
  const bmp = await loadBitmap(blob);
  const w0 = bmp.width || bmp.naturalWidth;
  const h0 = bmp.height || bmp.naturalHeight;
  const scale = Math.min(1, THUMB_MAX / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();

  const out = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.72));
  return { thumb: out ? await out.arrayBuffer() : null, w: w0, h: h0 };
}

/**
 * 画像を取り込む。placeId を渡すとその店にスクショを足す。渡さなければ1枚1軒で作る。
 * 戻り値は { added, dup, failed }。
 */
async function importImages(files, placeId) {
  const list = [...files].filter((f) => f && f.size && (!f.type || f.type.startsWith("image/")));
  let added = 0, dup = 0, failed = 0;
  const ids = [];   // 新しくできた店。あとで店名を読み取る

  for (const file of list) {
    try {
      const buf = await file.arrayBuffer();
      const hash = await fingerprint(buf);
      if (await DB.getBy("shots", "hash", hash)) { dup++; continue; }

      let thumb = null, w = 0, h = 0;
      try { ({ thumb, w, h } = await makeThumb(file)); } catch (_) { /* 読めなくても元画像は残す */ }

      const takenAt = file.lastModified || Date.now();
      let pid = placeId;
      if (!pid) {
        pid = uid();
        await DB.put("places", {
          id: pid, status: "want", name: "", memo: "", tags: [], url: "",
          rating: 0, visitedAt: "", createdAt: takenAt, addedAt: Date.now(),
        });
        ids.push(pid);
      }

      const shot = { id: uid(), placeId: pid, hash, type: file.type || "image/jpeg", w, h, takenAt, thumb };
      await DB.put("shots", shot);
      await DB.put("blobs", { id: shot.id, type: shot.type, data: buf });
      added++;
    } catch (err) {
      console.warn("取り込めなかった", err);
      failed++;
    }
  }
  return { added, dup, failed, ids };
}

/** 共有された文字・URL から1軒つくる（画像なしのストック） */
async function importLink({ title, text, url }) {
  const body = [title, text, url].filter(Boolean).join("\n");
  const found = body.match(/https?:\/\/\S+/);
  const link = url || (found && found[0]) || "";
  let name = (title || "").trim();
  if (!name) {
    name = body.split("\n").map((s) => s.trim()).filter((s) => s && !/^https?:\/\//.test(s))[0] || "";
  }
  if (!name && !link) return false;

  await DB.put("places", {
    id: uid(), status: "want", name: name.slice(0, 120), memo: link && name ? "" : "",
    tags: [], url: link, rating: 0, visitedAt: "", createdAt: Date.now(), addedAt: Date.now(),
  });
  return true;
}

/** 共有シートから Service Worker が置いていったものを引き取る */
async function drainInbox() {
  let items = [];
  try { items = await DB.all("inbox"); } catch (_) { return; }
  if (!items.length) return;

  const files = [];
  let links = 0;
  for (const it of items) {
    if (it.kind === "file" && it.blob) files.push(it.blob);
    else if (it.kind === "text" && (await importLink(it))) links++;
  }
  const res = files.length ? await importImages(files) : { added: 0, dup: 0, failed: 0, ids: [] };
  await DB.del("inbox", ...items.map((i) => i.id));

  await load();
  const added = res.added + links;
  if (added) toast(`${added}件ストックしました`);
  else if (res.dup) toast("もうストックしてあります");
  queueOCR(res.ids || []);
}

/* ---------------- スクショから店名を読む ---------------- */

/**
 * 取り込みのあと、名前が空の店を順に読み取って埋めていく。
 * 取り込み自体は止めない（十数枚まとめて入れたときに待たせないため）。
 * 1枚ずつ処理して、読めたそばから画面に出す。
 */
const ocrQueue = [];
let ocrRunning = false;

const ocrEnabled = () => localStorage.getItem("meshi-ocr") !== "off";

/**
 * 起動時に、名前が空のまま残っている店を拾って読む。
 * 読み取りを入れる前に取り込んだぶんは、これがないと永久に空のままになる。
 * 一度に抱えすぎないよう上限を置き、残りは次回の起動か設定のボタンで進める。
 */
function queueLeftovers() {
  if (!ocrEnabled()) return;
  const left = state.places
    .filter((p) => !p.name && !p.ocrDone && shotsOf(p.id).length)
    .slice(0, 30)
    .map((p) => p.id);
  if (left.length) queueOCR(left);
}

function queueOCR(placeIds) {
  if (!ocrEnabled()) return;
  for (const id of placeIds) if (!ocrQueue.includes(id)) ocrQueue.push(id);
  runOCR();
}

async function runOCR() {
  if (ocrRunning || !ocrQueue.length) return;
  ocrRunning = true;
  const total = ocrQueue.length;
  let done = 0, filled = 0;

  while (ocrQueue.length) {
    const id = ocrQueue.shift();
    done++;
    const place = state.places.find((p) => p.id === id);
    if (!place || place.name || place.ocrDone) continue;

    const shot = shotsOf(id)[0];
    if (!shot) continue;

    if (total > 1) toast(`店名を読み取り中… ${done}/${total}`);

    try {
      const rec = shot.fullData ? { data: shot.fullData, type: shot.type } : await DB.get("blobs", shot.id);
      if (!rec) continue;
      const found = await MeshiOCR.read(new Blob([rec.data], { type: rec.type || shot.type || "image/jpeg" }));

      place.ocrDone = true;   // 二度読まない。読めなかった場合も含めて1回だけ
      if (found && found.name) {
        place.name = found.name;
        place.nameFromShot = true;   // 自動で入れた印。手で直されたら消える
        filled++;
      }
      if (found && found.area && !(place.tags || []).includes(found.area)) {
        place.tags = [...(place.tags || []), found.area].slice(0, 8);
      }
      await DB.put("places", place);
      render();
      if (state.openId === id) fillDetail(place);
    } catch (e) {
      // 読み取り機を読み込めないなど。以降の待ち行列ごとあきらめる
      ocrQueue.length = 0;
      toast("店名の読み取りが使えませんでした。手で入れてください");
      break;
    }
  }

  ocrRunning = false;
  if (filled) toast(`${filled}件の店名を読み取りました。違っていたら直してください`);
}

/* ---------------- 読み込みと並べ替え ---------------- */

async function load() {
  const [places, shots] = await Promise.all([DB.all("places"), DB.all("shots")]);
  state.places = places;
  state.shots = new Map();
  for (const s of shots) {
    if (!state.shots.has(s.placeId)) state.shots.set(s.placeId, []);
    state.shots.get(s.placeId).push(s);
  }
  for (const arr of state.shots.values()) arr.sort((a, b) => a.takenAt - b.takenAt);
  render();
}

function shotsOf(id) { return state.shots.get(id) || []; }

function matches(p) {
  if (state.tags.size && ![...state.tags].every((t) => (p.tags || []).includes(t))) return false;
  if (!state.q) return true;
  const q = state.q.toLowerCase();
  return [p.name, p.memo, p.url, (p.tags || []).join(" ")].join("\n").toLowerCase().includes(q);
}

function visible() {
  return state.places
    .filter((p) => p.status === state.tab && matches(p))
    .sort((a, b) => (state.tab === "been"
      ? (b.visitedAt || "").localeCompare(a.visitedAt || "") || b.createdAt - a.createdAt
      : b.createdAt - a.createdAt));
}

/* ---------------- 描画 ---------------- */

function shotURL(shot, want) {
  const useFull = want === "full" || !shot.thumb;
  const key = `${shot.id}:${useFull ? "full" : "thumb"}`;
  if (!urls.has(key)) {
    const bytes = useFull ? shot.fullData : shot.thumb;
    if (!bytes) return "";
    urls.set(key, URL.createObjectURL(new Blob([bytes], { type: useFull ? (shot.type || "image/jpeg") : "image/jpeg" })));
  }
  return urls.get(key);
}

function render() {
  const want = state.places.filter((p) => p.status === "want").length;
  const been = state.places.filter((p) => p.status === "been").length;
  el.countWant.textContent = want;
  el.countBeen.textContent = been;

  renderTagbar();

  const items = visible();
  const frag = document.createDocumentFragment();

  for (const p of items) {
    const shots = shotsOf(p.id);
    const card = document.createElement("article");
    card.className = `card${p.status === "been" ? " been" : ""}`;

    const open = document.createElement("button");
    open.type = "button";
    open.className = "open";
    open.addEventListener("click", () => openDetail(p.id));

    if (shots[0] && (shots[0].thumb || shots[0].fullData)) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = p.name || "スクショ";
      img.src = shotURL(shots[0]);
      open.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "noshot";
      ph.textContent = p.url ? "🔗" : "🍽";
      open.appendChild(ph);
    }

    const sub = p.status === "been"
      ? `${fmtDate(p.visitedAt) || "行った"}${shots.length > 1 ? ` ・ ${shots.length}枚` : ""}`
      : `${fmtDate(p.createdAt)}${shots.length > 1 ? ` ・ ${shots.length}枚` : ""}`;

    open.insertAdjacentHTML("beforeend", `
      <div class="meta">
        <div class="name${p.name ? (p.nameFromShot ? " guessed" : "") : " unnamed"}">${esc(p.name || "名前をつける")}</div>
        ${p.status === "been" && p.rating ? `<div class="stars-mini">${"★".repeat(p.rating)}${"☆".repeat(5 - p.rating)}</div>` : ""}
        <div class="sub">${esc(sub)}${(p.tags || []).length ? ` ・ ${esc(p.tags.join(" "))}` : ""}</div>
      </div>`);

    const check = document.createElement("button");
    check.type = "button";
    check.className = "check";
    check.textContent = p.status === "been" ? "↩" : "✓";
    check.setAttribute("aria-label", p.status === "been" ? "行きたいに戻す" : "行った");
    check.addEventListener("click", (e) => { e.stopPropagation(); toggleStatus(p.id, true); });

    card.append(open, check);
    frag.appendChild(card);
  }

  el.grid.replaceChildren(frag);

  const filtering = state.q || state.tags.size;
  el.empty.hidden = items.length > 0;
  if (!items.length) {
    el.empty.innerHTML = filtering
      ? "見つかりませんでした。"
      : state.tab === "want"
        ? "ここに<b>行きたい店</b>が貯まります。<br />気になる店を見つけたら<b>スクショを1枚</b>撮っておいて、下のボタンから読み込んでください。<br />同じスクショは何度選んでも重複しません。"
        : "まだ1軒もチェックしていません。<br />「行きたい」の写真の<b>✓</b>を押すと、<br />行った記録としてこちらに移ります。";
  }
}

function renderTagbar() {
  const counts = new Map();
  for (const p of state.places) {
    if (p.status !== state.tab) continue;
    for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24);
  el.tagbar.hidden = tags.length === 0;
  if (!tags.length) { state.tags.clear(); return; }

  el.tagbar.replaceChildren(...tags.map(([t, n]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip${state.tags.has(t) ? " is-on" : ""}`;
    b.textContent = `${t} ${n}`;
    b.addEventListener("click", () => {
      state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t);
      render();
    });
    return b;
  }));
}

/* ---------------- 行った／行きたい ---------------- */

async function toggleStatus(id, withUndo) {
  const p = state.places.find((x) => x.id === id);
  if (!p) return;
  const before = { status: p.status, visitedAt: p.visitedAt };

  if (p.status === "want") {
    p.status = "been";
    if (!p.visitedAt) p.visitedAt = todayISO();
  } else {
    p.status = "want";
  }
  await DB.put("places", p);
  render();
  if (state.openId === id) fillDetail(p);

  if (withUndo) {
    toast(before.status === "want" ? "「行った」に移しました" : "「行きたい」に戻しました", {
      label: "取り消す",
      run: async () => {
        Object.assign(p, before);
        await DB.put("places", p);
        render();
        if (state.openId === id) fillDetail(p);
      },
    });
  }
}

/* ---------------- 詳細 ---------------- */

let saveTimer = null;

function openDetail(id) {
  const p = state.places.find((x) => x.id === id);
  if (!p) return;
  state.openId = id;
  fillDetail(p);
  el.detail.hidden = false;
  document.body.style.overflow = "hidden";
  loadFullShots(p.id);
}

function closeDetail() {
  if (state.openId) saveDetail();   // 開いたまま閉じても入力は残す
  hideDetail();
}

/** 保存せずに閉じる。削除のあとに保存すると、消したはずの店が書き戻されてしまう */
function hideDetail() {
  clearTimeout(saveTimer);
  state.openId = null;
  el.detail.hidden = true;
  document.body.style.overflow = "";
}

/** 詳細では元画像を見せたいので、開いたときだけ重い方を読み込む */
async function loadFullShots(placeId) {
  const shots = shotsOf(placeId);
  for (const s of shots) {
    if (s.fullData) continue;
    const rec = await DB.get("blobs", s.id);
    if (rec) s.fullData = rec.data;
  }
  if (state.openId === placeId) renderShots(placeId);
}

function renderShots(placeId) {
  const box = $("detailShots");
  const shots = shotsOf(placeId);
  box.replaceChildren(...shots.map((s) => {
    const img = document.createElement("img");
    img.src = shotURL(s, "full");
    img.alt = "スクショ";
    img.decoding = "async";
    return img;
  }));
  box.hidden = shots.length === 0;
}

function fillDetail(p) {
  $("fName").value = p.name || "";
  $("fTags").value = (p.tags || []).join(" ");
  $("fMemo").value = p.memo || "";
  $("fUrl").value = p.url || "";
  $("fVisited").value = p.visitedAt || "";
  $("detailStatus").textContent = p.status === "been" ? "行った店" : "行きたい店";
  $("visitedFields").hidden = p.status !== "been";
  $("detailLink").hidden = !p.url;

  const toggle = $("detailToggle");
  toggle.textContent = p.status === "been" ? "↩ 行きたいに戻す" : "✓ 行った";
  toggle.classList.toggle("back", p.status === "been");

  const stars = $("fStars");
  stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = n <= (p.rating || 0) ? "on" : "";
    b.textContent = n <= (p.rating || 0) ? "★" : "☆";
    b.setAttribute("aria-label", `${n}点`);
    b.addEventListener("click", async () => {
      p.rating = p.rating === n ? 0 : n;   // 同じ星をもう一度押すと取り消し
      await DB.put("places", p);
      fillDetail(p);
      render();
    });
    return b;
  }));

  renderShots(p.id);
}

async function saveDetail() {
  const p = state.places.find((x) => x.id === state.openId);
  if (!p) return;
  const typed = $("fName").value.trim();
  if (typed !== p.name) p.nameFromShot = false;   // 手で直したら自動の印を外す
  p.name = typed;
  p.tags = $("fTags").value.split(/[\s,、]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8);
  p.memo = $("fMemo").value.trim();
  p.url = $("fUrl").value.trim();
  p.visitedAt = $("fVisited").value;
  await DB.put("places", p);
  render();
  $("detailLink").hidden = !p.url;
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDetail, 400);
}

async function deletePlace(id) {
  const p = state.places.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`「${p.name || "この店"}」を削除します。スクショも一緒に消えます。`)) return;
  const shots = shotsOf(id);
  if (shots.length) {
    await DB.del("shots", ...shots.map((s) => s.id));
    await DB.del("blobs", ...shots.map((s) => s.id));
  }
  await DB.del("places", id);
  for (const s of shots) {
    for (const k of [`${s.id}:thumb`, `${s.id}:full`]) {
      if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); }
    }
  }
  hideDetail();
  await load();
  toast("削除しました");
}

/* ---------------- バックアップ ---------------- */

function b64(buf) {
  const v = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < v.length; i += 0x8000) s += String.fromCharCode.apply(null, v.subarray(i, i + 0x8000));
  return btoa(s);
}

function unb64(str) {
  const bin = atob(str);
  const v = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i);
  return v.buffer;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function exportData(withImages) {
  toast("書き出しています…");
  const places = await DB.all("places");
  const shots = await DB.all("shots");
  const out = { app: "sukusho-meshi", version: 1, exportedAt: new Date().toISOString(), withImages, places, shots: [] };

  for (const s of shots) {
    const rec = { id: s.id, placeId: s.placeId, hash: s.hash, type: s.type, w: s.w, h: s.h, takenAt: s.takenAt };
    if (withImages) {
      if (s.thumb) rec.thumb = b64(s.thumb);
      const full = await DB.get("blobs", s.id);
      if (full) rec.full = b64(full.data);
    }
    out.shots.push(rec);
  }
  download(`sukusho-meshi-${todayISO().replace(/-/g, "")}.json`, JSON.stringify(out));
  toast(`${places.length}軒を書き出しました`);
}

async function importData(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (_) { toast("読み込めないファイルです"); return; }
  if (!data || data.app !== "sukusho-meshi") { toast("スクショ飯の書き出しではないようです"); return; }

  const have = new Set((await DB.all("places")).map((p) => p.id));
  let places = 0, shots = 0;

  for (const p of data.places || []) {
    if (have.has(p.id)) continue;
    await DB.put("places", p);
    places++;
  }
  for (const s of data.shots || []) {
    if (!s.hash || await DB.getBy("shots", "hash", s.hash)) continue;
    const shot = { id: s.id, placeId: s.placeId, hash: s.hash, type: s.type, w: s.w, h: s.h, takenAt: s.takenAt,
                   thumb: s.thumb ? unb64(s.thumb) : null };
    await DB.put("shots", shot);
    if (s.full) await DB.put("blobs", { id: s.id, type: s.type, data: unb64(s.full) });
    shots++;
  }
  await load();
  toast(`${places}軒 / スクショ${shots}枚を読み込みました`);
}

async function showUsage() {
  const shots = (await DB.all("shots")).length;
  let size = "";
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const { usage } = await navigator.storage.estimate();
      if (usage) size = ` ・ 約${(usage / 1024 / 1024).toFixed(usage > 100 * 1024 * 1024 ? 0 : 1)}MB`;
    } catch (_) { /* 出せない端末はそのまま */ }
  }
  const ocrReady = typeof self.MeshiOCR !== "undefined";
  $("version").innerHTML = `版: ${esc(VERSION)} ・ 読み取り: ${ocrReady ? "使えます" : "<b>入っていません（更新待ち）</b>"}`;
  $("usage").innerHTML = `<b>${state.places.length}軒</b>（行きたい ${state.places.filter((p) => p.status === "want").length} / 行った ${state.places.filter((p) => p.status === "been").length}） ・ スクショ ${shots}枚${esc(size)}`;

  const androidish = "share" in navigator && !/iPad|iPhone|iPod/.test(navigator.userAgent);
  $("shareNote").innerHTML = androidish
    ? "ホーム画面に入れてあれば、写真アプリやブラウザの<b>共有</b>から「スクショ飯」を選ぶだけでストックできます。地図や食べログのページを共有すると、リンク付きで1軒できます。"
    : "iPhone では共有メニューにこのアプリは出ません（iOS の制限）。かわりに「<b>スクショを取り込む</b>」で写真アプリの<b>スクリーンショット</b>アルバムから全部選んでください。すでに入っているぶんは自動で除かれます。";
}

/* ---------------- 配線 ---------------- */

function bind() {
  el.addBtn.addEventListener("click", () => el.picker.click());

  el.picker.addEventListener("change", async () => {
    const files = el.picker.files;
    if (!files || !files.length) return;
    toast(`${files.length}枚を読み込んでいます…`);
    const res = await importImages(files);
    el.picker.value = "";
    await load();
    const parts = [];
    if (res.added) parts.push(`${res.added}件ストック`);
    if (res.dup) parts.push(`${res.dup}枚は取り込み済み`);
    if (res.failed) parts.push(`${res.failed}枚は読めず`);
    toast(parts.join(" ・ ") || "追加はありませんでした");
    queueOCR(res.ids);
  });

  el.pickerMore.addEventListener("change", async () => {
    const files = el.pickerMore.files;
    if (!files || !files.length || !state.openId) return;
    const res = await importImages(files, state.openId);
    el.pickerMore.value = "";
    const id = state.openId;
    await load();
    if (state.openId === id) { await loadFullShots(id); }
    toast(res.added ? `スクショを${res.added}枚足しました` : "すでに入っています");
  });

  for (const tab of [el.tabWant, el.tabBeen]) {
    tab.addEventListener("click", () => {
      state.tab = tab.dataset.status;
      state.tags.clear();
      el.tabWant.classList.toggle("is-on", state.tab === "want");
      el.tabBeen.classList.toggle("is-on", state.tab === "been");
      el.tabWant.setAttribute("aria-selected", String(state.tab === "want"));
      el.tabBeen.setAttribute("aria-selected", String(state.tab === "been"));
      render();
      scrollTo({ top: 0 });
    });
  }

  el.searchBtn.addEventListener("click", () => {
    const show = el.searchWrap.hidden;
    el.searchWrap.hidden = !show;
    el.searchBtn.setAttribute("aria-expanded", String(show));
    if (show) el.search.focus();
    else { el.search.value = ""; state.q = ""; render(); }
  });

  el.search.addEventListener("input", () => { state.q = el.search.value.trim(); render(); });

  $("detailClose").addEventListener("click", closeDetail);
  $("detailDelete").addEventListener("click", () => deletePlace(state.openId));
  $("detailToggle").addEventListener("click", () => toggleStatus(state.openId, false));
  $("detailAddShot").addEventListener("click", () => el.pickerMore.click());

  for (const id of ["fName", "fTags", "fMemo", "fUrl", "fVisited"]) {
    $(id).addEventListener("input", queueSave);
    $(id).addEventListener("change", saveDetail);
  }

  $("detailMap").addEventListener("click", () => {
    const p = state.places.find((x) => x.id === state.openId);
    if (!p) return;
    const q = [p.name, ...(p.tags || [])].filter(Boolean).join(" ");
    if (!q) { toast("先に店名を入れてください"); return; }
    open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank", "noopener");
  });

  $("detailTabelog").addEventListener("click", () => {
    const p = state.places.find((x) => x.id === state.openId);
    if (!p) return;
    // 共有で受け取った食べログのリンクがあれば、その店のページを直接開く
    if (p.url && /tabelog\.com/.test(p.url)) { open(p.url, "_blank", "noopener"); return; }
    if (!p.name) { toast("先に店名を入れてください"); return; }
    // 食べログの検索は sk（キーワード）と sa（エリア）で受け取る。
    // 以前 sw に入れていたが、あれは別物で、入口のページに飛ばされていた。
    // エリアは「渋谷駅」ではなく「渋谷」の形で渡す
    const area = (p.tags || []).find((t) => /駅$|[区市町]$/.test(t)) || "";
    const params = new URLSearchParams({
      vs: "1",
      sa: area.replace(/駅$/, ""),
      sk: p.name,
      lid: "hd_search1",
    });
    open(`https://tabelog.com/rstLst/?${params}`, "_blank", "noopener");
  });

  $("detailLink").addEventListener("click", () => {
    const p = state.places.find((x) => x.id === state.openId);
    if (p && p.url) open(p.url, "_blank", "noopener");
  });

  $("settingsBtn").addEventListener("click", async () => {
    $("ocrToggle").checked = ocrEnabled();
    await showUsage();
    el.settings.hidden = false;
    document.body.style.overflow = "hidden";
  });

  $("settingsClose").addEventListener("click", () => {
    el.settings.hidden = true;
    document.body.style.overflow = state.openId ? "hidden" : "";
  });

  $("ocrToggle").addEventListener("change", () => {
    localStorage.setItem("meshi-ocr", $("ocrToggle").checked ? "on" : "off");
    toast($("ocrToggle").checked ? "取り込んだら読み取ります" : "読み取りを止めました");
  });

  $("ocrRedo").addEventListener("click", () => {
    const targets = state.places.filter((p) => !p.name && shotsOf(p.id).length).map((p) => p.id);
    if (!targets.length) { toast("名前が空の店はありません"); return; }
    for (const p of state.places) if (targets.includes(p.id)) p.ocrDone = false;
    localStorage.setItem("meshi-ocr", "on");
    $("ocrToggle").checked = true;
    $("settingsClose").click();
    toast(`${targets.length}件を読み取ります…`);
    queueOCR(targets);
  });

  $("exportAll").addEventListener("click", () => exportData(true));
  $("exportText").addEventListener("click", () => exportData(false));
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async () => {
    const f = $("importFile").files[0];
    $("importFile").value = "";
    if (f) await importData(f);
  });

  $("wipe").addEventListener("click", async () => {
    if (!confirm("貯めたお店とスクショを全部消します。取り消せません。")) return;
    await DB.clear("places", "shots", "blobs", "inbox");
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
    await load();
    await showUsage();
    toast("空にしました");
  });

  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!el.settings.hidden) $("settingsClose").click();
    else if (!el.detail.hidden) closeDetail();
  });

  // PC からはコピーした画像やURLをそのまま貼れる
  addEventListener("paste", async (e) => {
    if (!el.detail.hidden || !el.settings.hidden) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      const res = await importImages(files);
      await load();
      toast(res.added ? `${res.added}件ストックしました` : "すでに入っています");
      return;
    }
    const text = e.clipboardData?.getData("text/plain") || "";
    if (/^https?:\/\//.test(text.trim()) && await importLink({ url: text.trim() })) {
      await load();
      toast("リンクからストックしました");
    }
  });

  // アプリを閉じる直前の入力も落とさない
  addEventListener("visibilitychange", () => { if (document.hidden && state.openId) saveDetail(); });
}

/* ---------------- 起動 ---------------- */

/**
 * 同じサイトの1つ上の階層に別アプリ（ブロック崩し）が住んでいて、その
 * Service Worker の担当範囲がこの階層まで及んでいる端末がある。その状態だと
 * 最悪、こちらを開いたのに向こうの画面が出る。自前の sw.js が主導権を
 * 取った時点で一度だけ読み直し、正しい方に乗り換える。
 */
function healForeignController() {
  const home = new URL("./", location.href).href;
  const c = navigator.serviceWorker.controller;
  if (!c || c.scriptURL.startsWith(home)) return;   // 制御なし or もう自前なら何もしない

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const now = navigator.serviceWorker.controller;
    if (!now || !now.scriptURL.startsWith(home)) return;
    if (sessionStorage.getItem("meshi-sw-heal")) return;   // 読み直しは1回だけ
    sessionStorage.setItem("meshi-sw-heal", "1");
    location.reload();
  });
}

(async function start() {
  bind();
  await load();

  if (new URLSearchParams(location.search).has("shared")) {
    history.replaceState(null, "", location.pathname);
  }
  await drainInbox();
  setTimeout(queueLeftovers, 1500);   // 画面が出てから静かに始める

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    healForeignController();
    navigator.serviceWorker.register("./sw.js").catch(() => {});
    // 共有シートから開かれたとき、Service Worker 側からも合図が来る
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "shared") drainInbox();
    });
  }
})();

/**
 * Supabase とのやりとり（つなぐ手前まで）
 *
 * config.js が空のあいだは、何も送らずに「まだつないでいません」を返す。
 * hp/match/ と同じ作りにしてある。
 *
 * ライブラリは使わない（外部の読み込みなしの決まり／CLAUDE.md）。
 * REST を直接叩く。必要なのはログインと保存だけなので、これで足りる。
 *
 * ■ biz/supa.js とほぼ同じ中身が置いてある
 *   ひとつにまとめて共有もできるが、こちらは PWA で、
 *   Service Worker が自分のフォルダの中しかキャッシュしない。
 *   フォルダをまたぐと圏外で開けなくなるので、あえて別々に置いている。
 */

const CONFIG = window.TODO_EHON_CONFIG || {};
const URL_BASE = String(CONFIG.SUPABASE_URL || "").replace(/\/+$/, "");
const ANON = String(CONFIG.SUPABASE_ANON_KEY || "");
const SESSION_KEY = "ehon:session";

/** config.js が埋まっているか。埋まるまでは何も送らない */
export const isConfigured = () => Boolean(URL_BASE && ANON);

let session = null;

/* ── ログイン（メールに届くリンクを開く方式。パスワードは持たない） ── */

export function loadSession() {
  // メールのリンクから戻ってきた直後は、URLの # にトークンが入っている
  if (location.hash.includes("access_token=")) {
    const h = new URLSearchParams(location.hash.slice(1));
    const s = {
      access_token: h.get("access_token"),
      refresh_token: h.get("refresh_token"),
      expires_at: Number(h.get("expires_at") || 0) * 1000,
    };
    if (s.access_token) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* 使えなくてもその場は動く */ }
      history.replaceState(null, "", location.pathname + location.search);
      session = s;
      return s;
    }
  }
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
  catch { session = null; }
  return session;
}

export function signOut() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* 同上 */ }
  session = null;
}

export const signedIn = () => Boolean(session?.access_token);

/**
 * ログイン中の人のID（auth.users.id）。
 * works.author_id に入れる。RLS が author_id = auth.uid() を求めるので、
 * ここが抜けていると「弾かれた」ように見えて原因が分かりにくい
 */
export function userId() {
  const token = session?.access_token;
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(part.length + ((4 - part.length % 4) % 4), "="))).sub || null;
  } catch {
    return null;
  }
}

/** ログインのリンクを送る。届いたリンクを開くと、この画面に戻ってくる */
export async function sendLoginLink(email) {
  if (!isConfigured()) throw new Error("まだつないでいません");
  const back = location.href.split("#")[0];
  const res = await fetch(`${URL_BASE}/auth/v1/otp?redirect_to=${encodeURIComponent(back)}`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!res.ok) throw new Error("ログインのリンクを送れませんでした");
}

async function refresh() {
  if (!session?.refresh_token) throw new Error("ログインし直してください");
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) { signOut(); throw new Error("ログインし直してください"); }
  const d = await res.json();
  session = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
  };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* 同上 */ }
}

/* ── 問い合わせ ── */

async function api(path, opts = {}, retried = false) {
  if (!isConfigured()) throw new Error("まだつないでいません");

  // ログインしていないときは Authorization を付けない。
  // 新しい形式のキー（sb_publishable_...）は JWT ではないので、
  // Bearer に載せると弾かれることがある。役割は apikey だけで決まる
  const headers = {
    apikey: ANON,
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const res = await fetch(URL_BASE + path, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !retried) {
    await refresh();
    return api(path, opts, true);
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    // RLS で弾かれたときは、ここに理由が入って返ってくる
    throw new Error(data?.message || data?.error_description || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

/**
 * 絵本を審査に出す。
 *
 * status は 'review' で固定。**子ども向けは、管理者が通すまで公開されない。**
 * これはアプリ側ではなくDBのトリガで止めている（supabase/community.sql）。
 * ここを直しても公開はされないので、そのつもりで。
 *
 * 絵そのものは送らない。ファイル名だけが入る。
 */
export async function submitBook(draft) {
  const author = userId();
  if (!author) throw new Error("ログインし直してください");

  const work = await api("/rest/v1/works", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      site: "ehon",
      kind: "ehon",
      author_id: author,
      slug: draft.slug,
      title: draft.title,
      summary: draft.summary || null,
      age_min: draft.age_min ?? null,
      age_max: draft.age_max ?? null,
      reading_minutes: draft.reading_minutes ?? null,
      status: "review",
    },
  });
  const row = Array.isArray(work) ? work[0] : work;

  // ページは別の表に入る。1冊ぶんをまとめて1回で送る
  await api("/rest/v1/work_pages", {
    method: "POST",
    body: draft.pages.map((p, i) => ({
      work_id: row.id,
      page_no: i + 1,
      image: p.image,
      alt: p.alt || null,
      text: p.text || null,
    })),
  });

  return row;
}

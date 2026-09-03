/* 問いを書き換えるデモ体験ツールの、サーバ側の処理。
 *
 * なぜサーバが要るか:
 * GitHub Pages は静的ファイルしか置けず、APIキーを隠す場所が無い。
 * ブラウザに書けば誰でも読めてしまうので、鍵を持つのはここだけにする。
 *
 * 設計の切り分け（他の部門と同じ考え方）:
 * - LLM がやるのは「問いの書き換え」と「その理由の説明」だけ。
 * - **合否の判定はコードが行う**（check 関数）。料金や断定的な約束が混ざった出力は返さない。
 *   一度画面に出た文言は取り消せないため、確率的なお願いではなく機械的な判定で止める。
 * - 落ちたら1回だけ作り直させ、それでも駄目なら「うまく書き換えられなかった」と正直に返す。
 *
 * 無料枠について:
 * Gemini の無料枠は「1分あたり」と「1日あたり」に上限がある。超えると 429 が返る。
 * デモ当日は同時アクセスが重なりやすいので、429 は異常ではなく想定内として扱い、
 * 画面には「混み合っています。少し待ってからもう一度」と出す（黙って失敗させない）。
 */

const MODEL = "gemini-3.6-flash";
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/* 申し込みのときに学年を聞くので、その学年の生活に届く言い方で書き換える。
   1年生に就活の例を出しても遠い。4年生に履修の例を出しても遅い。
   student は学年が分からないときの受け皿として残す。 */
const AUDIENCE = {
  g1: {
    label: "大学1年",
    context: "履修の組み方、サークル選び、アルバイト、初めてのレポートに迷っている大学1年生",
    subject: "履修・サークル・バイト・レポート",
  },
  g2: {
    label: "大学2年",
    context: "ゼミ選び、専門科目の学び方、インターンに行くかどうかを考え始めた大学2年生",
    subject: "ゼミ選び・専門の勉強・インターン",
  },
  g3: {
    label: "大学3年",
    context: "就職活動の準備、エントリーシート、自己分析、研究室配属を控えた大学3年生",
    subject: "就活の準備・自己分析・研究室",
  },
  g4: {
    label: "大学4年・院生",
    context: "卒業論文や修士論文、進路の最終決定、面接を抱えた大学4年生・大学院生",
    subject: "論文・進路の決定・面接",
  },
  student: {
    label: "大学生",
    context: "就職活動のエントリーシート、ゼミや研究の問い、進路の迷いを抱えている大学生",
    subject: "就活・研究・進路",
  },
  pro: {
    label: "社会人・個人事業主",
    context: "提案書や業務改善、自分の事業へのAI導入を抱えている社会人・個人事業主",
    subject: "業務・事業の意思決定",
  },
};

/* 出してはいけないもの。marketing_agent/brand.py と support_agent/guard.py に合わせる */
const BANNED = ["必ず", "保証", "確実に", "絶対に", "内定します", "受かります"];
const PERSONAL_NAMES = ["小森", "辰巳", "大谷"];
const AMOUNT = /[0-9][0-9,]*\s*円/;

const MAX_INPUT = 400;
/* 資料ページからの質問。デモの問いより長くなるので別枠にする */
const MAX_ASK = 600;
/* 提出するワーク。質問より長くなる */
const MAX_WORK = 4000;
/* 同じ回の受講者に見せる質問の数。多すぎると読まれない */
const PEER_QUESTIONS = 30;
/* 同じ人からの連投を止める。1時間に何件まで受けるか */
const ASK_PER_HOUR = 10;
const MAX_QUESTION = 90;

/* Slackに出すリンクの行き先。運営用の画面はここに置いてある */
const SITE = "https://todo2023.github.io/my-ai-agent";

/* 教材に戻す答えの長さ。長い説明はオフィスアワーで話すほうが早い */
const MAX_ANSWER = 1200;

/* オフィスアワー。1人が同時に持てる予約は1つだけにする。
   枠を押さえたまま来ない人が続くと、他の人が取れなくなるため */
const OH_MAX_PER_PERSON = 1;
const OH_LIST_LIMIT = 60;
const MAX_EXPLANATION = 220;

export function buildPrompt(audience, text) {
  const a = AUDIENCE[audience];
  return `あなたは「思考力×AI統合講座」の添削担当です。${a.context}から、次の問い（または一文）が届きました。

## やること

この問いを、**意思決定に直結する磨いた問い**に書き換えてください。

書き換えの基準は、次の1組と同じ思想です。

- 前: 「AIって、結局なにに使えるんですか?」
- 後: 「自分の意思決定に、AIをどう組み込むか?」

前者は答えを聞いても何も動きません。後者は答えが出た瞬間に次の行動が決まります。
**「聞いた瞬間に次の行動が決まるか」**を判断の軸にしてください。

## 書き方

- question: 書き換え後の問い。1文。${MAX_QUESTION}文字以内。必ず「?」で終える。
  元の文をそのまま言い換えただけにしない。粒度を一段下げ、${a.subject}の具体に踏み込む。
- explanation: なぜこの問いの方がよいのかの説明。2〜3文、${MAX_EXPLANATION}文字以内。
  短文中心。断定を恐れない。説明しすぎない。

## 書いてはいけないこと

- 金額、料金、講座の内容や条件（事実を知らないため、書けば必ず間違える）
- 「必ず」「保証」「確実に」などの約束
- 絵文字、過剰な感嘆符、煽り
- 相手を評価する言葉（「良い問いですね」など）。書き換えた結果だけを示す

## 届いた問い

${text}`;
}

/* Gemini の REST は型名を大文字で受け取る。小文字は版によって弾かれるため、
   デモ当日に初めて 400 が返る事故を避けてこの形にしている。 */
const SCHEMA = {
  type: "OBJECT",
  properties: {
    question: { type: "STRING" },
    explanation: { type: "STRING" },
  },
  required: ["question", "explanation"],
};

/** 出力を機械的に検査する。LLM に守らせるのではなく、ここで落とす。 */
export function check(result, original) {
  const q = (result.question || "").trim();
  const e = (result.explanation || "").trim();
  const problems = [];

  if (!q) problems.push("問いが空");
  if (q.length > MAX_QUESTION) problems.push("問いが長すぎる");
  if (q && !/[?？]$/.test(q)) problems.push("問いが疑問形で終わっていない");
  if (q && q === original.trim()) problems.push("元の文をそのまま返している");
  if (!e) problems.push("説明が空");
  if (e.length > MAX_EXPLANATION) problems.push("説明が長すぎる");

  const both = q + "\n" + e;
  if (AMOUNT.test(both)) problems.push("金額が含まれている");
  for (const w of BANNED) if (both.includes(w)) problems.push(`禁止語「${w}」が含まれている`);
  for (const n of PERSONAL_NAMES) if (both.includes(n)) problems.push(`個人名「${n}」が含まれている`);

  return problems;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

/** アクセスコードを確かめ、利用回数を1つ進める。上限が無ければ数えるだけ。 */
async function useCode(env, code) {
  const allowed = JSON.parse(env.ACCESS_CODES || "{}"); // { "CODE": {"audience":"student","max_uses":null} }
  const entry = allowed[code];
  if (!entry) return { ok: false, reason: "コードが違います" };

  if (!env.DEMO_KV) return { ok: true, entry, used: 0 }; // KV 未設定でも動く（回数は数えない）

  const key = `use:${code}`;
  const used = Number((await env.DEMO_KV.get(key)) || 0);
  const max = entry.max_uses ?? (env.DEFAULT_MAX_USES ? Number(env.DEFAULT_MAX_USES) : null);
  if (max !== null && used >= max) {
    return { ok: false, reason: `このコードの利用回数の上限（${max}回）に達しました` };
  }
  await env.DEMO_KV.put(key, String(used + 1));
  return { ok: true, entry, used: used + 1 };
}

async function askGemini(env, prompt) {
  if (!env.GEMINI_API_KEY) {
    return { error: "GEMINI_API_KEY が登録されていません（wrangler secret put GEMINI_API_KEY）" };
  }
  const model = env.GEMINI_MODEL || MODEL;
  const res = await fetch(`${ENDPOINT(model)}?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        temperature: 0.7,
      },
    }),
  });

  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) return { error: `Gemini が ${res.status} を返しました` };

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { error: "Gemini から本文が返りませんでした" };
  try {
    return { result: JSON.parse(text) };
  } catch {
    return { error: "Gemini の応答を読み取れませんでした" };
  }
}

/* ------------------------------------------------------------------
   資料ページ（lesson-NN.html）からの質問を受け取る。
   届け先はSlackの Incoming Webhook。Slackが未設定でも質問は
   KVに残るので、受け取り損ねることはない（読み方は README 参照）。
   ------------------------------------------------------------------ */

/** 1時間あたりの件数を数える。KVが無ければ数えない（動きは止めない） */
async function askRateOk(env, ip) {
  if (!env.DEMO_KV || !ip) return true;
  const bucket = Math.floor(Date.now() / (1000 * 60 * 60));
  const key = `askrate:${ip}:${bucket}`;
  const n = Number((await env.DEMO_KV.get(key)) || 0);
  if (n >= ASK_PER_HOUR) return false;
  await env.DEMO_KV.put(key, String(n + 1), { expirationTtl: 60 * 60 * 2 });
  return true;
}

/** Slackへ流す。webhookが無ければ何もしない（呼び出し側はKVに残す）

   kind で届け先を変える。ワークの提出と質問が同じ場所に混ざると、
   どちらも読み飛ばされる。work 用が未設定なら質問側に落とす（黙って消さない）。 */
async function toSlack(env, q, kind = "ask") {
  const hook = kind === "work"
    ? (env.SLACK_WORK_WEBHOOK_URL || env.SLACK_WEBHOOK_URL)
    : env.SLACK_WEBHOOK_URL;
  if (!hook) return { sent: false, reason: "webhook未設定" };
  const where = q.slide ? `${q.lesson}／スライド ${q.slide}` : q.lesson;
  // 番号を控えて貼り直すのは面倒なので、**押せばその質問が開くリンク**を出す。
  // 番号そのものも残しておく（リンクが使えないときの手がかりになる）
  const tag = q.id
    ? `\n\n<${SITE}/answer.html?id=${encodeURIComponent(q.id)}|▶ この質問に答える>`
      + `\n（番号 \`${q.id}\`）`
    : "";
  const text = `:raising_hand: *${where}* ／ ${q.name}\n>>> ${q.text}${tag}`;
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return { sent: false, reason: `Slackが ${res.status} を返しました` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: "Slackに届きませんでした" };
  }
}

async function handleAsk(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "読み取れない要求です" }, 400);
  }

  // 入力欄を隠して置いてある。人は触らないので、埋まっていれば機械
  if (String(body.website || "").trim()) return json({ ok: true });

  const text = String(body.text || "").trim();
  if (!text) return json({ error: "質問が空です" }, 400);
  if (text.length > MAX_ASK) {
    return json({ error: `長すぎます。${MAX_ASK}文字以内で入れてください` }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await askRateOk(env, ip))) {
    return json({ error: "短い時間に送りすぎです。しばらく待ってから送ってください" }, 429);
  }

  const q = {
    lesson: String(body.lesson || "").slice(0, 40) || "回の指定なし",
    slide: String(body.slide || "").slice(0, 8),
    name: String(body.name || "").trim().slice(0, 40) || "名前なし",
    text,
    at: new Date().toISOString(),
  };

  // 先に残す。Slackが落ちていても質問そのものは失わない
  const slug = String(body.slug || "").slice(0, 40);
  const at = Date.now();
  q.id = `ask:${at}`;
  if (env.DEMO_KV) {
    await env.DEMO_KV.put(q.id, JSON.stringify({ ...q, slug }), {
      expirationTtl: 60 * 60 * 24 * 180,
    });
    // 同じ回の受講者に見せる分。**名前は入れない**
    if (slug) {
      await env.DEMO_KV.put(
        `q:${slug}:${at}`,
        JSON.stringify({ slide: q.slide, text: q.text, at: q.at }),
        { expirationTtl: 60 * 60 * 24 * 180 }
      );
      // どれがあるかの索引。受講者の画面で list を呼ばずに済ませるため
      const key = `qidx:${slug}`;
      const ids = (await readIndex(env, key)) || [];
      ids.push(String(at));
      await env.DEMO_KV.put(key, JSON.stringify(ids.slice(-PEER_QUESTIONS)));
    }
  }

  const slack = await toSlack(env, q);
  return json({ ok: true, delivered: slack.sent });
}

/** 運営が溜まった質問を見るための読み出し。合鍵が要る */
async function listAsks(url, env) {
  const key = url.searchParams.get("key") || "";
  if (!env.ASK_ADMIN_KEY || key !== env.ASK_ADMIN_KEY) {
    return json({ error: "鍵が違います" }, 403);
  }
  if (!env.DEMO_KV) return json({ questions: [] });
  const list = await env.DEMO_KV.list({ prefix: "ask:" });
  const questions = [];
  for (const k of list.keys.slice(-100)) {
    const v = await env.DEMO_KV.get(k.name);
    // 番号を必ず添える。古い質問には入っていないので、鍵の名前から補う
    if (v) questions.push({ ...JSON.parse(v), id: k.name });
  }
  // まだ返していないものを先に出す。溜まると、どれが未回答か分からなくなる
  questions.reverse();
  const yet = questions.filter((q) => !q.answer);
  const done = questions.filter((q) => q.answer);
  return json({ questions: [...yet, ...done], waiting: yet.length });
}

/* ------------------------------------------------------------------
   教材を配る。

   なぜサーバーが配るか:
   公開サイトに本文を置くと、パスワードをかけてもURLを知る人には読めます。
   本文とスライドは非公開リポジトリから KV に載せ、ここが
   「その人に解放されている回だけ」を取り出して返します。
   解放されていない回は、URLを直接叩いても返しません。

   解放の決まり:
   - 番号のない回（はじめに）は、いつでも開く
   - 番号のある回は「提出した回の次まで」かつ「支払いで解放された回まで」
     の、**小さいほう**まで開く。順番に進んでもらいつつ、
     先払いしていない回は提出しても開かないようにするため。
   ------------------------------------------------------------------ */


/* ============ 一覧（list）を、受講者が触る経路から無くす ============

   KV の無料枠は「書き込み・削除・一覧」を合わせて1日1,000回までです。
   読み出しは1日100,000回で、桁が2つ違います。
   受講者が資料を開くたびに list を呼んでいると、**人が増えたときに
   いちばん細い枠から先に詰まります。**

   そこで、受講者が触る経路では list を使わず、
   「どれがあるか」を控えた索引を1つ読んでから、中身を読み出します。
   読み出しは潤沢なので、こちらに寄せるほうが安全です。 */

async function readIndex(env, key) {
  const raw = await env.DEMO_KV.get(key);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** 索引が無いとき（この仕組みより前に入れたもの）だけ、1度だけ list で作り直す */
async function rebuildIndex(env, key, prefix, pick) {
  const ids = [];
  let cursor;
  do {
    const page = await env.DEMO_KV.list({ prefix, cursor });
    for (const k of page.keys) ids.push(pick(k.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  ids.sort();
  await env.DEMO_KV.put(key, JSON.stringify(ids));
  return ids;
}

/** 受講者の記録。無ければ null */
async function member(env, code) {
  if (!env.DEMO_KV || !code) return null;
  const raw = await env.DEMO_KV.get(`member:${code}`);
  return raw ? JSON.parse(raw) : null;
}

/** 一覧。載せていなければ空 */
async function lessonIndex(env) {
  if (!env.DEMO_KV) return [];
  const raw = await env.DEMO_KV.get("index");
  return raw ? JSON.parse(raw) : [];
}

/** どこまで提出したか。まだなら -1 */
async function progressOf(env, code) {
  if (!env.DEMO_KV) return -1;
  const raw = await env.DEMO_KV.get(`prog:${code}`);
  return raw === null ? -1 : Number(raw);
}

/** 最初に提出を求める回の位置。デモと「はじめに」はここに数えない */
function firstGating(index) {
  const i = index.findIndex((e) => e.gates);
  return i === -1 ? index.length : i;
}

/** i 番目の回が、その人に開いているか */
function isOpen(index, i, progress, paidThrough) {
  const entry = index[i];
  if (!entry) return false;
  if (!entry.gates) return true;             // デモ・はじめには常に開く
  const byWork = progress + 1;               // 提出した回の次まで
  const byPaid = paidThrough ?? -1;          // 支払いで解放された回まで
  return i <= Math.min(byWork, byPaid);
}

/** 合言葉を確かめ、一覧と解放状態を返す。入り口はここ1つ */
/** 提出を求める回を、ぜんぶ出し終えたか。
   最後の回が番号なしに変わっても効くよう、位置ではなく gates で見る。 */
function allDone(index, progress) {
  const gating = index.filter((e) => e.gates);
  if (!gating.length) return false;
  return index.every((e, i) => !e.gates || i <= progress);
}

async function whoAmI(env, code) {
  const who = await member(env, code);
  if (!who) return { error: "合言葉が違います" };
  const index = await lessonIndex(env);
  const stored = await progressOf(env, code);
  // まだ何も出していない人は、最初の1回だけ開いた状態から始める
  const progress = stored === -1 ? firstGating(index) - 1 : stored;
  const paidThrough = who.paidThrough ?? -1;
  return {
    who, index, progress, paidThrough,
    lessons: index.map((e, i) => ({
      slug: e.slug, label: e.label, title: e.title, date: e.date,
      written: e.written, open: isOpen(index, i, progress, paidThrough),
      // 提出を求める回かどうか。修了したかの判定に要る
      gates: e.gates,
      done: e.gates && i <= progress,
    })),
  };
}

async function handleMe(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  const me = await whoAmI(env, code);
  if (me.error) return json({ error: me.error }, 403);
  return json({ name: me.who.name || "", lessons: me.lessons });
}

async function handleLesson(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  const slug = String(body.slug || "").trim();

  const me = await whoAmI(env, code);
  if (me.error) return json({ error: me.error }, 403);

  const i = me.index.findIndex((e) => e.slug === slug);
  if (i === -1) return json({ error: "その回はありません" }, 404);
  if (!isOpen(me.index, i, me.progress, me.paidThrough)) {
    // 何が足りないのかを言う。黙って断ると、受講者が理由を推測できない
    const reason = i > me.paidThrough
      ? "この回はまだお申し込みの範囲に入っていません"
      : "前の回のワークを提出すると開きます";
    return json({ error: reason, locked: true }, 403);
  }

  const raw = await env.DEMO_KV.get(`lesson:${slug}`);
  if (!raw) return json({ error: "この回はまだ用意できていません" }, 404);
  const data = JSON.parse(raw);
  const next = me.index[i + 1];
  return json({
    ...data,
    prev: i > 0 ? { slug: me.index[i - 1].slug, label: me.index[i - 1].label } : null,
    next: next ? { slug: next.slug, label: next.label, open: isOpen(me.index, i + 1, me.progress, me.paidThrough) } : null,
    submitted: !!data.gates && i <= me.progress,
  });
}

/** スライド画像。本文と同じ鍵で守る（画像だけ抜かれては意味がない） */
async function handleSlide(url, env) {
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  const slug = (url.searchParams.get("slug") || "").trim();
  const page = (url.searchParams.get("p") || "").trim();
  if (!/^\d{2}$/.test(page)) return new Response("bad page", { status: 400 });

  const me = await whoAmI(env, code);
  if (me.error) return new Response("forbidden", { status: 403 });
  const i = me.index.findIndex((e) => e.slug === slug);
  if (i === -1 || !isOpen(me.index, i, me.progress, me.paidThrough)) {
    return new Response("forbidden", { status: 403 });
  }

  // 画像はそのままの姿で入っている（upload.py が base64 で渡し、
  // wrangler が戻して保存する）。文字として読むと壊れるので、バイトで受け取る
  const bytes = await env.DEMO_KV.get(`slide:${slug}:${page}`, "arrayBuffer");
  if (!bytes) return new Response("not found", { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Access-Control-Allow-Origin": "*",
      // 版（v）が付いていれば、差し替えたときにURLが変わるので長く持たせてよい。
      // 付いていないときは短くする。古い画像が1時間残るのを避けるため
      "Cache-Control": url.searchParams.get("v")
        ? "private, max-age=604800, immutable"
        : "private, max-age=60",
    },
  });
}

/** ワークの提出。これで次の回が開く */
async function handleSubmit(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  const slug = String(body.slug || "").trim();
  const text = String(body.text || "").trim();

  const me = await whoAmI(env, code);
  if (me.error) return json({ error: me.error }, 403);
  if (!text) return json({ error: "ワークが空です" }, 400);
  if (text.length > MAX_WORK) {
    return json({ error: `長すぎます。${MAX_WORK}文字以内で入れてください` }, 400);
  }

  const i = me.index.findIndex((e) => e.slug === slug);
  if (i === -1) return json({ error: "その回はありません" }, 404);
  if (!isOpen(me.index, i, me.progress, me.paidThrough)) {
    return json({ error: "この回はまだ開いていません", locked: true }, 403);
  }

  const entry = me.index[i];
  await env.DEMO_KV.put(
    `work:${code}:${slug}:${Date.now()}`,
    JSON.stringify({ code, name: me.who.name || "", slug, label: entry.label, text, at: new Date().toISOString() }),
    { expirationTtl: 60 * 60 * 24 * 365 }
  );

  // 提出は進むだけ。出し直しても前に戻さない
  const progress = entry.gates ? Math.max(me.progress, i) : me.progress;
  if (progress !== me.progress) await env.DEMO_KV.put(`prog:${code}`, String(progress));

  const slack = await toSlack(env, {
    lesson: `${entry.label} ${entry.title}`,
    slide: "",
    name: `${me.who.name || code}（ワーク提出）`,
    text,
  }, "work");

  const nextEntry = me.index[i + 1];
  const nowOpen = nextEntry ? isOpen(me.index, i + 1, progress, me.paidThrough) : false;
  return json({
    ok: true,
    delivered: slack.sent,
    // 提出を求める回を、ぜんぶ出し終えたか。最後の1本を出した人には
    // 次の回ではなく修了の画面を見せる
    done: allDone(me.index, progress),
    next: nextEntry ? { slug: nextEntry.slug, label: nextEntry.label, open: nowOpen } : null,
    // 次が開かない理由を、そのまま伝える
    blocked: nextEntry && !nowOpen ? "次の回は、お申し込みの範囲に入ってから開きます" : "",
  });
}

/** 受講者の登録・支払い範囲の更新。合鍵が要る */
async function handleMember(request, url, env) {
  const key = url.searchParams.get("key") || "";
  if (!env.ASK_ADMIN_KEY || key !== env.ASK_ADMIN_KEY) {
    return json({ error: "鍵が違います" }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return json({ error: "合言葉がありません" }, 400);

  const now = (await member(env, code)) || {};
  const rec = {
    name: body.name !== undefined ? String(body.name) : (now.name || ""),
    paidThrough: body.paidThrough !== undefined ? Number(body.paidThrough) : (now.paidThrough ?? -1),
    audience: body.audience !== undefined ? String(body.audience) : (now.audience || "student"),
  };
  await env.DEMO_KV.put(`member:${code}`, JSON.stringify(rec));
  return json({ ok: true, code, ...rec });
}

/** 同じ回に寄せられた質問を、名前を伏せて返す。
   自分に開いていない回の質問は返さない（本文と同じ扱いにする） */
async function handleQuestions(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  const slug = String(body.slug || "").trim();

  const me = await whoAmI(env, code);
  if (me.error) return json({ error: me.error }, 403);
  const i = me.index.findIndex((e) => e.slug === slug);
  if (i === -1 || !isOpen(me.index, i, me.progress, me.paidThrough)) {
    return json({ error: "この回はまだ開いていません" }, 403);
  }
  if (!env.DEMO_KV) return json({ questions: [] });

  // 索引を1つ読んでから、中身を読み出す。list は使わない
  const key = `qidx:${slug}`;
  let ids = await readIndex(env, key);
  if (ids === null) {
    // この仕組みより前に入った質問。1度だけ作り直す
    ids = await rebuildIndex(env, key, `q:${slug}:`, (n) => n.slice(`q:${slug}:`.length));
  }
  const questions = [];
  for (const at of ids.slice(-PEER_QUESTIONS).reverse()) {
    const v = await env.DEMO_KV.get(`q:${slug}:${at}`);
    if (v) questions.push({ id: `q:${slug}:${at}`, ...JSON.parse(v) });
  }
  return json({ questions });
}


/** 質問に返した答えを、教材の側に戻す。合鍵が要る。

   Slackに流れた質問には番号（ask:...）が添えてある。
   その番号と答えをここに送ると、同じ回を開いている人の
   「みんなの質問」に、答えが並んで出る。
   **名前は戻さない。**誰が聞いたかは、答えの側にも出さない。 */
async function handleAnswer(request, url, env) {
  const key = url.searchParams.get("key") || "";
  if (!env.ASK_ADMIN_KEY || key !== env.ASK_ADMIN_KEY) {
    return json({ error: "鍵が違います" }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const text = String(body.text || "").trim();

  if (!id.startsWith("ask:")) return json({ error: "番号が違います（ask: で始まります）" }, 400);
  if (!text) return json({ error: "答えが空です" }, 400);
  if (text.length > MAX_ANSWER) {
    return json({ error: `長すぎます。${MAX_ANSWER}文字以内で入れてください` }, 400);
  }

  const raw = await env.DEMO_KV.get(id);
  if (!raw) return json({ error: "その質問はありません" }, 404);
  const q = JSON.parse(raw);

  q.answer = text;
  q.answeredAt = new Date().toISOString();
  await env.DEMO_KV.put(id, JSON.stringify(q), { expirationTtl: 60 * 60 * 24 * 180 });

  // 受講者に見える側にも同じ答えを置く。回が分からない質問は、
  // 置き場所が無いので運営の控えだけに残る
  let shown = false;
  if (q.slug) {
    const at = id.slice("ask:".length);
    const peer = `q:${q.slug}:${at}`;
    const praw = await env.DEMO_KV.get(peer);
    if (praw) {
      const p = JSON.parse(praw);
      p.answer = text;
      p.answeredAt = q.answeredAt;
      await env.DEMO_KV.put(peer, JSON.stringify(p), { expirationTtl: 60 * 60 * 24 * 180 });
      shown = true;
    }
  }
  return json({ ok: true, id, shown });
}

/** 見せたくない質問を取り下げる。合鍵が要る */
async function handleHide(request, url, env) {
  const key = url.searchParams.get("key") || "";
  if (!env.ASK_ADMIN_KEY || key !== env.ASK_ADMIN_KEY) {
    return json({ error: "鍵が違います" }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id.startsWith("q:")) return json({ error: "その質問はありません" }, 400);
  await env.DEMO_KV.delete(id);
  // 索引にも残っていると、消えた質問を読みに行き続けることになる
  const parts = id.split(":");
  const idxKey = `qidx:${parts[1]}`;
  const ids = await readIndex(env, idxKey);
  if (ids) {
    await env.DEMO_KV.put(idxKey, JSON.stringify(ids.filter((x) => String(x) !== parts[2])));
  }
  return json({ ok: true, id });
}



/* ============ 予約を、Googleカレンダーに入れる ============

   2段構えにしてある。

   1. Slackの通知に「カレンダーに追加」リンクを付ける。
      押すとGoogleカレンダーの登録画面が開く。**設定は要らない。**
   2. CALENDAR_HOOK_URL を設定してあれば、そこへ送って**自動で**入れる。
      受け口は Google Apps Script で作る（無料・手順は README）。

   どちらも無料。2が未設定でも1は動くので、止まることはない。 */

/** カレンダーが読む形の日時（20260910T110000Z） */
function calStamp(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 押すとGoogleカレンダーの登録画面が開くリンク */
function calendarLink(ev) {
  const end = new Date(new Date(ev.at).getTime() + (ev.dur || 30) * 60000).toISOString();
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${calStamp(ev.at)}/${calStamp(end)}`,
    details: ev.details || "",
    location: ev.url || "",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** 受け口が設定してあれば、そこへ送る。無ければ何もしない（止めない） */
async function toCalendar(env, ev) {
  if (!env.CALENDAR_HOOK_URL) return { sent: false, reason: "受け口が未設定" };
  const end = new Date(new Date(ev.at).getTime() + (ev.dur || 30) * 60000).toISOString();
  try {
    const res = await fetch(env.CALENDAR_HOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // 受け口のURLを知られただけで書き込まれないよう、合言葉を添える
        token: env.CALENDAR_TOKEN || "",
        op: ev.op || "add",
        id: ev.id || "",
        title: ev.title,
        start: ev.at,
        end,
        details: ev.details || "",
        location: ev.url || "",
      }),
    });
    if (!res.ok) return { sent: false, reason: `受け口が ${res.status} を返しました` };
    return { sent: true };
  } catch {
    // カレンダーに入らなくても、予約そのものは成立させる。ここで止めない
    return { sent: false, reason: "受け口に届きませんでした" };
  }
}

/* ============ オフィスアワー ============
   基本は予約制。枠（oh:slot:<id>）を運営が登録し、受講者が1つ押さえる。
   そのうえで、いま話せるときだけ運営が在席（oh:open）を立てる。
   在席は「その時できる場合のみ」の扱いなので、約束にはしない。 */

/** 枠を全部読む。数が多くならない前提（週に数件）。
   受講者も開く画面なので、list は使わず索引から読む */
async function ohSlots(env) {
  let ids = await readIndex(env, "ohidx");
  if (ids === null) {
    ids = await rebuildIndex(env, "ohidx", "oh:slot:", (n) => n.slice("oh:slot:".length));
  }
  const out = [];
  for (const id of ids) {
    const raw = await env.DEMO_KV.get(`oh:slot:${id}`);
    if (raw) out.push({ id, ...JSON.parse(raw) });
  }
  out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return out.slice(0, OH_LIST_LIMIT);
}

async function ohIsOpen(env) {
  return (await env.DEMO_KV.get("oh:open")) === "1";
}

/** 受講者に見せる形。**他の人の名前は出さない。**埋まっているかどうかだけ返す */
function ohView(slot, code, open) {
  const mine = slot.taken === code;
  return {
    id: slot.id,
    at: slot.at,
    dur: slot.dur || 30,
    taken: Boolean(slot.taken),
    mine,
    // 場所（Meetなど）は、**自分が押さえた枠**か、いま在席のときだけ返す。
    // 誰でも読めると、予約していない人が入ってきてしまう
    url: mine || open ? (slot.url || "") : "",
  };
}

async function handleOh(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  const me = await whoAmI(env, code);
  if (me.error) return json({ error: me.error }, 403);

  const open = await ohIsOpen(env);
  const now = new Date().toISOString();
  const slots = (await ohSlots(env))
    .filter((s) => s.at >= now || s.taken === code)
    .map((s) => ohView(s, code, open));
  return json({
    open,
    // 在席のときだけ、その場の入り口を出す
    nowUrl: open ? (env.OFFICE_URL || "") : "",
    slots,
    mine: slots.filter((s) => s.mine),
  });
}

async function handleOhBook(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  const id = String(body.id || "").trim();
  const note = String(body.note || "").trim().slice(0, MAX_ASK);

  const me = await whoAmI(env, code);
  if (me.error) return json({ error: me.error }, 403);

  const raw = await env.DEMO_KV.get(`oh:slot:${id}`);
  if (!raw) return json({ error: "その枠はありません" }, 404);
  const slot = JSON.parse(raw);

  if (slot.at < new Date().toISOString()) {
    return json({ error: "その枠は過ぎています" }, 409);
  }
  if (slot.taken && slot.taken !== code) {
    return json({ error: "その枠は、ひと足違いで埋まりました" }, 409);
  }

  // 1人1件まで。押さえたまま来ない枠が積み重なると、他の人が取れなくなる
  const held = (await ohSlots(env))
    .filter((s) => s.taken === code && s.id !== id && s.at >= new Date().toISOString());
  if (held.length >= OH_MAX_PER_PERSON) {
    return json({
      error: "すでに予約があります。取り直すときは、先に今の予約を取り消してください",
      held: held.map((s) => ({ id: s.id, at: s.at })),
    }, 409);
  }

  slot.taken = code;
  slot.name = me.who.name || "";
  slot.note = note;
  slot.bookedAt = new Date().toISOString();
  await env.DEMO_KV.put(`oh:slot:${id}`, JSON.stringify(slot));

  const who = me.who.name || code;
  const ev = {
    id, at: slot.at, dur: slot.dur || 30,
    title: `オフィスアワー：${who}`,
    details: note || "（相談したいことは未記入）",
    url: slot.url || env.OFFICE_URL || "",
  };
  const cal = await toCalendar(env, ev);

  const slack = await toSlack(env, {
    lesson: "オフィスアワー",
    slide: "",
    name: `${who}（予約）`,
    text: `${slot.at}（${ev.dur}分）\n${ev.details}`
      + `\n\n<${calendarLink(ev)}|▶ カレンダーに追加>`
      + (cal.sent ? "\n（カレンダーには自動で入れました）" : ""),
  }, "work");

  return json({
    ok: true, delivered: slack.sent, calendar: cal.sent,
    slot: ohView({ id, ...slot }, code, false),
  });
}

async function handleOhCancel(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  const id = String(body.id || "").trim();

  const me = await whoAmI(env, code);
  if (me.error) return json({ error: me.error }, 403);

  const raw = await env.DEMO_KV.get(`oh:slot:${id}`);
  if (!raw) return json({ error: "その枠はありません" }, 404);
  const slot = JSON.parse(raw);
  // 自分の予約しか取り消せない。他人の枠を空けられては困る
  if (slot.taken !== code) return json({ error: "その枠はあなたの予約ではありません" }, 403);

  const was = { at: slot.at, note: slot.note || "" };
  delete slot.taken; delete slot.name; delete slot.note; delete slot.bookedAt;
  await env.DEMO_KV.put(`oh:slot:${id}`, JSON.stringify(slot));

  // カレンダー側からも消す。残っていると、来ない予定を持ち続けることになる
  const cal = await toCalendar(env, {
    op: "remove", id, at: was.at, dur: slot.dur || 30,
    title: `オフィスアワー：${me.who.name || code}`,
  });

  await toSlack(env, {
    lesson: "オフィスアワー",
    slide: "",
    name: `${me.who.name || code}（取り消し）`,
    text: `${was.at} の予約を取り消しました`
      + (cal.sent ? "\n（カレンダーからも消しました）" : "\n（カレンダーは手で消してください）"),
  }, "work");

  return json({ ok: true, id, calendar: cal.sent });
}

/** 枠の登録・削除と、在席の切り替え。運営だけが叩ける */
async function handleOhAdmin(request, url, env) {
  const key = url.searchParams.get("key") || "";
  if (!env.ASK_ADMIN_KEY || key !== env.ASK_ADMIN_KEY) {
    return json({ error: "鍵が違います" }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const op = String(body.op || "");

  if (op === "open" || op === "close") {
    await env.DEMO_KV.put("oh:open", op === "open" ? "1" : "0");
    return json({ ok: true, open: op === "open" });
  }

  if (op === "add") {
    const at = String(body.at || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) {
      return json({ error: "日時は 2026-09-10T20:00+09:00 の形で入れてください" }, 400);
    }
    const iso = new Date(at).toISOString();
    if (Number.isNaN(Date.parse(iso))) return json({ error: "日時が読み取れません" }, 400);
    const id = iso.replace(/[^0-9]/g, "").slice(0, 12);
    await env.DEMO_KV.put(`oh:slot:${id}`, JSON.stringify({
      at: iso, dur: Number(body.dur) || 30, url: String(body.url || env.OFFICE_URL || ""),
    }));
    const ids = (await readIndex(env, "ohidx")) || [];
    if (!ids.includes(id)) await env.DEMO_KV.put("ohidx", JSON.stringify([...ids, id]));
    return json({ ok: true, id, at: iso });
  }

  if (op === "remove") {
    const id = String(body.id || "").trim();
    const raw = await env.DEMO_KV.get(`oh:slot:${id}`);
    if (!raw) return json({ error: "その枠はありません" }, 404);
    // 埋まっている枠を黙って消すと、来た人が締め出される
    if (JSON.parse(raw).taken && !body.force) {
      return json({ error: "その枠は予約が入っています。force を付けると消せます" }, 409);
    }
    await env.DEMO_KV.delete(`oh:slot:${id}`);
    const ids = (await readIndex(env, "ohidx")) || [];
    await env.DEMO_KV.put("ohidx", JSON.stringify(ids.filter((x) => x !== id)));
    return json({ ok: true, id });
  }

  if (op === "list") {
    return json({ open: await ohIsOpen(env), slots: await ohSlots(env) });
  }

  // 設定が通っているかを、1件の予定を入れて確かめる。
  // 受け口のURLと合言葉を両方使うので、どこが違うのかがここで分かる。
  // KVには何も書かないので、無料枠は減らない。
  if (op === "caltest") {
    const at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const cal = await toCalendar(env, {
      id: `caltest-${Date.now()}`,
      at, dur: 15,
      title: "テスト：カレンダー連携の確認",
      details: "設定の確認用です。見終わったら消してください。",
      url: "",
    });
    return json({ ok: cal.sent, at, ...cal });
  }

  return json({ error: "op は add / remove / list / open / close / caltest のどれかです" }, 400);
}


/* ============ 提出物の一覧（運営用） ============
   Slackに流れるだけだと、誰がどこまで出したかが分からない。
   溜まったときに「まだ返していないもの」から片づけられるようにする。

   ここは**運営しか開かない画面**なので、一覧（list）を使ってよい。
   受講者が触る経路では使わない（無料枠のいちばん細いところを消費するため）。 */

/** 受講者を全部読む。人数が増えても数十人の想定 */
async function allMembers(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.DEMO_KV.list({ prefix: "member:", cursor });
    for (const k of page.keys) {
      const raw = await env.DEMO_KV.get(k.name);
      if (raw) out.push({ code: k.name.slice("member:".length), ...JSON.parse(raw) });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

/** 提出物の一覧。合鍵が要る。
   本文まで返すと画面が重くなるので、頭だけを返し、全文は1件ずつ取りに来てもらう */
async function listWorks(request, url, env) {
  const key = url.searchParams.get("key") || "";
  if (!env.ASK_ADMIN_KEY || key !== env.ASK_ADMIN_KEY) {
    return json({ error: "鍵が違います" }, 403);
  }
  if (!env.DEMO_KV) return json({ members: [], works: [] });

  const index = await lessonIndex(env);
  const gating = index.filter((e) => e.gates).length;

  const works = [];
  let cursor;
  do {
    const page = await env.DEMO_KV.list({ prefix: "work:", cursor });
    for (const k of page.keys) {
      const raw = await env.DEMO_KV.get(k.name);
      if (!raw) continue;
      const w = JSON.parse(raw);
      works.push({
        id: k.name,
        code: w.code, name: w.name || "", slug: w.slug, label: w.label,
        at: w.at, replied: Boolean(w.replied),
        head: String(w.text || "").slice(0, 80),
        len: String(w.text || "").length,
      });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  works.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const members = [];
  for (const m of await allMembers(env)) {
    const stored = await progressOf(env, m.code);
    const progress = stored === -1 ? firstGating(index) - 1 : stored;
    const mine = works.filter((w) => w.code === m.code);
    members.push({
      code: m.code, name: m.name || "", paidThrough: m.paidThrough ?? -1,
      done: index.filter((e, i) => e.gates && i <= progress).length,
      gating,
      last: mine.length ? mine[0].at : "",
      waiting: mine.filter((w) => !w.replied).length,
    });
  }
  // 返していないものが多い人を先に。次に、間が空いている人
  members.sort((a, b) => (b.waiting - a.waiting) || String(a.last).localeCompare(String(b.last)));

  return json({ members, works, waiting: works.filter((w) => !w.replied).length });
}

/** 提出物1件の全文。合鍵が要る */
async function getWork(request, url, env) {
  const key = url.searchParams.get("key") || "";
  if (!env.ASK_ADMIN_KEY || key !== env.ASK_ADMIN_KEY) {
    return json({ error: "鍵が違います" }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id.startsWith("work:")) return json({ error: "その提出はありません" }, 400);
  const raw = await env.DEMO_KV.get(id);
  if (!raw) return json({ error: "その提出はありません" }, 404);
  return json({ id, ...JSON.parse(raw) });
}

/** 「返した」の印をつける・外す。添削そのものはSlackで返すので、
   ここでは片づいたかどうかだけを持つ */
async function markWork(request, url, env) {
  const key = url.searchParams.get("key") || "";
  if (!env.ASK_ADMIN_KEY || key !== env.ASK_ADMIN_KEY) {
    return json({ error: "鍵が違います" }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id.startsWith("work:")) return json({ error: "その提出はありません" }, 400);
  const raw = await env.DEMO_KV.get(id);
  if (!raw) return json({ error: "その提出はありません" }, 404);
  const w = JSON.parse(raw);
  w.replied = body.replied !== false;
  w.repliedAt = w.replied ? new Date().toISOString() : "";
  // 提出そのものは1年残す。印を付け直しても、その期限は変えない
  await env.DEMO_KV.put(id, JSON.stringify(w), { expirationTtl: 60 * 60 * 24 * 365 });
  return json({ ok: true, id, replied: w.replied });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    const url = new URL(request.url);

    // 教材の配信。合言葉ごとに、開いている回だけを返す
    if (url.pathname === "/me" && request.method === "POST") return handleMe(request, env);
    if (url.pathname === "/lesson" && request.method === "POST") return handleLesson(request, env);
    if (url.pathname === "/slide" && request.method === "GET") return handleSlide(url, env);
    if (url.pathname === "/submit" && request.method === "POST") return handleSubmit(request, env);
    if (url.pathname === "/member" && request.method === "POST") return handleMember(request, url, env);
    if (url.pathname === "/questions" && request.method === "POST") return handleQuestions(request, env);
    if (url.pathname === "/question/hide" && request.method === "POST") return handleHide(request, url, env);
    // 質問への答えを、教材の側に戻す
    if (url.pathname === "/answer" && request.method === "POST") return handleAnswer(request, url, env);

    // 提出物の一覧（運営用）
    if (url.pathname === "/works" && request.method === "POST") return listWorks(request, url, env);
    if (url.pathname === "/work" && request.method === "POST") return getWork(request, url, env);
    if (url.pathname === "/work/mark" && request.method === "POST") return markWork(request, url, env);

    // オフィスアワー。基本は予約制で、在席しているときだけ「いま話せます」を出す
    if (url.pathname === "/oh" && request.method === "POST") return handleOh(request, env);
    if (url.pathname === "/oh/book" && request.method === "POST") return handleOhBook(request, env);
    if (url.pathname === "/oh/cancel" && request.method === "POST") return handleOhCancel(request, env);
    if (url.pathname === "/oh/admin" && request.method === "POST") return handleOhAdmin(request, url, env);

    // 資料ページからの質問。デモの書き換えとは別の入り口にする
    if (url.pathname === "/ask") {
      if (request.method === "GET") return listAsks(url, env);
      if (request.method !== "POST") return json({ error: "POST で送ってください" }, 405);
      return handleAsk(request, env);
    }

    if (request.method !== "POST") return json({ error: "POST で送ってください" }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "読み取れない要求です" }, 400);
    }

    const code = String(body.code || "").trim().toUpperCase();
    const audience = AUDIENCE[body.audience] ? body.audience : "student";
    const text = String(body.text || "").trim();

    if (!text) return json({ error: "問いが空です" }, 400);
    if (text.length > MAX_INPUT) {
      return json({ error: `長すぎます。${MAX_INPUT}文字以内で入れてください` }, 400);
    }

    const gate = await useCode(env, code);
    if (!gate.ok) return json({ error: gate.reason }, 403);

    const prompt = buildPrompt(audience, text);

    // 検査に落ちたら1回だけ作り直させる。2回落ちたら正直に返す
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await askGemini(env, prompt);
      if (out.rateLimited) {
        return json({
          error: "いま混み合っています。20秒ほど待ってから、もう一度送ってください",
          retry: true, retryAfterSeconds: 20,
        }, 429);
      }
      if (out.error) return json({ error: out.error }, 502);

      const problems = check(out.result, text);
      if (problems.length === 0) {
        if (env.DEMO_KV) {
          // 利用ログ。30日で自動的に消える
          await env.DEMO_KV.put(
            `log:${Date.now()}:${code}`,
            JSON.stringify({ code, audience, input: text, ...out.result }),
            { expirationTtl: 60 * 60 * 24 * 30 }
          );
        }
        return json({ question: out.result.question.trim(), explanation: out.result.explanation.trim() });
      }
      if (attempt === 1) {
        return json({ error: "うまく書き換えられませんでした。言い回しを変えて、もう一度試してください", retry: true }, 422);
      }
    }
    // ここには来ない想定。来たときに応答なしで落ちないための保険
    return json({ error: "うまく書き換えられませんでした。もう一度試してください", retry: true }, 500);
  },
};

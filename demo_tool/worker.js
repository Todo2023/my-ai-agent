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
/* 同じ人からの連投を止める。1時間に何件まで受けるか */
const ASK_PER_HOUR = 10;
const MAX_QUESTION = 90;
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

/** Slackへ流す。webhookが無ければ何もしない（呼び出し側はKVに残す） */
async function toSlack(env, q) {
  if (!env.SLACK_WEBHOOK_URL) return { sent: false, reason: "webhook未設定" };
  const where = q.slide ? `${q.lesson}／スライド ${q.slide}` : q.lesson;
  const text = `:raising_hand: *${where}* ／ ${q.name}\n>>> ${q.text}`;
  try {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
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
  if (env.DEMO_KV) {
    await env.DEMO_KV.put(`ask:${Date.now()}`, JSON.stringify(q), {
      expirationTtl: 60 * 60 * 24 * 180,
    });
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
    if (v) questions.push(JSON.parse(v));
  }
  return json({ questions: questions.reverse() });
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

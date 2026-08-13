/*
  マッチング生成（Claude API）

  ここだけがサーバー側で動く。理由はひとつ、**APIキーをブラウザに置けない**から。
  キーが漏れると第三者に使われ、上限なく課金される。

  ── 費用の歯止め（CLAUDE.md の決まり） ──
   1. キーは環境変数から読む。コードにもブラウザにも書かない
   2. 自動実行しない。管理画面のボタンを人が押したときだけ動く
   3. 1回で照合する人数（MAX_CANDIDATES）と作る件数（MAX_MATCHES）に上限
   4. max_tokens を明示
   5. usage を generation_logs に必ず記録する（失敗しても記録する）

  ── デプロイ ──
    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
    supabase functions deploy generate-matches

  ── 呼び出し（管理画面から） ──
    POST /functions/v1/generate-matches
    Authorization: Bearer <ログイン中の管理者のアクセストークン>
    { "from_profile": "<uuid>", "dry_run": false }
*/

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

/* ══════════════════════════════════════════
   ここが費用の上限。触るときは影響を考えること
   ══════════════════════════════════════════ */
const MODEL = "claude-opus-5";
const MAX_CANDIDATES = 12;   // 1回の実行で読み込む相手の数
const MAX_MATCHES = 3;       // 1回の実行で作る提案の数
const MAX_TOKENS = 8000;     // 1回の出力量の上限
const EFFORT = "medium";     // low | medium | high | xhigh | max

// 100万トークンあたりの単価（2026年8月時点の Opus 5）。
// 記録用の概算にだけ使う。請求の正はコンソール側。
const PRICE_IN = 5.0;
const PRICE_OUT = 25.0;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/* 相手に渡してよい形にプロフィールを整える。
   公開範囲（visibility）の指定は、ここで必ず効かせる。 */
function forPrompt(p: Record<string, unknown>, hideName: boolean) {
  return {
    id: p.id,
    name: hideName ? "（氏名は非公開）" : p.name,
    organization: p.organization,
    title: p.title,
    industry: p.industry,
    org_size: p.org_size ?? null,
    region: p.region,
    background: p.background,
    current_work: p.current_work,
    strengths: p.strengths,
    target_profile: p.target_profile,
    purpose_tags: p.purpose_tags,
    purpose_other: p.purpose_other ?? null,
    pain_points: p.pain_points ?? null,
    near_term_goals: p.near_term_goals ?? null,
    offerable_resources: p.offerable_resources ?? null,
  };
}

const hidesName = (p: Record<string, unknown>) =>
  typeof p.visibility === "string" && p.visibility.startsWith("所属");

const SYSTEM = `あなたは、経営者と研究者をつなぐ人です。

いま手元に、ある登録者（本人）のプロフィールと、候補者たちのプロフィールがあります。
本人が「会ってよかった」と思える相手を選び、会う理由と、最初に送るメッセージの下書きを作ってください。

## 選ぶときに重く見ること

肩書きや業種が近いことは、良い出会いの理由になりません。重いのは次の順です。

1. 片方の pain_points / near_term_goals（困っていること）に、
   もう片方の offerable_resources / strengths（渡せるもの）が噛み合っているか
2. current_work（いま動かしていること）どうしが、具体的に接続するか
3. target_profile（会いたい相手像）と purpose_tags（会う目的）に矛盾がないか
4. region（拠点）や org_size（規模）は、最後に少しだけ考える程度

**噛み合う相手がいなければ、無理に挙げないでください。** 0件で構いません。
人数を合わせるために薄い理由を書くと、この仕組み全体の信頼がなくなります。

## 書き方

- reason … 本人に見せる文章。「あなたの◯◯という課題に対して、△△さんは□□を持っています」
  のように、**両者のプロフィールの具体的な記述を根拠として引きながら**、3〜5文で書く。
- message_draft … 本人が相手に送る想定の文面。日本語の敬体。150〜250字。
  本人が名乗り、なぜ連絡したのかを述べ、短い時間の会話を提案して終わる。
  署名や宛名の定型（「〇〇株式会社 御中」など）は入れない。
- score … 0〜100。噛み合いの強さ。60未満なら、そもそも挙げない。

## してはいけないこと

- プロフィールに書かれていないことを推測して書かない（勤務先の規模、実績、意欲など）
- 「（氏名は非公開）」となっている相手の氏名を作らない
- 誇張しない。「必ず」「間違いなく」といった断定を使わない
- 送信を促す文（「すぐご連絡ください」）は入れない。送るかどうかは本人が決めます`;

const SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidate_id: { type: "string", description: "候補者の id をそのまま" },
          score: { type: "integer", description: "0〜100。60未満なら挙げない" },
          reason: { type: "string", description: "会うと良さそうな理由。3〜5文" },
          message_draft: { type: "string", description: "初回メッセージ案。150〜250字" },
        },
        required: ["candidate_id", "score", "reason", "message_draft"],
        additionalProperties: false,
      },
    },
  },
  required: ["matches"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST してください" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

  if (!API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY が未設定です。supabase secrets set で入れてください。" }, 500);
  }

  // ── 管理者かどうかを確かめる ──────────────────
  // 呼び出した本人の権限で admins を引く。RLS を素通りする service_role では確かめない。
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: isAdmin, error: adminErr } = await asCaller.rpc("is_admin");
  if (adminErr || isAdmin !== true) {
    return json({ error: "管理者としてログインしてください。" }, 403);
  }

  // ここから先はデータを読む必要があるので service_role を使う（サーバー内だけ）
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { from_profile?: string; dry_run?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON が読めません" }, 400);
  }
  if (!body.from_profile) return json({ error: "from_profile が要ります" }, 400);

  // ── 本人 ──────────────────────────────
  const { data: me, error: meErr } = await db
    .from("profiles").select("*").eq("id", body.from_profile).single();
  if (meErr || !me) return json({ error: "そのプロフィールが見つかりません" }, 404);
  if (me.ai_consent !== true) {
    return json({ error: "この方はAI生成に同意していません。生成しません。" }, 400);
  }

  // ── 候補（自分以外・同意済み・まだ提案していない相手） ──
  const { data: done } = await db
    .from("matches").select("to_profile").eq("from_profile", me.id);
  const already = new Set((done ?? []).map((r) => r.to_profile as string));
  already.add(me.id);

  const { data: pool, error: poolErr } = await db
    .from("profiles").select("*")
    .eq("ai_consent", true).eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(MAX_CANDIDATES + already.size);
  if (poolErr) return json({ error: "候補の取得に失敗しました: " + poolErr.message }, 500);

  const candidates = (pool ?? [])
    .filter((p) => !already.has(p.id))
    .slice(0, MAX_CANDIDATES);   // ← ここが人数の上限

  if (candidates.length === 0) {
    return json({ ok: true, matches_created: 0, note: "まだ照合できる相手がいません。" });
  }

  const prompt = [
    "# 本人",
    JSON.stringify(forPrompt(me, false), null, 2),
    "",
    `# 候補者（${candidates.length}名）`,
    JSON.stringify(candidates.map((p) => forPrompt(p, hidesName(p))), null, 2),
    "",
    `本人にとって噛み合う相手を、**多くても${MAX_MATCHES}名**選んでください。`,
    "噛み合う相手がいなければ matches を空の配列にしてください。",
  ].join("\n");

  // ── 生成しない確認モード（費用ゼロ） ──
  if (body.dry_run) {
    return json({
      ok: true, dry_run: true, candidates: candidates.length,
      note: `${candidates.length}名と照合します。まだ Claude API は呼んでいません（費用ゼロ）。`,
    });
  }

  const anthropic = new Anthropic({ apiKey: API_KEY });
  const log = {
    from_profile: me.id, model: MODEL, candidates: candidates.length,
    input_tokens: 0, output_tokens: 0, matches_created: 0,
    est_cost_usd: 0, stop_reason: null as string | null, error: null as string | null,
  };

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });

    log.input_tokens = res.usage.input_tokens;
    log.output_tokens = res.usage.output_tokens;
    log.est_cost_usd =
      (res.usage.input_tokens / 1e6) * PRICE_IN + (res.usage.output_tokens / 1e6) * PRICE_OUT;
    log.stop_reason = res.stop_reason ?? null;

    // 安全側の判定で生成が断られた場合。content が空のことがあるので先に見る
    if (res.stop_reason === "refusal") {
      log.error = "モデルが生成を断りました";
      await db.from("generation_logs").insert(log);
      return json({ error: "生成が断られました。入力内容を確認してください。" }, 422);
    }

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("応答に本文がありません");

    const parsed = JSON.parse(text.text) as {
      matches: { candidate_id: string; score: number; reason: string; message_draft: string }[];
    };

    const valid = new Set(candidates.map((c) => c.id));
    const rows = (parsed.matches ?? [])
      .filter((m) => valid.has(m.candidate_id))   // 実在しない id を作ってきたら捨てる
      .filter((m) => m.score >= 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES)                       // ← ここが件数の上限
      .map((m) => ({
        from_profile: me.id,
        to_profile: m.candidate_id,
        score: m.score,
        reason: m.reason,
        message_draft: m.message_draft,
        status: "pending",                          // ★ 承認するまで外に出さない
        model: MODEL,
      }));

    if (rows.length > 0) {
      const { error: insErr } = await db.from("matches").insert(rows);
      if (insErr) throw new Error("保存に失敗: " + insErr.message);
    }
    log.matches_created = rows.length;
    await db.from("generation_logs").insert(log);

    return json({
      ok: true,
      matches_created: rows.length,
      candidates: candidates.length,
      usage: { input_tokens: log.input_tokens, output_tokens: log.output_tokens },
      est_cost_usd: Number(log.est_cost_usd.toFixed(5)),
    });
  } catch (e) {
    log.error = String(e instanceof Error ? e.message : e);
    await db.from("generation_logs").insert(log);   // 失敗も必ず記録する
    return json({ error: log.error }, 500);
  }
});

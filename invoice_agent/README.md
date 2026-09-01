# 請求書作成エージェント

自然文の指示から請求書PDFを作るエージェントです。Excelの請求データを読み、
実際の請求書フォーマット（発行者情報・請求書番号・税率区分・支払期日）でPDFを出力します。

```
$ uv run graph_agent.py "A社の請求書を、割引10%つけて作って"
指示: A社の請求書を、割引10%つけて作って
次の要求には対応していません: 割引10%
A社の標準フォーマットの請求書（これらを反映しないもの）を作成してよいですか？（はい/いいえ）
> はい
A社の請求書を作成しました（invoice_A社.pdf）。

なお、次の要求には対応していないため反映されていません: 割引10%
```

このリポジトリのカリキュラム（ルート `README.md`）のゲート1〜5を、この題材で一通り通過済みです。
**同じ題材に対して素朴な実装（`agent.py`）と構造化した実装（`graph_agent.py`）の2つが残してあり、
その差分がこのディレクトリの学習資産**にあたります。

## セットアップ

依存管理は uv を使います。

```bash
cd invoice_agent
uv sync
```

APIキーは `.env` から読み込みます（`GEMINI_API_KEY`）。
[Google AI Studio](https://aistudio.google.com/apikey) で無料発行できます。

```bash
echo 'GEMINI_API_KEY=＜取得したキー＞' > .env
```

PDFの日本語フォントとして IPAゴシック（`/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf`）を
使います。無い場合は `invoice.py` の `FONT_PATH` を環境に合わせて書き換えてください。

## 実行方法

```bash
uv run graph_agent.py "A社の請求書を作って"    # ゲート3版：LangGraphワークフロー（現行の本命）
uv run agent.py "A社の請求書を作って"          # ゲート1版：LLMにツールを選ばせる素朴な実装
uv run gate2_run.py                            # ゲート2：失敗ケース30件の一括実行
uv run eval_run.py <モデル名>                  # ゲート4：評価データセット22件を実行
uv run trace_export.py                         # ゲート5：実行トレースを画面用に書き出す
```

`trace_export.py` は、`graph.stream()` でノードの実行順を外から観測して
`docs/trace_data.js` を書き出すスクリプトです（`graph_agent.py` には手を入れていません）。
書き出すと `docs/agent_office.html` をローカルで開いたときに、請求書部が実測のレイテンシ・
トークン数つきの実ログに切り替わります。出力はコミットしません（`.gitignore` 済み）。
承認ゲートの回答はスクリプト内の台本で与えます。**本番の承認を自動化するものではありません。**
実行すると実際に `generate` ノードまで通るため、サンプルPDFが作られ請求書番号の連番も進みますが、
実行の前後で `invoice_counter.json` を退避・復元し、増えたPDFは自動で削除します
（**本番の採番はずれません**）。

`make_sample_data.py` / `make_template.py` はサンプルのExcelデータとテンプレートを生成する
スクリプトです。`test_llm.py` はAPIキーの疎通確認だけを行う使い捨てスクリプトです。

## 構成

| ファイル | 役割 |
| --- | --- |
| `graph_agent.py` | ゲート3版。LangGraphでワークフローを分解した現行の本命実装 |
| `agent.py` | ゲート1版。LLMにツールを選ばせる素朴な実装。ゲート2の分析対象なので残してある |
| `invoice.py` | Excelを読んでPDFを作る決定的な処理。**LLMは一切登場しない** |
| `eval_run.py` / `eval_dataset.json` | ゲート4の評価データセット（22件）と実行スクリプト |
| `gate2_run.py` | ゲート2の失敗ケース30件を一括実行するスクリプト |
| `trace_export.py` | ゲート5の説明用画面（`docs/agent_office.html`）に流す実行トレースを書き出す |
| `gate2_findings.md` 〜 `gate5_blog_draft.md` | 各ゲートの成果物（失敗分析・設計メモ・計測結果・デモノート・記事ドラフト） |
| `eval_results_<モデル名>.json` | 評価の生データ（1ケースごとの成否・レイテンシ・トークン数） |

## 設計の要点

`graph_agent.py` の冒頭docstringに、ゲート2で見つかった問題と設計上の対応が対応付けて
書いてあります。要点は次の3つです。

1. **LLMの仕事は情報抽出だけ**（`parse` ノード）。実行するツールをLLM自身に選ばせず、
   ユーザーに見せる最終的な文章もコード側で組み立てます。ゲート2で出た
   「対応していない機能を『対応しました』と嘘の報告をする」失敗を構造的に潰すためです。
2. **表記ゆれの吸収・計算・PDF生成は決定的なコード**（`resolve_customer` ノード、`invoice.py`）。
   「a社」「A社様」の正規化はLLMではなく `difflib` で解決しています。
3. **不可逆な操作（PDF確定）の前に人間の承認ゲート**（`ask_confirm` / `ask_customer` ノードの
   LangGraph `interrupt`）。顧客名が特定できないとき、未対応の要求が含まれるときは、
   推測せず必ず人に聞き返します。

状態は `checkpoints.sqlite`（`langgraph-checkpoint-sqlite`）に保存され、途中で失敗しても
最初からやり直しにはなりません。

ワークフロー図（どのノードがLLM判断で、どこが固定処理か）は `gate3_notes.md` にあります。

## 計測結果（ゲート4）

評価データセット22件、モデル2種の比較。詳細と考察は `gate4_findings.md` にあります。

| モデル | 成功率 | LLM呼び出し平均レイテンシ | 平均トークン数/件 |
| --- | --- | --- | --- |
| gemma-4-26b-a4b-it（小型・MoE） | 90.9%（20/22） | 1.14秒 | 219.6 |
| gemma-4-31b-it（大型） | 68.2%（15/22） | 1.48秒 | 223.2 |

LLM呼び出しは1リクエストあたり常に1回（`parse` ノードのみ）のため、レイテンシとコストの
ほぼ全てがこの1回に由来します。**大きいモデルの方が成功率が低かった**という結果の分析は
`gate4_findings.md` を参照してください。

## 注意

- `.env` とAPIキーはコミットしないでください。
- 生成されるPDF・`invoice_counter.json`・`checkpoints.sqlite` は実行時の生成物です。
- `eval_results_<モデル名>.json` は測定の生データです。再測定するときは、いつ・何を変えたかを
  `gate4_findings.md` に併記してください（数値だけ差し替えない）。

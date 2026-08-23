"""「ひろば」の物語生成。

飼い主ではなく「〇〇ちゃん」目線で、その子が一人称で語る短い日記を作る。
町の4施設のうち、AIが本文を書くのは「ひろば」（うちの子紹介）だけ。
質問・学び・グッズは飼い主の言葉をそのまま残す（town.py を参照）。
投稿のきっかけによって3つの方式を使い分ける。

    A: 一言投稿 → AI脚色      通院・体調変化など、事実を外せない場面
    B: 定期質問 → AI自動生成  特に予定のない日。投稿ハードルが最も低い
    C: 写真 → AI解析 → 物語化 誕生日・季節イベントなどの特別な瞬間

分岐は「プロンプトのどのテンプレートを使うか」だけ。処理の流れは3方式で共通にしてある。
DEMO_MODE=1 や APIキー未設定のときは、LLMを呼ばずにテンプレートで組み立てる。
"""

from __future__ import annotations

import datetime
import hashlib

import llm
import town
from models import Member

POST_TYPES = {
    "A": "一言からふくらませる",
    "B": "今日の質問に答える",
    "C": "写真から物語にする",
}
DEFAULT_POST_TYPE = "B"

# 方式Bで使う質問。予定のない日でも答えられる、短くて具体的なものだけにする。
QUESTIONS = [
    "今日はどこで、どんな格好でお昼寝していましたか？",
    "今日いちばん張り切っていたのは、どんな時でしたか？",
    "今日のごはんの食べっぷりはどうでしたか？",
    "今日、あなたのことをじっと見つめてきた瞬間はありましたか？",
    "今日いちばん大きな音を立てたのは、何をしていた時ですか？",
    "今日の散歩（または窓の外の観察）で、気になっていたものは何でしたか？",
    "今日、いちばん甘えてきたのはいつでしたか？",
    "今日のいたずらや、思わず笑ってしまった失敗はありましたか？",
    "今日はどんな声で鳴きましたか？何かを伝えたそうでしたか？",
    "今日、お気に入りのおもちゃや場所はどれでしたか？",
    "今日の毛づくろい・ブラッシングの時間はどんな様子でしたか？",
    "今日、あなたが帰ってきた時のお出迎えはどんな感じでしたか？",
    "今日は誰か（人でも動物でも）に会いましたか？その時の反応は？",
    "今日、いつもと違うなと感じたことはありましたか？",
    "今日いちばん長くいた場所はどこでしたか？",
]

# ハンドオフ資料 3-1 のプロンプト方針をそのまま使う
STORY_PROMPT = """あなたは{pet_name}（種類: {pet_type}, 犬種/猫種: {breed}）の視点で日記を書くAIです。
以下の情報をもとに、{pet_name}が一人称で語る短い物語（150-250字程度）を日本語で作成してください。
飼い主への感謝や愛情がにじむ、あたたかいトーンにしてください。
出力は物語本文のみ、前置きや説明は一切不要です。

守ること:
- 与えられた情報に無いできごとを作らない（特に通院や体調の話では、事実を足さない）
- 健康や治療についての助言・診断めいた表現は書かない
- {pet_name}の一人称で書く

{context}
"""

CONTEXT_TEMPLATES = {
    "A": "飼い主からの一言: {raw_input}",
    "B": "今日の質問: {question}\n回答: {raw_input}",
    "C": "画像から読み取れる情景: {raw_input}",
}

# 方式C の1段目。写真から「何が写っているか」だけを取り出す
IMAGE_PROMPT = """このペットの写真から読み取れることを、日本語で3文以内にまとめてください。
表情・姿勢・場所・光の様子・一緒に写っているものなど、目に見える事実だけを書いてください。
推測や物語にはせず、見えたままを書いてください。出力は本文のみ。"""


def normalize_post_type(value: str | None) -> str:
    """'A' / 'B' / 'C' に寄せる。不明なら既定の方式B。"""
    text = (value or "").strip().upper()
    return text if text in POST_TYPES else DEFAULT_POST_TYPE


def should_remember_default(member: Member, chosen: str, first_post: bool,
                           explicit: bool = False) -> bool:
    """選んだ方式を既定として覚えるかどうか。

    資料の方針は「初回選択をデフォルトとして記憶。以降はワンタップ投稿＋都度変更可」。
    つまり2回目以降に別の方式を選んでも、それは"今回だけ"の変更として扱い、
    既定は書き換えない（explicit=True のときだけ書き換える）。
    """
    chosen = normalize_post_type(chosen)
    if chosen == member.default_post_type:
        return False
    return first_post or explicit


def question_for(member: Member, on_date: datetime.date | None = None) -> str:
    """方式Bの「今日の質問」。

    同じ人が同じ日に何度開いても同じ質問になり、翌日には変わるように、
    会員IDと日付から決定的に選ぶ（ランダムにすると再現できず、検証が面倒になる）。
    """
    on_date = on_date or datetime.date.today()
    seed = f"{member.id}:{on_date.isoformat()}".encode()
    index = int(hashlib.sha256(seed).hexdigest(), 16) % len(QUESTIONS)
    return QUESTIONS[index]


def analyze_image(image_path: str) -> str:
    """方式C の1段目。写真から情景を取り出す。"""
    if not llm.available():
        return "（デモ）窓辺の光の中で、こちらをまっすぐ見ている。"
    return llm.call(IMAGE_PROMPT, image_path=image_path)


def _template_story(member: Member, post_type: str, raw_input: str, question: str) -> str:
    """LLMを呼べないときの代替。物語というより記録に近い文章になる。"""
    name = member.pet_name or member.nickname
    intro = {
        "A": f"きょう、うちの人はこう言っていた。「{raw_input}」",
        "B": f"きょう聞かれたのは「{question}」ということ。{raw_input}",
        "C": f"きょうの写真には、こんな景色がのこった。{raw_input}",
    }[post_type]
    return (
        f"わたしは{name}。{intro}\n"
        "うちの人はいつもそばにいてくれる。それだけで、きょうもいい日だった。\n"
        "（この文章はテンプレートです。GEMINI_API_KEY を設定すると、LLMが物語を書きます。）"
    )


def generate_story(member: Member, post_type: str, raw_input: str = "",
                   question: str = "", image_path: str | None = None) -> tuple[str, str]:
    """物語を1本作る。

    戻り値: (posts.raw_input に保存する入力, 生成された物語本文)

    方式Cは2段構え。まず写真から情景を取り出し、その文章を入力として物語にする。
    こうすると raw_input に「何が写っていたか」が残り、後から検証できる。
    """
    post_type = normalize_post_type(post_type)

    if post_type == "C":
        if not image_path and not raw_input:
            raise ValueError("方式Cには画像（--image）が必要です。")
        raw_input = raw_input or analyze_image(image_path)
    if post_type == "B" and not question:
        question = question_for(member)
    if post_type == "A" and not raw_input.strip():
        raise ValueError("方式Aには飼い主の一言が必要です。")

    if not llm.available():
        return raw_input, _template_story(member, post_type, raw_input, question)

    context = CONTEXT_TEMPLATES[post_type].format(raw_input=raw_input, question=question)
    prompt = STORY_PROMPT.format(
        pet_name=member.pet_name or member.nickname,
        pet_type="犬" if member.pet_type == "dog" else "猫",
        breed=member.breed or "不明",
        context=context,
    )
    story = llm.call(prompt)
    if not story.strip():
        # 空返しはそのまま保存しない。テンプレートに落として運用を止めない
        return raw_input, _template_story(member, post_type, raw_input, question)
    return raw_input, story.strip()


def compose(member: Member, category: str, text: str = "", post_type: str = "",
            question: str = "", image_path: str | None = None) -> tuple[str, str]:
    """投稿1本を作る。戻り値: (保存する入力, 表示する本文)

    「ひろば」だけAIがペット目線の物語にする。
    ほかの施設は飼い主の言葉をそのまま本文にする。相談や質問をAIに書き直させると、
    事実でないことが混ざって相談として成立しなくなるため。
    """
    category = town.normalize(category)
    if town.writes_story(category):
        return generate_story(member, post_type or member.default_post_type,
                              raw_input=text, question=question, image_path=image_path)
    if not text.strip():
        raise ValueError(f"「{town.place(category)}」への投稿には本文が必要です。")
    return text.strip(), text.strip()

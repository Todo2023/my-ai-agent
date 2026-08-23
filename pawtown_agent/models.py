"""members / posts / matches の型と、Googleフォーム回答の正規化。

フォームの回答は表記ゆれが多い（全角スペース、「、」区切り、「東京都 世田谷区」など）。
LLMに渡す前にここで決定的に整形しておく。整形をLLMに任せると、
同じ人が実行のたびに違うタグを持つことになり、スコアが再現しなくなる。
"""

from __future__ import annotations

import dataclasses
import re
import unicodedata

# フォームの複数選択は「, 」「、」「/」「・」いずれの区切りでも来うる
_SPLIT_PATTERN = re.compile(r"[,、/・\n]+")

PET_TYPES = {
    "dog": "dog",
    "犬": "dog",
    "いぬ": "dog",
    "イヌ": "dog",
    "cat": "cat",
    "猫": "cat",
    "ねこ": "cat",
    "ネコ": "cat",
}


def normalize_text(value) -> str:
    """全角/半角と空白を揃えた文字列にする。None は空文字。"""
    if value is None:
        return ""
    text = unicodedata.normalize("NFKC", str(value))
    return re.sub(r"\s+", " ", text).strip()


def normalize_tags(value) -> list[str]:
    """複数選択の回答をタグのリストにする。順序は保つが重複は落とす。"""
    if value is None:
        return []
    items = value if isinstance(value, (list, tuple)) else _SPLIT_PATTERN.split(str(value))
    tags = []
    for item in items:
        tag = normalize_text(item)
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def normalize_pet_type(value) -> str:
    """「犬」「イヌ」「dog」などを 'dog' / 'cat' に寄せる。"""
    text = normalize_text(value).lower()
    for key, canonical in PET_TYPES.items():
        if key in text:
            return canonical
    raise ValueError(f"ペットの種類を判別できません: {value!r}（犬 か 猫 で入力してください）")


def _post_type(value) -> str:
    """投稿方式を 'A' / 'B' / 'C' に寄せる。不明なら既定の方式B。"""
    text = normalize_text(value).upper()
    return text if text in ("A", "B", "C") else "B"


def _to_float(value):
    text = normalize_text(value)
    if not text:
        return None
    # 「3歳」「約3」なども拾う。取れなければ None（年齢はスコアに必須ではない）
    found = re.search(r"\d+(?:\.\d+)?", text)
    return float(found.group()) if found else None


@dataclasses.dataclass
class Member:
    id: str
    nickname: str
    email: str
    pet_type: str
    pet_name: str = ""  # 物語の主役。UI上はこの名前で人格化して表示する
    breed: str = ""
    pet_age: float | None = None
    personality_tags: list[str] = dataclasses.field(default_factory=list)
    concern_tags: list[str] = dataclasses.field(default_factory=list)
    area: str = ""
    default_post_type: str = "B"  # 初回に選んだ投稿方式を既定として覚える
    points: int = 0

    @classmethod
    def from_row(cls, row: dict) -> "Member":
        """Supabase の1行（または整形済みフォーム回答）から Member を作る。"""
        return cls(
            id=str(row.get("id", "")),
            nickname=normalize_text(row.get("nickname")),
            email=normalize_text(row.get("email")),
            pet_type=normalize_pet_type(row.get("pet_type")),
            pet_name=normalize_text(row.get("pet_name")),
            breed=normalize_text(row.get("breed")),
            pet_age=_to_float(row.get("pet_age")),
            personality_tags=normalize_tags(row.get("personality_tags")),
            concern_tags=normalize_tags(row.get("concern_tags")),
            area=normalize_text(row.get("area")),
            default_post_type=_post_type(row.get("default_post_type")),
            points=int(row.get("points") or 0),
        )

    @property
    def display_name(self) -> str:
        """物語の主役名。未登録ならニックネームで代用する。"""
        return self.pet_name or self.nickname

    def to_prompt_dict(self) -> dict:
        """LLMに渡す形。メールアドレスは含めない（渡す必要がないので渡さない）。"""
        return {
            "id": self.id,
            "nickname": self.nickname,
            "pet_name": self.display_name,
            "pet_type": "犬" if self.pet_type == "dog" else "猫",
            "breed": self.breed or "不明",
            "pet_age": self.pet_age,
            "personality_tags": self.personality_tags,
            "concern_tags": self.concern_tags,
            "area": self.area or "不明",
        }


@dataclasses.dataclass
class Post:
    """物語1本。raw_input には生成のもとになった入力を必ず残す。

    「なぜこの物語になったのか」を後から追えないと、質が悪かったときに
    入力が悪いのかプロンプトが悪いのかを切り分けられなくなる。
    """

    id: str
    member_id: str
    post_type: str
    raw_input: str
    generated_story: str
    created_at: str = ""

    @classmethod
    def from_row(cls, row: dict) -> "Post":
        return cls(
            id=str(row.get("id", "")),
            member_id=str(row.get("member_id", "")),
            post_type=_post_type(row.get("post_type")),
            raw_input=row.get("raw_input") or "",
            generated_story=row.get("generated_story") or "",
            created_at=str(row.get("created_at") or ""),
        )


@dataclasses.dataclass
class Match:
    id: str
    member_a_id: str
    member_b_id: str
    match_score: float
    match_reason: str
    status: str = "pending"
    token_a: str = ""
    token_b: str = ""

    @classmethod
    def from_row(cls, row: dict) -> "Match":
        return cls(
            id=str(row.get("id", "")),
            member_a_id=str(row.get("member_a_id", "")),
            member_b_id=str(row.get("member_b_id", "")),
            match_score=float(row.get("match_score") or 0),
            match_reason=row.get("match_reason") or "",
            status=row.get("status") or "pending",
            token_a=row.get("token_a") or "",
            token_b=row.get("token_b") or "",
        )

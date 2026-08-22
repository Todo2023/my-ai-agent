"""マッチ候補の事前スコアリング（決定的な処理）。

全メンバーをLLMに投げるとトークン代も遅延も線形に増えるうえ、
「犬種が同じ」「悩みが重なる」といった判定はコードで確実に書ける。
ここで上位N名まで機械的に絞り、最終的な順位付けと紹介文だけをLLMに任せる。

スコアは内訳（breakdown）付きで返す。落選理由を説明できるようにするため、
またエラー分析のときに「プロンプトが悪いのか候補選びが悪いのか」を
切り分けられるようにするため。
"""

from __future__ import annotations

from models import Member

# 満点=100 になるよう配分する
WEIGHTS = {
    "pet_type": 25,   # 犬同士 / 猫同士か
    "breed": 20,      # 犬種・猫種の一致度
    "concern": 35,    # 悩みカテゴリの重なり（マッチの主目的なので最大）
    "area": 15,       # エリアの近さ（任意項目なので控えめ）
    "personality": 5, # 性格タグの重なり（おまけ）
}

# 犬種・猫種のゆるいグループ分け。完全一致でなくても「近い」と見なすため。
# 網羅は狙わない（フォームの選択肢に合わせて随時足す）。
BREED_GROUPS = {
    "小型犬": ["トイプードル", "チワワ", "ダックスフンド", "ミニチュアダックスフンド",
              "ポメラニアン", "ヨークシャーテリア", "マルチーズ", "シーズー", "パグ"],
    "中型犬": ["柴犬", "コーギー", "ウェルシュコーギー", "ビーグル", "ボーダーコリー",
              "フレンチブルドッグ", "日本スピッツ"],
    "大型犬": ["ゴールデンレトリバー", "ラブラドールレトリバー", "秋田犬", "シベリアンハスキー",
              "バーニーズマウンテンドッグ", "ドーベルマン"],
    "短毛猫": ["アメリカンショートヘア", "ロシアンブルー", "アビシニアン", "ベンガル",
              "シャム", "日本猫", "雑種"],
    "長毛猫": ["ペルシャ", "メインクーン", "ラグドール", "ノルウェージャンフォレストキャット",
              "スコティッシュフォールド", "ソマリ"],
}

# 都道府県 → 地方。同一県でなくても同じ地方なら少し加点する。
REGIONS = {
    "北海道": "北海道", "青森県": "東北", "岩手県": "東北", "宮城県": "東北",
    "秋田県": "東北", "山形県": "東北", "福島県": "東北",
    "茨城県": "関東", "栃木県": "関東", "群馬県": "関東", "埼玉県": "関東",
    "千葉県": "関東", "東京都": "関東", "神奈川県": "関東",
    "新潟県": "中部", "富山県": "中部", "石川県": "中部", "福井県": "中部",
    "山梨県": "中部", "長野県": "中部", "岐阜県": "中部", "静岡県": "中部", "愛知県": "中部",
    "三重県": "近畿", "滋賀県": "近畿", "京都府": "近畿", "大阪府": "近畿",
    "兵庫県": "近畿", "奈良県": "近畿", "和歌山県": "近畿",
    "鳥取県": "中国", "島根県": "中国", "岡山県": "中国", "広島県": "中国", "山口県": "中国",
    "徳島県": "四国", "香川県": "四国", "愛媛県": "四国", "高知県": "四国",
    "福岡県": "九州", "佐賀県": "九州", "長崎県": "九州", "熊本県": "九州",
    "大分県": "九州", "宮崎県": "九州", "鹿児島県": "九州", "沖縄県": "九州",
}

_BREED_TO_GROUP = {
    breed: group for group, breeds in BREED_GROUPS.items() for breed in breeds
}


def breed_group(breed: str) -> str:
    """犬種・猫種名からグループ名を返す。分からなければ空文字。"""
    if not breed:
        return ""
    if breed in _BREED_TO_GROUP:
        return _BREED_TO_GROUP[breed]
    # 「トイプードル（レッド）」のような表記ゆれを拾う
    for name, group in _BREED_TO_GROUP.items():
        if name in breed or breed in name:
            return group
    return ""


def prefecture(area: str) -> str:
    """「東京都世田谷区」→「東京都」。判定できなければ空文字。"""
    for name in REGIONS:
        if area.startswith(name):
            return name
    return ""


def _overlap_ratio(a: list[str], b: list[str]) -> float:
    """Jaccard係数。どちらかが空なら0。"""
    set_a, set_b = set(a), set(b)
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


def score(target: Member, candidate: Member) -> dict:
    """2人の相性を 0-100 で返す。内訳と共有タグも一緒に返す。"""
    breakdown = {}

    breakdown["pet_type"] = WEIGHTS["pet_type"] if target.pet_type == candidate.pet_type else 0.0

    if target.breed and candidate.breed and target.breed == candidate.breed:
        breakdown["breed"] = float(WEIGHTS["breed"])
    else:
        group_t, group_c = breed_group(target.breed), breed_group(candidate.breed)
        if group_t and group_t == group_c:
            breakdown["breed"] = WEIGHTS["breed"] * 0.6
        elif target.pet_type == candidate.pet_type:
            breakdown["breed"] = WEIGHTS["breed"] * 0.2
        else:
            breakdown["breed"] = 0.0

    shared_concerns = [tag for tag in target.concern_tags if tag in candidate.concern_tags]
    breakdown["concern"] = WEIGHTS["concern"] * _overlap_ratio(
        target.concern_tags, candidate.concern_tags
    )

    pref_t, pref_c = prefecture(target.area), prefecture(candidate.area)
    if pref_t and pref_t == pref_c:
        breakdown["area"] = float(WEIGHTS["area"])
    elif pref_t and pref_c and REGIONS[pref_t] == REGIONS[pref_c]:
        breakdown["area"] = WEIGHTS["area"] * 0.5
    else:
        breakdown["area"] = 0.0

    shared_personality = [
        tag for tag in target.personality_tags if tag in candidate.personality_tags
    ]
    breakdown["personality"] = WEIGHTS["personality"] * _overlap_ratio(
        target.personality_tags, candidate.personality_tags
    )

    return {
        "candidate_id": candidate.id,
        "score": round(sum(breakdown.values()), 1),
        "breakdown": {key: round(value, 1) for key, value in breakdown.items()},
        "shared_concerns": shared_concerns,
        "shared_personality": shared_personality,
        "same_prefecture": bool(pref_t) and pref_t == pref_c,
    }


def shortlist(target: Member, candidates: list[Member], limit: int = 10,
              min_score: float = 30.0) -> list[dict]:
    """LLMに渡す候補を上位 limit 名に絞る。

    min_score 未満は「そもそも紹介する意味がない」として落とす。
    ここで0件になったら、LLMを呼ばずにマッチなしとして扱う（無駄なAPI課金を避ける）。
    """
    scored = [
        score(target, candidate)
        for candidate in candidates
        if candidate.id != target.id
    ]
    scored = [item for item in scored if item["score"] >= min_score]
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit]

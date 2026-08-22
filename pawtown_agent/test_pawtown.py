"""ネットワークもAPIキーも使わないテスト。

    pytest

確認したいのは主に次の3点。
- フォーム回答の正規化とスコアリングという決定的な処理が正しいか
- LLMが変な出力を返しても、存在しない相手を紹介したりしないか
- 双方の承認が揃う前に、相手のメールアドレスが相手に渡らないか
"""

import pytest

import fakes
import flow
import matcher
import models
import notify
import scoring
import store
from models import Member


@pytest.fixture(autouse=True)
def demo_mode(monkeypatch, tmp_path):
    monkeypatch.setenv("DEMO_MODE", "1")
    # デモの保存先をテストごとの一時ファイルにする（作業ディレクトリを汚さない）
    monkeypatch.setenv("PAWTOWN_DEMO_STATE", str(tmp_path / "demo_state.json"))
    monkeypatch.delenv("PAWTOWN_EMAIL_DRY_RUN", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    notify.set_confirm_hook(None)
    fakes.reset()
    yield
    notify.set_confirm_hook(None)
    fakes.reset()


def member(**overrides) -> Member:
    row = {
        "id": overrides.pop("id", "test-id"),
        "nickname": "テスト",
        "email": "test@example.com",
        "pet_type": "dog",
        "breed": "トイプードル",
        "pet_age": 3,
        "personality_tags": [],
        "concern_tags": ["しつけ"],
        "area": "東京都世田谷区",
    }
    row.update(overrides)
    return Member.from_row(row)


# --- フォーム回答の正規化 ---------------------------------------------------


@pytest.mark.parametrize("text", ["しつけ、留守番", "しつけ, 留守番", "しつけ/留守番"])
def test_normalize_tags_accepts_common_separators(text):
    assert models.normalize_tags(text) == ["しつけ", "留守番"]


def test_normalize_tags_drops_duplicates_and_blanks():
    assert models.normalize_tags("しつけ、、しつけ, 留守番") == ["しつけ", "留守番"]


@pytest.mark.parametrize("text", ["犬", "イヌ", "Dog", "犬（トイプードル）"])
def test_normalize_pet_type_accepts_variants(text):
    assert models.normalize_pet_type(text) == "dog"


def test_normalize_pet_type_rejects_unknown():
    # 判別できない回答を黙って dog にしない（種別違いのマッチが出てしまうため）
    with pytest.raises(ValueError):
        models.normalize_pet_type("うさぎ")


def test_member_prompt_dict_hides_email():
    # LLMに渡す必要のない個人情報は渡さない
    assert "email" not in member().to_prompt_dict()


# --- スコアリング -----------------------------------------------------------


def test_same_breed_and_concerns_scores_higher_than_different_breed():
    target = member(id="t")
    same = member(id="a", breed="トイプードル", concern_tags=["しつけ"])
    other = member(id="b", breed="秋田犬", concern_tags=["健康"])
    assert scoring.score(target, same)["score"] > scoring.score(target, other)["score"]


def test_same_breed_group_scores_between_exact_match_and_stranger():
    target = member(id="t")
    exact = scoring.score(target, member(id="a", breed="トイプードル"))["breakdown"]["breed"]
    group = scoring.score(target, member(id="b", breed="チワワ"))["breakdown"]["breed"]
    far = scoring.score(target, member(id="c", breed="秋田犬"))["breakdown"]["breed"]
    assert exact > group > far


def test_different_pet_type_loses_pet_type_and_breed_points():
    result = scoring.score(member(id="t"), member(id="c", pet_type="cat", breed="ペルシャ"))
    assert result["breakdown"]["pet_type"] == 0
    assert result["breakdown"]["breed"] == 0


def test_same_prefecture_beats_same_region_beats_far():
    target = member(id="t")
    same = scoring.score(target, member(id="a", area="東京都杉並区"))["breakdown"]["area"]
    region = scoring.score(target, member(id="b", area="千葉県船橋市"))["breakdown"]["area"]
    far = scoring.score(target, member(id="c", area="福岡県福岡市"))["breakdown"]["area"]
    assert same > region > far == 0


def test_shortlist_excludes_self_and_low_scores():
    target = member(id="t")
    candidates = [
        target,
        member(id="near", breed="トイプードル", concern_tags=["しつけ"]),
        member(id="far", pet_type="cat", breed="ペルシャ", concern_tags=["健康"],
               area="沖縄県那覇市"),
    ]
    ids = [item["candidate_id"] for item in scoring.shortlist(target, candidates)]
    assert ids == ["near"]


# --- LLM応答の扱い ---------------------------------------------------------


def test_extract_json_strips_code_fence():
    text = '```json\n[{"candidate_id": "x", "score": 80, "reason": "理由"}]\n```'
    assert matcher._extract_json(text)[0]["candidate_id"] == "x"


def test_extract_json_rejects_garbage():
    with pytest.raises(ValueError):
        matcher._extract_json("すみません、候補が見つかりませんでした。")


def test_find_matches_drops_ids_the_llm_invented(monkeypatch):
    target = member(id="t")
    candidates = [member(id="real", concern_tags=["しつけ"])]
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    monkeypatch.delenv("DEMO_MODE", raising=False)
    monkeypatch.setattr(
        matcher, "_call_llm",
        lambda prompt, model: '[{"candidate_id": "real", "score": 90, "reason": "共通の悩み"},'
                              ' {"candidate_id": "ghost", "score": 95, "reason": "でっちあげ"}]',
    )
    results = matcher.find_matches(target, candidates)
    assert [item["candidate_id"] for item in results] == ["real"]


def test_find_matches_skips_llm_when_no_candidate_passes(monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("候補ゼロならLLMを呼んではいけない（無駄な課金になる）")

    monkeypatch.setattr(matcher, "_call_llm", fail)
    far = member(id="far", pet_type="cat", breed="ペルシャ", concern_tags=["健康"],
                 area="沖縄県那覇市")
    assert matcher.find_matches(member(id="t"), [far]) == []


# --- 承認フロー -------------------------------------------------------------


@pytest.mark.parametrize(
    "current,side,approved,expected",
    [
        ("pending", "a", True, "approved_a"),
        ("pending", "b", True, "approved_b"),
        ("approved_a", "b", True, "matched"),
        ("approved_b", "a", True, "matched"),
        ("approved_a", "a", True, "approved_a"),  # 二重返信でも進めない
        ("pending", "a", False, "rejected"),
        ("approved_a", "b", False, "rejected"),
        ("matched", "a", False, "matched"),       # 確定後は動かさない
        ("rejected", "a", True, "rejected"),
    ],
)
def test_next_status(current, side, approved, expected):
    assert flow.next_status(current, side, approved) == expected


def _pending_match():
    members = store.list_members()
    created = flow.propose_matches(members[0].id)
    assert created, "デモデータではモカママに候補が出るはず"
    return created[0]


def test_approval_request_does_not_leak_partner_email():
    match = _pending_match()
    flow.send_approval_requests(match)
    assert len(fakes.sent_emails) == 2
    for mail in fakes.sent_emails:
        assert len(mail["to"]) == 1  # 承認前は必ず個別送信
        other = [m["to"][0] for m in fakes.sent_emails if m["to"] != mail["to"]][0]
        assert other not in mail["body"]


def test_one_sided_approval_sends_no_introduction():
    match = _pending_match()
    updated, _ = flow.record_response(match, "a", True)
    assert updated.status == "approved_a"
    assert fakes.sent_emails == []


def test_introduction_goes_out_only_after_both_approve():
    match = _pending_match()
    match, _ = flow.record_response(match, "a", True)
    match, _ = flow.record_response(match, "b", True)
    assert match.status == "matched"
    assert len(fakes.sent_emails) == 1
    assert len(fakes.sent_emails[0]["to"]) == 2  # ここで初めて両者が同じ宛先に並ぶ


def test_rejection_notifies_nobody():
    match = _pending_match()
    updated, messages = flow.record_response(match, "b", False)
    assert updated.status == "rejected"
    assert fakes.sent_emails == []  # 断られた事実は相手に送らない
    assert "通知しません" in messages[0]


def test_confirm_hook_can_block_sending():
    notify.set_confirm_hook(lambda recipients, subject, body: False)
    match = _pending_match()
    results = flow.send_approval_requests(match)
    assert fakes.sent_emails == []
    assert all("中止" in result for result in results)


def test_respond_by_token_picks_the_right_side():
    match = _pending_match()
    updated, _ = flow.respond_by_token(match.token_b, True)
    assert updated.status == "approved_b"


def test_matches_are_not_proposed_twice():
    members = store.list_members()
    first = flow.propose_matches(members[0].id)
    again = flow.propose_matches(members[0].id)
    assert first and again == []


def test_stats_counts_by_status():
    match = _pending_match()
    flow.record_response(match, "a", True)
    stats = store.stats()
    assert stats["member_count"] == len(fakes.DEMO_MEMBERS)
    assert stats["awaiting_count"] >= 1
    assert stats["matched_count"] == 0

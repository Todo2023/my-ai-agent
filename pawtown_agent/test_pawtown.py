"""ネットワークもAPIキーも使わないテスト。

    pytest

確認したいのは主に次の4点。
- フォーム回答の正規化とスコアリングという決定的な処理が正しいか
- 物語生成が方式ごとに正しいプロンプトを組み立てているか
- LLMが変な出力を返しても、存在しない相手や物語をフィードに出さないか
- 双方の承認が揃う前に、相手のメールアドレスが相手に渡らないか
"""

import datetime

import pytest

import fakes
import feed as feed_module
import flow
import llm
import matcher
import models
import notify
import scoring
import stories
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


@pytest.fixture
def with_llm(monkeypatch):
    """LLMを呼べる状態にして、応答を差し替えられるようにする。"""
    monkeypatch.setattr(llm, "available", lambda: True)

    def use(response):
        calls = []

        def fake_call(prompt, model=None, image_path=None):
            calls.append({"prompt": prompt, "model": model, "image_path": image_path})
            return response(prompt) if callable(response) else response

        monkeypatch.setattr(llm, "call", fake_call)
        return calls

    return use


def member(**overrides) -> Member:
    row = {
        "id": overrides.pop("id", "test-id"),
        "nickname": "テスト", "email": "test@example.com",
        "pet_name": "ぽち", "pet_type": "dog", "breed": "トイプードル", "pet_age": 3,
        "personality_tags": [], "concern_tags": ["しつけ"], "area": "東京都世田谷区",
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


@pytest.mark.parametrize("value,expected", [("a", "A"), ("C", "C"), ("", "B"), ("X", "B"), (None, "B")])
def test_default_post_type_falls_back_to_b(value, expected):
    assert member(default_post_type=value).default_post_type == expected


def test_display_name_falls_back_to_nickname():
    assert member(pet_name="").display_name == "テスト"


def test_member_prompt_dict_hides_email():
    # LLMに渡す必要のない個人情報は渡さない
    prompt_dict = member().to_prompt_dict()
    assert "email" not in prompt_dict
    assert prompt_dict["pet_name"] == "ぽち"


# --- 物語生成 ---------------------------------------------------------------


def test_question_is_stable_for_the_same_day():
    person = member()
    day = datetime.date(2026, 8, 23)
    assert stories.question_for(person, day) == stories.question_for(person, day)


def test_question_changes_over_a_week():
    person = member()
    days = [datetime.date(2026, 8, 23) + datetime.timedelta(days=i) for i in range(7)]
    assert len({stories.question_for(person, day) for day in days}) > 1


def test_two_members_can_get_different_questions():
    day = datetime.date(2026, 8, 23)
    questions = {stories.question_for(member(id=f"m{i}"), day) for i in range(8)}
    assert len(questions) > 1


def test_type_a_requires_the_owners_words():
    with pytest.raises(ValueError):
        stories.generate_story(member(), "A", raw_input="   ")


def test_type_c_requires_an_image():
    with pytest.raises(ValueError):
        stories.generate_story(member(), "C")


def test_story_prompt_uses_the_template_for_that_type(with_llm):
    calls = with_llm("物語本文")
    stories.generate_story(member(), "A", raw_input="通院した")
    prompt = calls[0]["prompt"]
    assert "飼い主からの一言: 通院した" in prompt
    assert "今日の質問" not in prompt
    assert "ぽち" in prompt  # 主役はペット名
    assert "健康や治療についての助言" in prompt  # 医療助言をさせないガードを必ず載せる


def test_type_b_prompt_carries_the_question(with_llm):
    calls = with_llm("物語本文")
    stories.generate_story(member(), "B", raw_input="よく寝ていた", question="今日はどこで寝ていましたか？")
    assert "今日の質問: 今日はどこで寝ていましたか？" in calls[0]["prompt"]
    assert "回答: よく寝ていた" in calls[0]["prompt"]


def test_type_c_reads_the_photo_then_writes_the_story(with_llm):
    calls = with_llm(lambda prompt: "窓辺で丸くなっている。" if "写真" in prompt else "物語本文")
    raw_input, story = stories.generate_story(member(), "C", image_path="photo.jpg")
    # 1回目が画像解析、2回目が物語生成。raw_input には解析結果が残る
    assert calls[0]["image_path"] == "photo.jpg"
    assert calls[1]["image_path"] is None
    assert raw_input == "窓辺で丸くなっている。"
    assert "画像から読み取れる情景: 窓辺で丸くなっている。" in calls[1]["prompt"]
    assert story == "物語本文"


def test_empty_llm_response_falls_back_to_template(with_llm):
    with_llm("   ")
    _, story = stories.generate_story(member(), "A", raw_input="通院した")
    assert "テンプレート" in story  # 空の物語を保存しない


def test_template_story_used_without_api_key():
    _, story = stories.generate_story(member(), "A", raw_input="通院した")
    assert "ぽち" in story and "通院した" in story


@pytest.mark.parametrize(
    "current,chosen,first_post,explicit,expected",
    [
        ("B", "A", True, False, True),    # 初回の選択は既定として覚える
        ("B", "A", False, False, False),  # 2回目以降は"今回だけ"の変更
        ("B", "A", False, True, True),    # 明示的に指定されたときだけ書き換える
        ("B", "B", True, False, False),   # 既定と同じなら書き換えない
    ],
)
def test_default_post_type_is_remembered_only_on_the_first_choice(
        current, chosen, first_post, explicit, expected):
    person = member(default_post_type=current)
    assert stories.should_remember_default(person, chosen, first_post, explicit) is expected


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
    assert llm.extract_json(text)[0]["candidate_id"] == "x"


def test_extract_json_rejects_garbage():
    with pytest.raises(ValueError):
        llm.extract_json("すみません、候補が見つかりませんでした。")


def test_find_matches_drops_ids_the_llm_invented(with_llm):
    with_llm('[{"candidate_id": "real", "score": 90, "reason": "共通の悩み"},'
             ' {"candidate_id": "ghost", "score": 95, "reason": "でっちあげ"}]')
    results = matcher.find_matches(member(id="t"), [member(id="real", concern_tags=["しつけ"])])
    assert [item["candidate_id"] for item in results] == ["real"]


def test_find_matches_skips_llm_when_no_candidate_passes(with_llm):
    calls = with_llm("呼ばれてはいけない")
    far = member(id="far", pet_type="cat", breed="ペルシャ", concern_tags=["健康"],
                 area="沖縄県那覇市")
    assert matcher.find_matches(member(id="t"), [far]) == []
    assert calls == []  # 候補ゼロならLLMを呼ばない（無駄な課金になる）


# --- 物語フィードとレコメンド -----------------------------------------------


def _reader():
    return store.find_member_by_email("mocha@example.com")


def test_feed_without_reader_has_no_recommendations():
    kinds = {item["kind"] for item in feed_module.build_feed(None)}
    assert kinds == {"post"}


def test_feed_inserts_a_recommendation_between_stories():
    items = feed_module.build_feed(_reader(), limit=12, every=2)
    kinds = [item["kind"] for item in items]
    assert "recommend" in kinds
    # 先頭がいきなりレコメンドにならない（物語を読む流れの"合間"に差し込む）
    assert kinds[0] == "post"


def test_recommended_story_is_not_also_shown_as_a_plain_post():
    items = feed_module.build_feed(_reader(), limit=12, every=2)
    recommended = {item["post"].id for item in items if item["kind"] == "recommend"}
    plain = {item["post"].id for item in items if item["kind"] == "post"}
    assert recommended and not (recommended & plain)


def test_recommendation_never_points_at_the_readers_own_story():
    reader = _reader()
    items = feed_module.build_feed(reader, limit=12, every=1)
    assert all(item["member"].id != reader.id
               for item in items if item["kind"] == "recommend")


def test_recommend_drops_post_ids_the_llm_invented(with_llm):
    with_llm('[{"candidate_post_id": "そんな物語はない", "reason": "でっちあげ"}]')
    assert feed_module.recommend(_reader(), store.list_posts(limit=1)[0]) == []


def test_recommend_reason_is_gentle_without_llm():
    results = feed_module.recommend(_reader(), None)
    assert results
    assert any("悩んでいました" in item["reason"] for item in results)


def test_posting_shows_up_in_the_feed():
    reader = _reader()
    store.create_post(reader.id, "A", "通院した", "きょうは病院に行った。")
    stories_in_feed = [item["post"].generated_story for item in feed_module.build_feed(reader)]
    assert "きょうは病院に行った。" in stories_in_feed


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
    created = flow.propose_matches(_reader().id)
    assert created, "デモデータではモカに候補が出るはず"
    return created[0]


def test_connect_from_the_feed_creates_a_pending_match_without_sending_mail():
    reader = _reader()
    partner = store.find_member_by_email("sora@example.com")
    result = feed_module.connect(reader, partner)
    assert result["match"].status == "pending"
    assert fakes.sent_emails == []  # 繋がりたいを押しただけでは誰にも届かない


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
    first = flow.propose_matches(_reader().id)
    again = flow.propose_matches(_reader().id)
    assert first and again == []


# --- 保存とダッシュボード ---------------------------------------------------


def test_default_post_type_is_persisted():
    reader = _reader()
    store.update_member(reader.id, default_post_type="C")
    assert store.get_member(reader.id).default_post_type == "C"


def test_stats_counts_stories_and_matches():
    match = _pending_match()
    flow.record_response(match, "a", True)
    stats = store.stats()
    assert stats["member_count"] == len(fakes.BASE_MEMBERS)
    assert stats["post_count"] == len(fakes.BASE_POSTS)
    assert stats["writer_count"] >= 1
    assert stats["awaiting_count"] >= 1
    assert stats["matched_count"] == 0

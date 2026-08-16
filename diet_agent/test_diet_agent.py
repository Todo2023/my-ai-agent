"""OCRの検証ロジック・保存・APIのテスト。Gemini は呼ばない。"""

import io
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

import app as app_module
import ocr
import store


@pytest.fixture
def conn(tmp_path):
    connection = store.connect(tmp_path / "test.db")
    yield connection
    connection.close()


@pytest.fixture
def client(tmp_path):
    reader = ocr.FakeReader()
    test_app = app_module.create_app(db=str(tmp_path / "api.db"), reader=reader)
    with TestClient(test_app) as c:
        c.reader = reader
        yield c


def photo(name="scale.jpg"):
    return {"photo": (name, io.BytesIO(b"fake-image-bytes"), "image/jpeg")}


# --- OCRの出力パース ---


def test_parse_response_reads_json():
    reading = ocr.parse_response('{"weight_kg": 62.4, "body_fat_pct": 18.2, "raw_text": "62.4", "confidence": 0.9}')
    assert (reading.weight_kg, reading.body_fat_pct, reading.confidence) == (62.4, 18.2, 0.9)


def test_parse_response_survives_broken_json():
    reading = ocr.parse_response("すみません、読めませんでした")
    assert reading.weight_kg is None and reading.confidence == 0.0


def test_parse_response_ignores_wrong_types():
    reading = ocr.parse_response('{"weight_kg": "unknown", "raw_text": "", "confidence": 5}')
    assert reading.weight_kg is None
    assert reading.confidence == 1.0  # 0〜1に丸める


# --- 決定的な検証 ---


def test_validate_accepts_normal_reading():
    reading = ocr.validate(ocr.ScaleReading(62.4, 18.2, "62.4kg", 0.9), previous_weight=62.6)
    assert reading.weight_kg == 62.4
    assert reading.warnings == []
    assert not reading.needs_check


def test_validate_fixes_missing_decimal_point():
    reading = ocr.validate(ocr.ScaleReading(624.0, None, "624", 0.8))
    assert reading.weight_kg == 62.4
    assert any("補正" in w for w in reading.warnings)
    assert reading.needs_check


def test_validate_drops_out_of_range_weight():
    reading = ocr.validate(ocr.ScaleReading(3000.0, None, "3000", 0.9))
    assert reading.weight_kg is None
    assert any("想定範囲外" in w for w in reading.warnings)


def test_validate_drops_out_of_range_body_fat_but_keeps_weight():
    reading = ocr.validate(ocr.ScaleReading(62.4, 182.0, "62.4 182", 0.9))
    assert reading.weight_kg == 62.4
    assert reading.body_fat_pct is None


def test_validate_warns_on_big_jump_from_previous():
    reading = ocr.validate(ocr.ScaleReading(72.4, None, "72.4", 0.95), previous_weight=62.4)
    assert reading.weight_kg == 72.4  # 値は捨てない。人間に確認させる
    assert any("+10.0kg" in w for w in reading.warnings)


def test_validate_warns_on_low_confidence():
    assert ocr.validate(ocr.ScaleReading(62.4, None, "62.4", 0.3)).needs_check


def test_validate_reports_unreadable_photo():
    reading = ocr.validate(ocr.ScaleReading(None, None, "", 0.1))
    assert reading.needs_check
    assert any("手入力" in w for w in reading.warnings)


# --- 保存 ---


def test_save_and_list(conn):
    users = store.users()
    store.save_record(conn, store.Record(users[0], "2026-08-01", 62.4, 18.2, source="ocr"))
    store.save_record(conn, store.Record(users[1], "2026-08-01", 52.1))
    rows = store.list_records(conn)
    assert len(rows) == 2
    assert store.latest_record(conn, users[0])["weight_kg"] == 62.4


def test_same_day_is_overwritten(conn):
    user = store.users()[0]
    store.save_record(conn, store.Record(user, "2026-08-01", 62.4))
    store.save_record(conn, store.Record(user, "2026-08-01", 62.9))
    rows = store.list_records(conn, user=user)
    assert len(rows) == 1 and rows[0]["weight_kg"] == 62.9


def test_save_rejects_bad_input(conn):
    with pytest.raises(ValueError):
        store.save_record(conn, store.Record("知らない人", "2026-08-01", 62.4))
    with pytest.raises(ValueError):
        store.save_record(conn, store.Record(store.users()[0], "2026-08-01", 624.0))
    with pytest.raises(ValueError):
        store.save_record(conn, store.Record(store.users()[0], "8/1", 62.4))


def test_delete_record(conn):
    user = store.users()[0]
    store.save_record(conn, store.Record(user, "2026-08-01", 62.4))
    assert store.delete_record(conn, user, "2026-08-01")
    assert not store.delete_record(conn, user, "2026-08-01")


def test_summary_without_records(conn):
    summary = store.summary(conn, store.users()[0])
    assert summary["count"] == 0 and summary["latest"] is None


def test_summary_compares_weekly_averages(conn):
    user = store.users()[0]
    today = date.today()
    for i in range(14):
        day = (today - timedelta(days=13 - i)).isoformat()
        # 先週は 64.0 固定、今週は 63.0 固定 → 先週比 -1.0kg
        store.save_record(conn, store.Record(user, day, 64.0 if i < 7 else 63.0))
    summary = store.summary(conn, user)
    assert summary["week_average_kg"] == 63.0
    assert summary["week_change_kg"] == -1.0
    assert summary["total_change_kg"] == -1.0


def test_goal_and_remaining(conn):
    user = store.users()[0]
    store.save_record(conn, store.Record(user, "2026-08-01", 62.4))
    store.set_goal(conn, user, 60.0)
    assert store.summary(conn, user)["to_goal_kg"] == 2.4
    store.set_goal(conn, user, None)
    assert store.summary(conn, user)["to_goal_kg"] is None


# --- API ---


def test_ocr_endpoint_does_not_save(client):
    user = store.users()[0]
    res = client.post("/api/ocr", data={"user": user}, files=photo())
    assert res.status_code == 200
    assert res.json()["reading"]["weight_kg"] == 62.4
    assert client.get("/api/state").json()["records"] == []


def test_ocr_endpoint_passes_previous_weight(client):
    user = store.users()[0]
    client.post("/api/records", json={"user": user, "date": "2026-08-01", "weight_kg": 55.0})
    res = client.post("/api/ocr", data={"user": user}, files=photo())
    body = res.json()
    assert body["previous"]["weight_kg"] == 55.0
    assert any("読み間違い" in w for w in body["reading"]["warnings"])


def test_ocr_endpoint_rejects_unknown_user(client):
    assert client.post("/api/ocr", data={"user": "他人"}, files=photo()).status_code == 400


def test_ocr_endpoint_reports_failure(client, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("Gemini API がタイムアウトしました")

    client.app.state.reader = boom
    res = client.post("/api/ocr", data={"user": store.users()[0]}, files=photo())
    assert res.status_code == 502


def test_record_endpoint_saves_and_returns_summary(client):
    user = store.users()[0]
    res = client.post(
        "/api/records",
        json={"user": user, "date": "2026-08-01", "weight_kg": 62.4, "body_fat_pct": 18.2, "source": "ocr"},
    )
    assert res.status_code == 200
    assert res.json()["summary"]["latest"]["weight_kg"] == 62.4
    state = client.get("/api/state").json()
    assert state["users"] == store.users()
    assert state["records"][0]["source"] == "ocr"


def test_record_endpoint_rejects_impossible_weight(client):
    res = client.post("/api/records", json={"user": store.users()[0], "date": "2026-08-01", "weight_kg": 624})
    assert res.status_code == 400


def test_delete_endpoint(client):
    user = store.users()[0]
    client.post("/api/records", json={"user": user, "date": "2026-08-01", "weight_kg": 62.4})
    assert client.delete(f"/api/records/{user}/2026-08-01").status_code == 200
    assert client.delete(f"/api/records/{user}/2026-08-01").status_code == 404


def test_goal_endpoint(client):
    user = store.users()[0]
    res = client.post("/api/goals", json={"user": user, "goal_weight_kg": 60.0})
    assert res.json()["summary"]["goal_weight_kg"] == 60.0


def test_index_page_is_served(client):
    res = client.get("/")
    assert res.status_code == 200 and "ふたりのダイエット記録" in res.text

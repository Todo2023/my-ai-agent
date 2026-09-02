"""APIキー無しで一連の流れを確認するデモ。

Gemini は呼ばず、OCRの結果はダミー（ocr.FakeReader）を使う。
一時DBに書くので、実際の diet.db は汚さない。

    python demo.py           # ターミナルで流れを確認
    DIET_FAKE_OCR=1 python app.py   # 同じダミーでWeb UIを触る
"""

import tempfile
from datetime import date, timedelta
from pathlib import Path

import ocr
import store


def seed(conn, users):
    """2週間分の記録を作る（夫は微減、妻は横ばい）。"""
    today = date.today()
    for i in range(14, 0, -1):
        day = (today - timedelta(days=i)).isoformat()
        store.save_record(conn, store.Record(users[0], day, 64.0 - (14 - i) * 0.08))
        store.save_record(conn, store.Record(users[1], day, 52.0 + ((14 - i) % 3) * 0.2))


def show_reading(title, reading):
    print(f"\n--- {title} ---")
    print(f"  読み取り結果 : {reading.raw_text!r} (自信 {reading.confidence:.2f})")
    print(f"  体重         : {reading.weight_kg if reading.weight_kg is not None else '読めず'}")
    print(f"  体脂肪率     : {reading.body_fat_pct if reading.body_fat_pct is not None else '—'}")
    for warning in reading.warnings:
        print(f"  ⚠ {warning}")
    print(f"  → {'人間の確認が必要' if reading.needs_check else 'そのまま保存してよい'}")


def main():
    users = store.users()
    with tempfile.TemporaryDirectory() as tmp:
        conn = store.connect(Path(tmp) / "demo.db")
        seed(conn, users)
        store.set_goal(conn, users[0], 60.0)

        user = users[0]
        previous = store.latest_record(conn, user)["weight_kg"]
        print(f"■ {user} が体重計を撮影（前回 {previous}kg）")

        # 1. うまく読めたケース → そのまま保存
        reader = ocr.FakeReader([
            ocr.ScaleReading(weight_kg=62.9, body_fat_pct=18.2, raw_text="62.9kg 18.2%", confidence=0.93),
            ocr.ScaleReading(weight_kg=629.0, raw_text="629", confidence=0.71),
            ocr.ScaleReading(weight_kg=None, raw_text="ぼやけて読めない", confidence=0.2),
        ])
        good = reader(b"<photo>", previous_weight=previous)
        show_reading("① きれいに撮れた写真", good)
        store.save_record(
            conn,
            store.Record(user, date.today().isoformat(), good.weight_kg, good.body_fat_pct, source="ocr"),
        )
        print("  保存しました（人間が確認してから /api/records を呼ぶ想定）")

        # 2. 小数点を読み落としたケース → 決定的な補正が入る
        show_reading("② 小数点を読み落とした写真", reader(b"<photo>", previous_weight=previous))

        # 3. まったく読めないケース → 手入力に倒す
        show_reading("③ ぼやけた写真", reader(b"<photo>", previous_weight=previous))

        print("\n■ サマリ")
        for summary in (store.summary(conn, u) for u in users):
            print(
                f"  {summary['user']}: 最新 {summary['latest']['weight_kg']}kg / "
                f"直近7日平均 {summary['week_average_kg']}kg / "
                f"先週比 {summary['week_change_kg']}kg / "
                f"目標まで {summary['to_goal_kg']}"
            )
        conn.close()

    print("\nWeb UIを触るには: DIET_FAKE_OCR=1 python app.py")


if __name__ == "__main__":
    main()

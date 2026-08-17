"""リンク生成・投稿生成のテスト。標準ライブラリだけで動く（外部への通信もしない）。

    python test_lead.py
"""

import csv
import json
import shutil
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))

import config  # noqa: E402
import daily_post_generator as gen  # noqa: E402
import generate_utm_links as utm  # noqa: E402


class TestUtmLinks(unittest.TestCase):
    def test_仕様書の生成例どおりのURLになる(self):
        data = utm.build_links()
        self.assertEqual(
            data["links"]["x"]["url"],
            "https://todo-llc.netlify.app/contact/"
            "?utm_source=x&utm_medium=sns&utm_campaign=claudecode_series",
        )
        self.assertEqual(
            data["links"]["note"]["url"],
            "https://todo-llc.netlify.app/contact/"
            "?utm_source=note&utm_medium=article&utm_campaign=claudecode_series",
        )
        self.assertEqual(
            data["links"]["zenn"]["url"],
            "https://todo-llc.netlify.app/contact/"
            "?utm_source=zenn&utm_medium=article&utm_campaign=claudecode_series",
        )

    def test_AB別のリンクはutm_contentで見分けられる(self):
        entry = utm.build_links()["links"]["x"]
        self.assertTrue(entry["cta_a"].endswith("&utm_content=cta_a"))
        self.assertTrue(entry["cta_b"].endswith("&utm_content=cta_b"))


class TestVariant(unittest.TestCase):
    def test_平日ごとにAとBが交互になる(self):
        epoch = date(2026, 1, 1)  # 木曜
        self.assertEqual(gen.variant_for(date(2026, 1, 1), epoch), "a")
        self.assertEqual(gen.variant_for(date(2026, 1, 2), epoch), "b")  # 金
        self.assertEqual(gen.variant_for(date(2026, 1, 5), epoch), "a")  # 月
        self.assertEqual(gen.variant_for(date(2026, 1, 6), epoch), "b")  # 火

    def test_土日は直前の平日と同じ(self):
        epoch = date(2026, 1, 1)
        self.assertEqual(gen.variant_for(date(2026, 1, 3), epoch), "b")  # 土
        self.assertEqual(gen.variant_for(date(2026, 1, 4), epoch), "b")  # 日
        self.assertEqual(gen.variant_for(date(2026, 1, 2), epoch), "b")  # 金

    def test_何週も先まで交互が崩れない(self):
        epoch = date(2026, 1, 1)
        previous = None
        day = epoch
        while day < date(2026, 4, 1):  # 3か月ぶんの平日を通しで確認
            if day.weekday() < 5:
                current = gen.variant_for(day, epoch)
                if previous is not None:
                    self.assertNotEqual(previous, current, f"{day} で A/B が続いた")
                previous = current
            day += timedelta(days=1)


class TestXLength(unittest.TestCase):
    def test_全角は2文字URLは23文字で数える(self):
        self.assertEqual(gen.x_length("abc"), 3)
        self.assertEqual(gen.x_length("あいう"), 6)
        self.assertEqual(gen.x_length("あ https://example.com/very/long/path"), 2 + 1 + 23)

    def test_短い投稿では警告しない(self):
        self.assertIsNone(gen.length_warning("短い投稿", "x"))

    def test_長い投稿は警告する(self):
        self.assertIsNotNone(gen.length_warning("あ" * 200, "x"))

    def test_note_Zennには長さ警告を出さない(self):
        self.assertIsNone(gen.length_warning("あ" * 200, "note"))


class TestPickRow(unittest.TestCase):
    def rows(self):
        return [
            {"id": "t001", "category": "用語", "title": "A", "body": "a", "used_flag": "false"},
            {"id": "c001", "category": "コマンド", "title": "B", "body": "b", "used_flag": "false"},
            {"id": "t002", "category": "用語", "title": "C", "body": "c", "used_flag": "false"},
        ]

    def test_使用済みが0件なら用語から始まる(self):
        self.assertEqual(gen.pick_row(self.rows())["id"], "t001")

    def test_1件使ったらコマンドに切り替わる(self):
        rows = self.rows()
        rows[0]["used_flag"] = "true"
        self.assertEqual(gen.pick_row(rows)["id"], "c001")

    def test_狙ったカテゴリが尽きたら残りから選ぶ(self):
        rows = self.rows()
        rows[1]["used_flag"] = "true"  # コマンドはこれで打ち止め
        rows[0]["used_flag"] = "true"
        self.assertEqual(gen.pick_row(rows)["id"], "t002")

    def test_全部使い切ったら止まる(self):
        rows = self.rows()
        for row in rows:
            row["used_flag"] = "true"
        with self.assertRaises(LookupError):
            gen.pick_row(rows)


class TestGenerateEndToEnd(unittest.TestCase):
    """本物のファイルは触らず、一時フォルダに作った複製で通しで動かす。"""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = (config.DATA_DIR, config.OUTPUT_DIR, config.TERMS_BANK, config.UTM_LINKS, config.POST_LOG)

        config.DATA_DIR = self.tmp / "data"
        config.OUTPUT_DIR = self.tmp / "output"
        config.DATA_DIR.mkdir()
        config.TERMS_BANK = config.DATA_DIR / "terms_bank.csv"
        config.UTM_LINKS = config.DATA_DIR / "utm_links.json"
        config.POST_LOG = config.DATA_DIR / "post_log.csv"

        with open(config.TERMS_BANK, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=gen.FIELDNAMES)
            writer.writeheader()
            writer.writerow(
                {"id": "t001", "category": "用語", "title": "CLAUDE.md", "body": "1行目\\n2行目", "used_flag": "false"}
            )
            writer.writerow(
                {"id": "c001", "category": "コマンド", "title": "/init", "body": "たたき台", "used_flag": "false"}
            )
        config.UTM_LINKS.write_text(
            json.dumps(utm.build_links(), ensure_ascii=False), encoding="utf-8"
        )

    def tearDown(self):
        (config.DATA_DIR, config.OUTPUT_DIR, config.TERMS_BANK, config.UTM_LINKS, config.POST_LOG) = self.saved
        shutil.rmtree(self.tmp)

    def test_投稿ファイルとCSV更新とログが揃う(self):
        gen.main(["--date", "2026-01-01", "--platform", "x"])

        post = (config.OUTPUT_DIR / "2026-01-01_post.md").read_text(encoding="utf-8")
        self.assertTrue(post.startswith("CLAUDE.md\n\n1行目\n2行目\n\n"))  # \n が改行に開く
        self.assertIn("業務の自動化・仕組み化のご相談はこちら", post)  # 1/1 は A
        self.assertIn("utm_source=x", post)
        self.assertIn("utm_content=cta_a", post)

        rows = gen.load_terms()
        self.assertEqual(rows[0]["used_flag"], "true")
        self.assertEqual(rows[1]["used_flag"], "false")

        with config.POST_LOG.open(encoding="utf-8") as f:
            log = list(csv.DictReader(f))
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]["term_id"], "t001")
        self.assertEqual(log[0]["variant"], "a")

    def test_翌営業日はBのCTAで別のカテゴリになる(self):
        gen.main(["--date", "2026-01-01"])
        gen.main(["--date", "2026-01-02"])

        post = (config.OUTPUT_DIR / "2026-01-02_post.md").read_text(encoding="utf-8")
        self.assertTrue(post.startswith("/init"))  # 用語 → コマンド
        self.assertIn("もっと知りたい方はこちら", post)
        self.assertIn("utm_content=cta_b", post)

    def test_dry_runは何も書き換えない(self):
        gen.main(["--date", "2026-01-01", "--dry-run"])
        self.assertFalse(config.OUTPUT_DIR.exists())
        self.assertFalse(config.POST_LOG.exists())
        self.assertEqual(gen.load_terms()[0]["used_flag"], "false")

    def test_知らない投稿先はエラーになる(self):
        with self.assertRaises(KeyError):
            gen.main(["--date", "2026-01-01", "--platform", "facebook"])

    def test_リンク未生成なら案内して止まる(self):
        config.UTM_LINKS.unlink()
        with self.assertRaises(FileNotFoundError):
            gen.main(["--date", "2026-01-01"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

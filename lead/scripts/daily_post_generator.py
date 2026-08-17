"""ネタ帳から1件選んで、CTA付きの投稿を output/ に書き出す。

    python scripts/daily_post_generator.py                # 今日ぶん・X向け
    python scripts/daily_post_generator.py --platform note
    python scripts/daily_post_generator.py --dry-run      # 画面に出すだけ（何も書き換えない）

やること。

1. data/terms_bank.csv の used_flag=false の行を1件選ぶ（用語 → コマンド → 用語 …と交互）
2. 本文にその日の CTA（A/B交互）を足す
3. output/YYYY-MM-DD_post.md に書き出す
4. 選んだ行の used_flag を true にする
5. data/post_log.csv に「いつ・どこへ・A/Bどっち・どのネタ」を1行残す

外部への送信はしない。投稿は人がコピペして行う（誤爆と課金を避けるため）。
"""

import argparse
import csv
import json
import os
import re
import sys
from datetime import date, datetime, timedelta

import config

FIELDNAMES = ["id", "category", "title", "body", "used_flag"]
LOG_FIELDNAMES = ["date", "platform", "variant", "term_id", "category", "output"]


# --- A/B の割り当て ---------------------------------------------------------


def _weekdays_until(target, epoch=config.AB_EPOCH):
    """epoch から target までの平日の数（両端を含む）。"""
    if target < epoch:
        return 0
    days = (target - epoch).days + 1
    full_weeks, rest = divmod(days, 7)
    count = full_weeks * 5
    for offset in range(rest):
        if (epoch + timedelta(days=full_weeks * 7 + offset)).weekday() < 5:
            count += 1
    return count


def variant_for(target, epoch=config.AB_EPOCH):
    """その日の CTA が A か B か。平日ごとに交互。土日は直前の平日と同じ。"""
    index = max(_weekdays_until(target, epoch) - 1, 0)
    return "a" if index % 2 == 0 else "b"


# --- ネタ帳 -----------------------------------------------------------------


def load_terms(path=None):
    path = path or config.TERMS_BANK
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    missing = [c for c in FIELDNAMES if rows and c not in rows[0]]
    if missing:
        raise ValueError(f"{path} に列が足りない: {', '.join(missing)}")
    return rows


def is_used(row):
    return str(row["used_flag"]).strip().lower() in ("true", "1", "yes")


def pick_row(rows, categories=None):
    """未使用の行を1件選ぶ。カテゴリは使用済みの件数で交互に切り替える。"""
    categories = categories or config.CATEGORIES
    unused = [r for r in rows if not is_used(r)]
    if not unused:
        raise LookupError("ネタ帳に未使用の行がない。terms_bank.csv に追記するか used_flag を false に戻す")

    used_count = sum(1 for r in rows if is_used(r))
    wanted = categories[used_count % len(categories)]

    for candidate in (wanted, None):
        for row in unused:
            if candidate is None or row["category"].strip() == candidate:
                return row
    return unused[0]  # ここには来ない（保険）


def save_terms(rows, path=None):
    """CSV を書き戻す。途中で落ちてもネタ帳が壊れないよう、別ファイルに書いてから差し替える。"""
    path = path or config.TERMS_BANK
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row[key] for key in FIELDNAMES})
    os.replace(tmp, path)


# --- 投稿本文 ---------------------------------------------------------------


def load_links(path=None):
    path = path or config.UTM_LINKS
    if not path.exists():
        raise FileNotFoundError(f"{path} が無い。先に `python scripts/generate_utm_links.py` を実行する")
    return json.loads(path.read_text(encoding="utf-8"))


def cta_line(links, platform, variant):
    entry = links["links"].get(platform)
    if entry is None:
        known = ", ".join(links["links"])
        raise KeyError(f"投稿先 '{platform}' のリンクが無い。使えるのは: {known}")
    return config.CTA_TEMPLATES[variant].format(link=entry[f"cta_{variant}"])


def render_post(row, cta):
    """CSV は1行1件で保つため、本文中の改行は \\n（2文字）で書いてもらう。"""
    body = row["body"].replace("\\n", "\n")
    return config.POST_TEMPLATE.format(title=row["title"], body=body, cta=cta)


def x_length(text):
    """X の文字数の目安。全角は2、URLは長さによらず23として数える。"""
    without_urls = re.sub(r"https?://\S+", "", text)
    url_count = len(re.findall(r"https?://\S+", text))
    weighted = sum(1 if ord(ch) < 0x1100 else 2 for ch in without_urls)
    return weighted + url_count * 23


def length_warning(post, platform, limit=280):
    """X は長さ上限がある。切り詰めはせず、超えていることだけ知らせる。"""
    if platform != "x":
        return None
    length = x_length(post)
    if length <= limit:
        return None
    return f"⚠ Xの上限を超えている見込み（目安 {length}/{limit}）。本文を短くするか、note/Zenn 向けに回す"


def append_log(entry, path=None):
    path = path or config.POST_LOG
    new_file = not path.exists()
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_FIELDNAMES)
        if new_file:
            writer.writeheader()
        writer.writerow(entry)


# --- 実行 -------------------------------------------------------------------


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="その日の投稿を1件つくる")
    parser.add_argument("--platform", default="x", help="投稿先（x / note / zenn）。既定は x")
    parser.add_argument("--date", help="対象日 YYYY-MM-DD。既定は今日")
    parser.add_argument("--variant", choices=["a", "b"], help="CTA を手で指定する（既定は平日ごとの交互）")
    parser.add_argument("--dry-run", action="store_true", help="画面に出すだけ。ファイルは書き換えない")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    target = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()
    variant = args.variant or variant_for(target)

    links = load_links()
    rows = load_terms()
    row = pick_row(rows)

    post = render_post(row, cta_line(links, args.platform, variant))
    out_path = config.OUTPUT_DIR / f"{target:%Y-%m-%d}_post.md"

    warning = length_warning(post, args.platform)

    if args.dry_run:
        print(f"--- {out_path.name}（下書き・保存しない） ---")
        print(post, end="")
        print(f"--- ネタ: {row['id']} / {row['category']} / CTA-{variant.upper()} ---")
        if warning:
            print(warning)
        return 0

    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(post, encoding="utf-8")

    row["used_flag"] = "true"
    save_terms(rows)
    append_log(
        {
            "date": f"{target:%Y-%m-%d}",
            "platform": args.platform,
            "variant": variant,
            "term_id": row["id"],
            "category": row["category"],
            "output": out_path.name,
        }
    )

    remaining = sum(1 for r in rows if not is_used(r))
    print(f"書き出した: {out_path}")
    print(f"  ネタ: {row['id']} / {row['category']} / CTA-{variant.upper()} / 投稿先 {args.platform}")
    print(f"  ネタ帳の残り: {remaining}件")
    if warning:
        print(f"  {warning}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

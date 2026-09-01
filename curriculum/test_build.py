"""build.py の試験。ネットワークもファイル出力も使わず、文字列だけで確かめる。

見たいのは2つ。
- 書く人がテキストで書いたものが、意図した形に組み上がること
- **書きかけの回が「書けている」と誤判定されないこと**（一覧の表示が実態とずれると意味がない）
"""

import build


def parse(text):
    meta, body = build.parse_front_matter(text)
    return build.Lesson(slug="x", meta=meta, blocks=build.parse_body(body))


def test_冒頭の情報を読む():
    l = parse("---\n回: 1\n題: 問いを立てる\n日付: 2026-10-01\n---\n\n本文です。\n")
    assert l.number == "1"
    assert l.title == "問いを立てる"
    assert l.meta["日付"] == "2026-10-01"


def test_題が無ければ未定と表示する():
    assert parse("---\n回: 3\n---\n\n本文。\n").title == "（題未定）"


def test_見出しと段落と箇条書き():
    l = parse("## ねらい\n\n手元の問いを直す。\n\n- ひとつ\n- ふたつ\n")
    kinds = [k for k, _ in l.blocks]
    assert kinds == ["h2", "p", "ul"]
    assert l.blocks[2][1] == ["ひとつ", "ふたつ"]


def test_番号つきの箇条書き():
    l = parse("1. 元の問い\n2. 書き換えた問い\n")
    assert l.blocks[0][0] == "ol"
    assert l.blocks[0][1] == ["元の問い", "書き換えた問い"]


def test_添削のブロック():
    l = parse(":::添削\n前: 共感しました\n後: どう使うか\n理由: 誰にでも書ける。\n:::\n")
    html = build.render_blocks(l.blocks)
    assert "fb-before" in html and "共感しました" in html
    assert "fb-after" in html and "どう使うか" in html
    assert "fb-why" in html


def test_理由が無くても添削は組める():
    l = parse(":::添削\n前: あ\n後: い\n:::\n")
    assert "fb-why" not in build.render_blocks(l.blocks)


def test_進行のブロック():
    l = parse(":::進行\n0-5分 | ねらいを言う | 期待値を揃える\n5-20分 | 実例で説明\n:::\n")
    html = build.render_blocks(l.blocks)
    assert html.count('class="rr"') == 2
    assert "期待値を揃える" in html


def test_強調と取り消し線():
    l = parse("これは**大事**で、~~これ~~は消す。\n")
    html = build.render_blocks(l.blocks)
    assert "<b>大事</b>" in html
    assert 'class="struck"' in html


def test_HTMLは書かせない():
    """本文にタグを書かれても、そのまま出さない。受講者の画面が壊れるのを防ぐ。"""
    html = build.render_blocks(parse('<script>alert(1)</script>\n').blocks)
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_書きかけは未記入と数える():
    skeleton = "## ねらい\n\n未記入\n\n## 進行\n\n:::進行\n0-5分 | 未記入 | \n:::\n"
    assert parse(skeleton).written is False


def test_中身が入れば書けていると数える():
    written = "## ねらい\n\n手元の問いを1つ、答えが返る形に書き換えられる。\n"
    assert parse(written).written is True


def test_見出しだけでは書けていると数えない():
    assert parse("## ねらい\n\n## 進行\n").written is False

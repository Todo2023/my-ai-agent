"""topics_inbox.py の試験。**ネットには出ない。**見本を渡して動きだけ確かめる。

この作業環境からは外に出られないため、本物のRSSでは確かめられない。
そのぶん、取り込みの形（重複・空・タグ・古いもの・落ちたとき）を
ここで固定しておく。

    python tools/test_topics_inbox.py
"""
import json, importlib.util, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("ti", str(Path(__file__).with_name("topics_inbox.py")))
ti = importlib.util.module_from_spec(spec); spec.loader.exec_module(ti)

SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>x</title>
<item><title>&#29983;&#25104;AI&#12398;&#35441; - ITmedia</title>
<link>https://news.google.com/rss/articles/AAA</link>
<pubDate>Wed, 03 Sep 2026 09:00:00 GMT</pubDate>
<source url="https://www.itmedia.co.jp">ITmedia</source></item>
<item><title>&lt;b&gt;&#22823;&#23398;&lt;/b&gt;  &#12392;   AI</title>
<link>https://news.google.com/rss/articles/BBB</link>
<pubDate>Tue, 02 Sep 2026 01:00:00 GMT</pubDate>
<source url="https://example.jp">&#26085;&#26085;&#26032;&#32862;</source></item>
<item><title>&#37325;&#35079;</title><link>https://news.google.com/rss/articles/AAA</link></item>
<item><title></title><link>https://news.google.com/rss/articles/CCC</link></item>
</channel></rss>"""

ti.fetch = lambda url: SAMPLE
ti.QUERIES = ["q1", "q2"]
out = ti.OUT = Path(tempfile.mkdtemp()) / "inbox.json"
if out.exists(): out.unlink()

ti.main()
d = json.loads(out.read_text(encoding="utf-8"))
items = d["items"]
assert len(items) == 2, f"2件のはず: {len(items)}"
assert items[0]["source"] == "ITmedia", items[0]
assert items[1]["title"] == "大学 と AI", repr(items[1]["title"])   # タグを外し、空白を1つに
assert all(x.get("seen") for x in items), "拾った日を入れる"
print("  ok  重複と空のものを落とし、タグと余分な空白を外す")

# もう一度回しても増えない（同じURLは足さない）
ti.main()
items2 = json.loads(out.read_text(encoding="utf-8"))["items"]
assert len(items2) == 2, f"増えてはいけない: {len(items2)}"
print("  ok  同じものを二度足さない")

# 古いものは落ちる
d["items"][0]["seen"] = "2020-01-01"
out.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
ti.fetch = lambda url: b'<rss version="2.0"><channel></channel></rss>'
ti.main()
left = json.loads(out.read_text(encoding="utf-8"))["items"]
assert len(left) == 1 and left[0]["source"] != "ITmedia", left
print("  ok  古い候補は落とす")

# 1つの問い合わせが落ちても止まらない
calls = []
def f(url):
    calls.append(url)
    if len(calls) == 1: raise RuntimeError("落ちた")
    return SAMPLE
ti.fetch = f
ti.main()
assert len(calls) == 2, "1つ落ちても次を試す"
print("  ok  1つ落ちても、残りは集める")
print("\n4件すべて通りました")

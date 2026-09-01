"""講座資料の元原稿（curriculum/*.md）から、表示用のページを作る。

なぜこの形か:
資料の中身は Todoさん・小森さんが書きます。書く人がHTMLを触らずに済むよう、
**書くのはテキストだけ**にし、見た目はこちらが持ちます。
ブラウザ側で組み立てると、書式が崩れたときに受講者の画面で壊れます。
ここで先に組み立てて、出来上がったページだけを置きます。

使い方:
    uv run curriculum/build.py          資料ページを作り直す
    uv run curriculum/build.py --check  書けているかだけ確認する（ファイルは作らない）

書き方は curriculum/README.md を見てください。
"""

import argparse
import html
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "docs"

# 各回のスライドが何枚あるか。curriculum/slides.py が書き出す
SLIDES = json.loads((HERE / "slides.json").read_text(encoding="utf-8")) \
    if (HERE / "slides.json").exists() else {}

# 冒頭の情報欄で使う項目。ここに無いキーは本文の前の注記として扱う
META_KEYS = ["回", "種別", "題", "日付", "所要", "ねらい"]

EMPTY_MARKS = ("未記入", "（未記入）", "TODO", "未定")


@dataclass
class Lesson:
    slug: str
    meta: dict
    blocks: list = field(default_factory=list)

    @property
    def number(self) -> str:
        return self.meta.get("回", "?")

    @property
    def title(self) -> str:
        return self.meta.get("題", "（題未定）")

    @property
    def written(self) -> bool:
        """本文が実際に書かれているか。見出しだけの状態を「未記入」と数える。"""
        for kind, value in self.blocks:
            if kind in ("p", "ul", "ol", "quote", "fix", "run", "table"):
                text = value if isinstance(value, str) else str(value)
                if text.strip() and not any(m in text for m in EMPTY_MARKS):
                    return True
        return False


def parse_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    head, body = text[3:end], text[end + 4:]
    meta = {}
    for line in head.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip()
    return meta, body.lstrip("\n")


def inline(text: str) -> str:
    """**強調** と 「朱を入れる」印だけを扱う。HTMLは書かせない（崩れる元になる）。"""
    out = html.escape(text)
    out = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", out)
    out = re.sub(r"~~(.+?)~~", r'<span class="struck">\1</span>', out)
    return out


def parse_body(body: str) -> list:
    blocks: list = []
    lines = body.split("\n")
    i = 0
    para: list[str] = []
    items: list[str] = []
    ordered = False

    def flush_para():
        nonlocal para
        if para:
            blocks.append(("p", " ".join(para)))
            para = []

    def flush_list():
        nonlocal items, ordered
        if items:
            blocks.append(("ol" if ordered else "ul", list(items)))
            items = []
            ordered = False

    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if stripped.startswith(":::"):
            flush_para(); flush_list()
            kind = stripped[3:].strip()
            i += 1
            inner = []
            while i < len(lines) and lines[i].strip() != ":::":
                inner.append(lines[i].rstrip())
                i += 1
            i += 1
            blocks.append((_block_kind(kind), _parse_block(kind, inner)))
            continue

        if not stripped:
            flush_para(); flush_list()
        elif stripped.startswith("## "):
            flush_para(); flush_list()
            blocks.append(("h2", stripped[3:].strip()))
        elif stripped.startswith("### "):
            flush_para(); flush_list()
            blocks.append(("h3", stripped[4:].strip()))
        elif stripped.startswith("> "):
            flush_para(); flush_list()
            blocks.append(("quote", stripped[2:].strip()))
        elif stripped == "---":
            flush_para(); flush_list()
            blocks.append(("hr", ""))
        elif stripped.startswith("- "):
            flush_para()
            items.append(stripped[2:].strip())
        elif re.match(r"^\d+\.\s", stripped):
            flush_para()
            ordered = True
            items.append(re.sub(r"^\d+\.\s*", "", stripped))
        else:
            flush_list()
            para.append(stripped)
        i += 1

    flush_para(); flush_list()
    return blocks


def _block_kind(kind: str) -> str:
    return {"添削": "fix", "進行": "run", "表": "table"}.get(kind, "p")


def _parse_block(kind: str, lines: list[str]):
    if kind == "添削":
        d = {}
        for line in lines:
            if ":" in line:
                k, v = line.split(":", 1)
                d[k.strip()] = v.strip()
        return d
    if kind in ("進行", "表"):
        rows = []
        for line in lines:
            if line.strip():
                rows.append([c.strip() for c in line.split("|")])
        return rows
    return "\n".join(lines)


def render_blocks(blocks: list) -> str:
    out = []
    for kind, value in blocks:
        if kind == "h2":
            out.append(f"<h2>{inline(value)}</h2>")
        elif kind == "h3":
            out.append(f"<h3>{inline(value)}</h3>")
        elif kind == "p":
            out.append(f"<p>{inline(value)}</p>")
        elif kind == "quote":
            out.append(f'<blockquote>{inline(value)}</blockquote>')
        elif kind == "hr":
            out.append("<hr>")
        elif kind in ("ul", "ol"):
            tag = kind
            lis = "".join(f"<li>{inline(v)}</li>" for v in value)
            out.append(f"<{tag}>{lis}</{tag}>")
        elif kind == "fix":
            out.append(
                '<div class="fixbox">'
                f'<p class="fb-label">前</p><p class="fb-before">{inline(value.get("前", ""))}</p>'
                f'<p class="fb-label">後</p><p class="fb-after">{inline(value.get("後", ""))}</p>'
                + (f'<p class="fb-why">{inline(value["理由"])}</p>' if value.get("理由") else "")
                + "</div>")
        elif kind == "run":
            rows = "".join(
                f'<div class="rr"><div class="rt">{inline(r[0])}</div>'
                f'<div class="rw">{inline(r[1] if len(r) > 1 else "")}'
                + (f'<small>{inline(r[2])}</small>' if len(r) > 2 else "")
                + "</div></div>"
                for r in value)
            out.append(f'<div class="runbox">{rows}</div>')
        elif kind == "table":
            if not value:
                continue
            head = "".join(f"<th>{inline(c)}</th>" for c in value[0])
            body = "".join(
                "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
                for r in value[1:])
            out.append(f'<div class="tablewrap"><table><thead><tr>{head}</tr></thead>'
                       f"<tbody>{body}</tbody></table></div>")
    return "\n      ".join(out)


HEAD = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- 受講者限定。検索には載せない。 -->
<meta name="robots" content="noindex, nofollow">
<title>{title}｜思考力×AI統合講座</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/base.css">
<link rel="stylesheet" href="assets/lesson.css">
<script src="assets/gate.js" data-gate="lesson"></script>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <a class="logo" href="lessons.html">合同会社To<em>do</em> — 講座資料</a>
    <a class="navlink" href="lessons.html">資料の一覧 →</a>
  </div>
</nav>

<main class="wrap lesson">
"""

DECK_JS = """
<script>
(function () {
  var studio = document.querySelector('.studio');
  if (!studio) return;

  /* --- スライドを送る。画像を入れ替えるだけで、外には何も送らない --- */
  var total = Number(studio.dataset.total);
  var slug = studio.dataset.slug;
  var img = document.getElementById('deck-img');
  var now = document.getElementById('deck-now');
  var prev = document.getElementById('deck-prev');
  var next = document.getElementById('deck-next');
  var i = 1;

  function src(n) { return 'slides/' + slug + '/' + String(n).padStart(2, '0') + '.png'; }
  function preload(n) { if (n >= 1 && n <= total) { new Image().src = src(n); } }

  function show(n) {
    i = Math.min(Math.max(n, 1), total);
    img.src = src(i);
    img.alt = img.alt.replace(/スライド \\d+/, 'スライド ' + i);
    now.textContent = i;
    prev.disabled = i === 1;
    next.disabled = i === total;
    preload(i + 1);
  }
  prev.addEventListener('click', function () { show(i - 1); });
  next.addEventListener('click', function () { show(i + 1); });
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
  });
  preload(2);

  /* --- ワーク欄。書いたものはこのブラウザにだけ残す --- */
  var box = document.getElementById('work');
  var state = document.getElementById('work-state');
  var KEY = 'todo-work-' + slug;
  var timer;

  function say(text) {
    state.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(function () { state.textContent = ''; }, 2200);
  }

  try {
    var saved = localStorage.getItem(KEY);
    if (saved) { box.value = saved; state.textContent = '前回の続きを開いています'; }
  } catch (e) {}

  var saveTimer;
  box.addEventListener('input', function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, box.value); say('保存しました'); } catch (e) {}
    }, 600);
  });

  document.getElementById('work-copy').addEventListener('click', function () {
    if (!box.value.trim()) { say('まだ何も書かれていません'); return; }
    navigator.clipboard.writeText(box.value).then(
      function () { say('コピーしました。Slackに貼ってください'); },
      function () { box.select(); say('選択しました。Ctrl+Cでコピーしてください'); }
    );
  });

  document.getElementById('work-clear').addEventListener('click', function () {
    if (!box.value.trim()) return;
    if (!confirm('書いた内容を消します。よろしいですか。')) return;
    box.value = '';
    try { localStorage.removeItem(KEY); } catch (e) {}
    say('消しました');
    box.focus();
  });

  /* --- 質問を運営に送る。届け先はSlack（サーバ側で中継する） --- */
  var ASK_URL = 'https://todo-demo-tool.todo-inc-2023-10-13.workers.dev/ask';
  var ask = document.getElementById('ask');
  var askName = document.getElementById('ask-name');
  var askSend = document.getElementById('ask-send');
  var askState = document.getElementById('ask-state');
  var askWhere = document.getElementById('ask-where');
  var NAMEKEY = 'todo-ask-name';

  try {
    var savedName = localStorage.getItem(NAMEKEY);
    if (savedName) askName.value = savedName;
  } catch (e) {}

  function askSay(text) { askState.textContent = text; }

  /* 見ているスライドの番号を、送るときに自動でつける */
  function markWhere() { askWhere.textContent = 'スライド ' + i; }
  prev.addEventListener('click', markWhere);
  next.addEventListener('click', markWhere);
  document.addEventListener('keydown', markWhere);

  function send() {
    var text = ask.value.trim();
    if (!text) { askSay('質問が空です'); ask.focus(); return; }
    askSend.disabled = true;
    askSay('送っています…');
    try { localStorage.setItem(NAMEKEY, askName.value.trim()); } catch (e) {}

    fetch(ASK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lesson: (studio.querySelector('.kicker') || {}).textContent + ' ' + document.title.split('｜')[0],
        slide: String(i),
        name: askName.value.trim(),
        text: text,
        website: document.getElementById('ask-website').value
      })
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
      askSend.disabled = false;
      if (!res.ok) { askSay(res.d.error || '送れませんでした'); return; }
      ask.value = '';
      askSay('送りました。ありがとうございます');
    }).catch(function () {
      askSend.disabled = false;
      askSay('送れませんでした。通信を確かめて、もう一度お願いします');
    });
  }

  askSend.addEventListener('click', send);
  ask.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    if (e.isComposing || e.keyCode === 229) return;   /* 変換中 */
    e.preventDefault();
    send();
  });
})();
</script>
"""

FOOT = """
  <div class="lesson-nav">{nav}</div>
  <footer>合同会社Todo　思考力×AI統合講座　受講者向け資料　<a href="lessons.html">一覧</a></footer>
</main>
{deck_js}
</body>
</html>
"""


def render_lesson(lesson: Lesson, prev: Lesson | None, nxt: Lesson | None) -> str:
    m = lesson.meta
    facts = [(k, m[k]) for k in ("日付", "所要", "種別") if m.get(k)]
    factline = "".join(f'<span><em>{html.escape(k)}</em>{html.escape(v)}</span>' for k, v in facts)
    aim = f'<p class="aim">{inline(m["ねらい"])}</p>' if m.get("ねらい") else ""
    badge = "" if lesson.written else '<span class="wip">準備中</span>'

    nav = []
    if prev:
        nav.append(f'<a href="{prev.slug}.html">← 第{html.escape(str(prev.number))}回</a>')
    nav.append('<a href="lessons.html">一覧</a>')
    if nxt:
        nav.append(f'<a href="{nxt.slug}.html">第{html.escape(str(nxt.number))}回 →</a>')

    info = f"""<div class="info">
        <div class="kicker">第{html.escape(str(lesson.number))}回{badge}</div>
        <h1>{inline(lesson.title)}</h1>
        {aim}
        <div class="facts">{factline}</div>
      </div>"""

    n = SLIDES.get(lesson.slug, 0)
    if n:
        # スライドがある回は、この情報を横に寄せてスライドを上に出す
        head = f'''  <section class="studio" data-slug="{lesson.slug}" data-total="{n}">
    <div class="studio-inner">
      {info}

      <div class="deck">
        <div class="deck-stage">
          <img id="deck-img" src="slides/{lesson.slug}/01.png"
               alt="第{html.escape(str(lesson.number))}回 スライド 1"
               draggable="false" decoding="async">
        </div>
        <div class="deck-bar">
          <button type="button" class="deck-btn" id="deck-prev" aria-label="前のスライド" disabled>← 前</button>
          <span class="deck-count"><b id="deck-now">1</b> / {n}<em>矢印キーでも進みます</em></span>
          <button type="button" class="deck-btn" id="deck-next" aria-label="次のスライド">次 →</button>
        </div>
      </div>

      <div class="writer">
        <div class="writer-head">
          <label for="work">ワークを書く</label>
          <span class="writer-state" id="work-state" role="status"></span>
        </div>
        <textarea id="work" spellcheck="false"
          placeholder="スライドを見ながら、ここに書いてください。&#10;書いたものは、コピーしてSlackの公開スレッドに投稿します。"></textarea>
        <div class="writer-bar">
          <button type="button" class="deck-btn" id="work-copy">コピーする</button>
          <button type="button" class="deck-btn writer-clear" id="work-clear">消す</button>
          <p class="writer-note">この欄は<b>あなたのブラウザの中にだけ</b>残ります。運営には届きません。書けたらコピーして、Slackに貼って提出してください。</p>
        </div>
      </div>

      <div class="asker">
        <div class="asker-head">
          <label for="ask">このスライドについて質問する</label>
          <span class="asker-where" id="ask-where">スライド 1</span>
        </div>
        <textarea id="ask" rows="3"
          placeholder="分からなかったところを、そのまま書いてください。&#10;どのスライドを見ていたかは自動でつきます。"></textarea>
        <div class="asker-bar">
          <input id="ask-name" type="text" autocomplete="name" placeholder="お名前（任意）">
          <button type="button" class="deck-btn asker-send" id="ask-send">運営に送る</button>
          <span class="asker-state" id="ask-state" role="status"></span>
        </div>
        <input id="ask-website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" class="asker-trap">
        <p class="writer-note">運営に直接届きます。名前は空でも構いません。答えはSlackでお返しします。</p>
      </div>
    </div>
  </section>'''
    else:
        head = f'  <div class="lesson-head">\n    {info}\n  </div>'

    return (HEAD.format(title=html.escape(lesson.title))
            + head
            + f"""

  <article class="body">
      {render_blocks(lesson.blocks)}
  </article>
"""
            + FOOT.format(nav="　".join(nav), deck_js=DECK_JS if n else ""))


def render_index(lessons: list[Lesson]) -> str:
    done = sum(1 for x in lessons if x.written)
    rows = []
    for x in lessons:
        state = "書けています" if x.written else "準備中"
        cls = "is-done" if x.written else "is-wip"
        rows.append(
            f'<a class="lrow {cls}" href="{x.slug}.html">'
            f'<span class="ln">第{html.escape(str(x.number))}回</span>'
            f'<span class="lt">{inline(x.title)}</span>'
            f'<span class="ld">{html.escape(x.meta.get("日付", ""))}</span>'
            f'<span class="ls">{state}</span></a>')
    return (HEAD.format(title="講座資料の一覧").replace('<main class="wrap lesson">', '<main class="wrap">')
            + f"""  <div class="lesson-head">
    <div class="kicker">Curriculum</div>
    <h1>講座資料</h1>
    <p class="aim">デモ1回と本編{len(lessons) - 1}回。書き上がった回から順に開けるようになります。</p>
    <div class="facts"><span><em>書けている回</em>{done} / {len(lessons)}</span></div>
  </div>

  <div class="lessonlist">
    {''.join(rows)}
  </div>
"""
            + FOOT.format(nav="", deck_js=""))


def load() -> list[Lesson]:
    lessons = []
    for path in sorted(HERE.glob("lesson-*.md")):
        meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
        lessons.append(Lesson(slug=path.stem, meta=meta, blocks=parse_body(body)))
    return lessons


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="確認だけして、ファイルは作らない")
    args = parser.parse_args()

    lessons = load()
    if not lessons:
        raise SystemExit("curriculum/lesson-*.md が見つかりません。")

    for x in lessons:
        mark = "書けています" if x.written else "準備中    "
        print(f"  {mark}  第{x.number}回  {x.title}")
    done = sum(1 for x in lessons if x.written)
    print(f"\n{len(lessons)}回中 {done}回 が書けています。")

    if args.check:
        return

    for i, x in enumerate(lessons):
        prev = lessons[i - 1] if i > 0 else None
        nxt = lessons[i + 1] if i + 1 < len(lessons) else None
        (OUT / f"{x.slug}.html").write_text(render_lesson(x, prev, nxt), encoding="utf-8")
    (OUT / "lessons.html").write_text(render_index(lessons), encoding="utf-8")
    print(f"docs/ に {len(lessons) + 1} ページを書き出しました（一覧を含む）。")


if __name__ == "__main__":
    main()

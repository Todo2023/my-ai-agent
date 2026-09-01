"""スライド（.pptx）を、ページに埋め込む画像に変換する。

なぜ画像にするか:
受講者にはページ上で読んでもらい、ファイルは配らない方針にした。
PowerPointのまま置くと、URLを知っている人がそのままダウンロードできてしまう。

なぜ元ファイルを docs/ の外に置くか:
docs/ はそのままWebに出る。**元ファイルを docs/ に置いた時点で配ったのと同じ**なので、
元は curriculum/slides_src/ に置き、出来上がった画像だけを docs/ に入れる。

必要なもの:
    LibreOffice（soffice）と pymupdf。**この変換はTodoさんのPCでは行いません。**
    スライドを差し替えたときは、Claudeに渡してください。こちらで変換して入れます。

使い方:
    uv run --with pymupdf curriculum/slides.py
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "slides_src"
OUT = HERE.parent / "docs" / "slides"
MANIFEST = HERE / "slides.json"
DPI = 110


def to_pdf(pptx: Path, workdir: Path) -> Path:
    """LibreOffice で PDF にする。書き込めるプロファイルを毎回作る。"""
    profile = workdir / "lo"
    subprocess.run(
        ["soffice", "--headless", f"-env:UserInstallation=file://{profile}",
         "--convert-to", "pdf", "--outdir", str(workdir), str(pptx)],
        check=True, capture_output=True, timeout=300,
    )
    pdf = workdir / (pptx.stem + ".pdf")
    if not pdf.exists():
        raise SystemExit(f"PDFに変換できませんでした: {pptx.name}")
    return pdf


def main() -> None:
    try:
        import pymupdf
    except ImportError:
        raise SystemExit("pymupdf がありません。uv run --with pymupdf curriculum/slides.py で実行してください。")
    if not shutil.which("soffice"):
        raise SystemExit("LibreOffice（soffice）が見つかりません。この変換はTodoさんのPCでは行いません。")

    manifest = {}
    for pptx in sorted(SRC.glob("lesson-*.pptx")):
        stem = pptx.stem
        dest = OUT / stem
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)

        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            # 空白入りのパスで転ばないよう、作業用にコピーしてから渡す
            work = tmpdir / pptx.name
            shutil.copy(pptx, work)
            doc = pymupdf.open(to_pdf(work, tmpdir))
            for i, page in enumerate(doc, 1):
                page.get_pixmap(dpi=DPI).save(dest / f"{i:02d}.png")
            manifest[stem] = doc.page_count
            doc.close()
        print(f"  {stem}  {manifest[stem]}枚")

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(manifest.values())
    size = sum(f.stat().st_size for f in OUT.rglob("*.png"))
    print(f"\n{len(manifest)}本 / 計{total}枚 / {size/1024/1024:.1f}MB を docs/slides/ に書き出しました。")
    print("続けて uv run curriculum/build.py を実行してください。")


if __name__ == "__main__":
    main()

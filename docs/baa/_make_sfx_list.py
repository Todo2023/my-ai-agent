"""sfx/ に置いた音源ファイルの一覧（sfx/list.json）を作る。

    python3 _make_sfx_list.py

アプリはこの一覧に載っているものだけを読みに行く。
ファイルを置いたり消したりしたら、これを動かすこと。
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = os.path.join(HERE, "sfx")
EXT = (".mp3", ".ogg", ".wav", ".m4a")

listing = {}
for f in sorted(os.listdir(SFX)):
    name, ext = os.path.splitext(f)
    if ext.lower() in EXT:
        listing[name] = f

with open(os.path.join(SFX, "list.json"), "w", encoding="utf-8") as fp:
    json.dump(listing, fp, ensure_ascii=False, indent=2)
    fp.write("\n")

print("sfx/list.json:", listing if listing else "（まだ何も置いていない）")

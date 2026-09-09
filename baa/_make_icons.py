"""アイコンのPNGを作る。外部ライブラリは使わない（zlib と struct だけ）。

  python3 _make_icons.py

いぬの顔をベタ塗りで描くだけ。作り直すときだけ動かす。
"""
import struct, zlib

BG = (0xFF, 0xE9, 0xC7)
FUR = (0xF0, 0xB3, 0x57)
EAR = (0xC9, 0x8A, 0x2E)
EYE = (0x3D, 0x3D, 0x3D)
CHEEK = (0xFF, 0x9D, 0xB0)


def draw(size, scale, bg=BG):
    """size x size の画素を作る。scale は顔の大きさ（1.0 で画面いっぱい寄り）。"""
    px = [[bg for _ in range(size)] for _ in range(size)]

    def disc(cx, cy, rx, ry, color):
        for y in range(max(0, int(cy - ry)), min(size, int(cy + ry) + 1)):
            for x in range(max(0, int(cx - rx)), min(size, int(cx + rx) + 1)):
                dx, dy = (x - cx) / rx, (y - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    px[y][x] = color

    u = size / 100.0 * scale
    off = size / 2 - 50 * u  # 中央に寄せる
    def P(v):
        return off + v * u

    disc(P(20), P(52), 11 * u, 19 * u, EAR)   # 垂れ耳
    disc(P(80), P(52), 11 * u, 19 * u, EAR)
    disc(P(50), P(54), 38 * u, 38 * u, FUR)   # 顔
    disc(P(28), P(66), 7 * u, 7 * u, CHEEK)   # ほっぺ
    disc(P(72), P(66), 7 * u, 7 * u, CHEEK)
    disc(P(36), P(52), 5.5 * u, 5.5 * u, EYE)  # 目
    disc(P(64), P(52), 5.5 * u, 5.5 * u, EYE)
    disc(P(50), P(63), 5 * u, 4 * u, (0x4A, 0x3A, 0x33))  # はな
    disc(P(50), P(74), 9 * u, 5 * u, (0x4A, 0x3A, 0x33))  # くち
    disc(P(50), P(71), 9 * u, 4 * u, FUR)                 # くちの上を塗って三日月に
    return px


def write_png(path, px):
    size = len(px)
    raw = b"".join(b"\x00" + bytes(v for p in row for v in p) for row in px)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(path, size)


write_png("icon-192.png", draw(192, 1.0))
write_png("icon-512.png", draw(512, 1.0))
write_png("apple-touch-icon.png", draw(180, 1.0))
# maskable は端が切られる。中央8割に収める
write_png("icon-maskable-512.png", draw(512, 0.72))

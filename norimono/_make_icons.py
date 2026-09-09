"""アイコンのPNGを作る。外部ライブラリは使わない（zlib と struct だけ）。

    のりもの版。赤い車を横から見た形。

  python3 _make_icons.py

いぬの顔をベタ塗りで描くだけ。作り直すときだけ動かす。
"""
import struct, zlib

BG = (0xD9, 0xF2, 0xFF)
BODY = (0xE5, 0x48, 0x4D)
ROOF = (0xC2, 0x37, 0x3C)
WIN = (0xCF, 0xE9, 0xFF)
TIRE = (0x3A, 0x3A, 0x42)
EYE = (0x3D, 0x3D, 0x3D)


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

    def box(x0, y0, x1, y1, color):
        for y in range(max(0, int(y0)), min(size, int(y1))):
            for x in range(max(0, int(x0)), min(size, int(x1))):
                px[y][x] = color

    box(P(14), P(46), P(86), P(70), BODY)   # 車体
    box(P(28), P(30), P(72), P(48), ROOF)   # 屋根
    box(P(34), P(34), P(66), P(46), WIN)    # 窓
    disc(P(30), P(52), 7 * u, 7 * u, EYE)   # 目
    disc(P(50), P(52), 7 * u, 7 * u, EYE)
    disc(P(32), P(72), 12 * u, 12 * u, TIRE)  # タイヤ
    disc(P(70), P(72), 12 * u, 12 * u, TIRE)
    disc(P(32), P(72), 5 * u, 5 * u, WIN)
    disc(P(70), P(72), 5 * u, 5 * u, WIN)
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

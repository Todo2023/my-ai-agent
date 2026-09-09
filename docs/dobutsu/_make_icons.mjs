// アイコンのPNGを作る。node _make_icons.mjs で書き出す。
// 外部ライブラリは使わない（追加費用も、インストールも いらないように）。
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const px = (w, h) => ({ w, h, d: new Uint8Array(w * h * 4) });

function set(im, x, y, [r, g, b], a = 1) {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h || a <= 0) return;
  const i = (y * im.w + x) * 4, d = im.d, ia = 1 - a;
  d[i] = r * a + d[i] * ia; d[i + 1] = g * a + d[i + 1] * ia;
  d[i + 2] = b * a + d[i + 2] * ia; d[i + 3] = 255 * a + d[i + 3] * ia;
}

// だ円（回転つき）。ふちを少しぼかしてギザギザを消す。
function ellipse(im, cx, cy, rx, ry, col, rot = 0) {
  const co = Math.cos(-rot), si = Math.sin(-rot);
  const R = Math.max(rx, ry) + 2;
  for (let y = Math.floor(cy - R); y <= cy + R; y++)
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x - cx, dy = y - cy;
      const u = (dx * co - dy * si) / rx, v = (dx * si + dy * co) / ry;
      const d = Math.sqrt(u * u + v * v);
      const edge = 1 / Math.max(rx, ry);
      if (d < 1 + edge) set(im, x, y, col, Math.min(1, (1 + edge - d) / (edge * 2)));
    }
}

function png(im) {
  const raw = Buffer.alloc(im.h * (im.w * 4 + 1));
  for (let y = 0; y < im.h; y++) {
    raw[y * (im.w * 4 + 1)] = 0;
    Buffer.from(im.d.buffer, y * im.w * 4, im.w * 4).copy(raw, y * (im.w * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(im.w, 0); ihdr.writeUInt32BE(im.h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TBL = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 255] ^ (c >>> 8); return c ^ -1; }

// うさぎの顔。size は一辺、pad は絵の外側にあける余白の割合。
function icon(size, pad) {
  const im = px(size, size);
  for (let y = 0; y < size; y++) {                                  // 背景
    const q = y / size;
    const col = [0x1d + (0x3f - 0x1d) * q, 0x4a + (0x8c - 0x4a) * q, 0x2c + (0x54 - 0x2c) * q];
    for (let x = 0; x < size; x++) set(im, x, y, col, 1);
  }
  const s = size * (1 - pad * 2), cx = size / 2, cy = size * 0.58;
  const white = [246, 242, 238], pink = [240, 175, 190], ink = [43, 43, 51];
  ellipse(im, cx - s * 0.16, cy - s * 0.36, s * 0.075, s * 0.22, white, -0.12);   // 耳
  ellipse(im, cx + s * 0.16, cy - s * 0.36, s * 0.075, s * 0.22, white, 0.12);
  ellipse(im, cx - s * 0.16, cy - s * 0.36, s * 0.036, s * 0.15, pink, -0.12);
  ellipse(im, cx + s * 0.16, cy - s * 0.36, s * 0.036, s * 0.15, pink, 0.12);
  ellipse(im, cx, cy, s * 0.30, s * 0.27, white);                                // 顔
  ellipse(im, cx - s * 0.12, cy - s * 0.03, s * 0.045, s * 0.05, ink);           // 目
  ellipse(im, cx + s * 0.12, cy - s * 0.03, s * 0.045, s * 0.05, ink);
  ellipse(im, cx, cy + s * 0.09, s * 0.05, s * 0.035, pink);                     // 鼻
  return png(im);
}

writeFileSync(new URL("./icon-192.png", import.meta.url), icon(192, 0.06));
writeFileSync(new URL("./icon-512.png", import.meta.url), icon(512, 0.06));
writeFileSync(new URL("./icon-maskable-512.png", import.meta.url), icon(512, 0.20));
writeFileSync(new URL("./apple-touch-icon.png", import.meta.url), icon(180, 0.06));
console.log("アイコンを4つ書き出しました");

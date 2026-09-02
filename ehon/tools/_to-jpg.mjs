/**
 * 写真のような絵（PNG）を、配っても重くない JPEG にする。
 *
 *   node ehon/tools/_to-jpg.mjs <フォルダ> <品質 0〜1>
 *
 * 手で描いた絵を入れるときだけ使う道具。ふだんの絵は SVG なので要らない。
 *
 * ■ なぜ要るか
 *   もらった PNG は1枚2MB あった。10枚で21MB。サイト全部で1.7MBなので、
 *   このまま置くと**圏外で読める強みが消える**。見た目が落ちない範囲で軽くする。
 *
 * ■ 依存パッケージは足さない
 *   Chromium を1回起動して canvas で焼き直すだけ（build-posts.mjs と同じ手）。
 */
import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const dir = process.argv[2];
const quality = Number(process.argv[3] || 0.82);
if (!dir) { console.error("フォルダを指定してください"); process.exit(1); }

const CHROME = [
  process.env.CHROME, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium", "/usr/bin/google-chrome",
].filter(Boolean).find((c) => existsSync(c));
if (!CHROME) { console.error("Chromium が見つかりません"); process.exit(1); }

const files = (await readdir(dir)).filter((f) => /\.png$/i.test(f)).sort();
const tmp = join(dir, "_tmp.html");
let before = 0, after = 0;

for (const f of files) {
  const buf = await readFile(join(dir, f));
  before += buf.length;
  const uri = `data:image/png;base64,${buf.toString("base64")}`;

  await writeFile(tmp, `<!doctype html><meta charset="utf-8"><body><div id="out">yet</div><script>
const img = new Image();
img.onerror = () => { document.getElementById("out").textContent = "ERR"; };
img.onload = () => {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  document.getElementById("out").textContent = c.toDataURL("image/jpeg", ${quality});
};
img.src = "${uri}";
</script></body>`, "utf8");

  const { stdout } = await run(CHROME, [
    "--headless", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=15000",
    "--dump-dom", `file://${join(process.cwd(), tmp)}`,
  ], { maxBuffer: 512 * 1024 * 1024 });

  const m = stdout.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/);
  if (!m) { console.error(`× ${f}: 焼き直せませんでした`); process.exitCode = 1; continue; }
  const jpg = Buffer.from(m[1], "base64");
  after += jpg.length;
  await writeFile(join(dir, `${basename(f, ".png")}.jpg`), jpg);
  console.log(`○ ${f}　${Math.round(buf.length / 1024)}KB → ${Math.round(jpg.length / 1024)}KB`);
}

await rm(tmp, { force: true });
console.log(`\n合計 ${Math.round(before / 1024 / 1024 * 10) / 10}MB → ${Math.round(after / 1024 / 1024 * 10) / 10}MB`);

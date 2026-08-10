/*
 * アイコン一式（icon-192 / icon-512 / icon-maskable-512 / apple-touch-icon）を書き出す。
 *   npm i playwright && node tools/make-icons.js
 *
 * 同じ階層に icon-source.png（正方形の絵）があればそれを使う。
 * 無ければ _icon.html の Canvas で描いたルーレット＋肉球のアイコンになる。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SOURCE = ['icon-source.png', 'icon-source.jpg', 'icon-source.jpeg', 'icon-source.webp']
  .map((f) => path.join(ROOT, f))
  .find((f) => fs.existsSync(f));

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const page = await browser.newPage();
  await page.goto('file://' + path.join(ROOT, '_icon.html'));

  let sourceDataUrl = null;
  if (SOURCE) {
    const type = MIME[path.extname(SOURCE).toLowerCase()] || 'image/png';
    sourceDataUrl = `data:${type};base64,` + fs.readFileSync(SOURCE).toString('base64');
    console.log('元にする絵:', path.basename(SOURCE));
  } else {
    console.log('元にする絵: なし（_icon.html で描いたものを使います）');
  }

  for (const t of TARGETS) {
    const dataUrl = sourceDataUrl
      ? await page.evaluate(
          ([src, size, maskable]) => window.renderFromImage(src, size, maskable),
          [sourceDataUrl, t.size, t.maskable]
        )
      : await page.evaluate(
          ([size, maskable]) => window.renderIcon(size, maskable),
          [t.size, t.maskable]
        );
    fs.writeFileSync(path.join(ROOT, t.file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote', t.file);
  }

  await browser.close();
})();

/*
 * _icon.html の Canvas を PNG に書き出す。
 *   npm i playwright && node tools/make-icons.js
 * 生成物: icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
  });
  const page = await browser.newPage();
  await page.goto('file://' + path.join(ROOT, '_icon.html'));

  for (const t of TARGETS) {
    const dataUrl = await page.evaluate(
      ([size, maskable]) => window.renderIcon(size, maskable),
      [t.size, t.maskable]
    );
    fs.writeFileSync(path.join(ROOT, t.file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote', t.file);
  }

  await browser.close();
})();

/**
 * _icon.html を Chromium で描いて、PWA 用の PNG を書き出す。
 * アイコンの絵を変えたときだけ実行する:  node kakei/_build_icons.js
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

(async () => {
  const dir = __dirname;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(dir, "_icon.html"));

  const shots = [
    ["icon-512.png", 512, false],
    ["icon-192.png", 192, false],
    ["apple-touch-icon.png", 180, false],
    ["icon-maskable-512.png", 512, true],
  ];

  for (const [name, size, maskable] of shots) {
    const data = await page.evaluate(([size, maskable]) => {
      window.render(maskable);
      return window.toPNG(size);
    }, [size, maskable]);
    fs.writeFileSync(path.join(dir, name), Buffer.from(data.split(",")[1], "base64"));
    console.log(name, size);
  }

  await browser.close();
})();

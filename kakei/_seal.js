/**
 * 家計に封をする。中身を暗号文にして preset.enc.json に書き出す。
 *
 *   node kakei/_seal.js <書き出したJSON> [合い言葉]
 *
 * 元になるのは、アプリの設定にある「⬇ 書き出す（JSON）」で作ったファイル。
 * **元のJSONはリポジトリの中に置かないこと**（置いたら封をした意味がなくなる）。
 *
 * 中身を直したくなったら、アプリで直す → 書き出す → これを実行する → commit。
 * 合い言葉を省くと、いま設定されているものと同じでは作れないので、必ず渡す。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { canon } = require("./secret.js");

const ITER = 310000;   // PBKDF2 の回し数。スマホで0.3秒ほど。総当たりを高くつかせるため

const [, , src, pass, outArg] = process.argv;
if (!src || !pass) {
  console.error("使い方: node kakei/_seal.js <書き出したJSON> <合い言葉> [出力先]");
  process.exit(1);
}

const plain = fs.readFileSync(src, "utf8");
JSON.parse(plain);   // 壊れたJSONに封をしても、開けたときに困るだけ

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(canon(pass), salt, ITER, 32, "sha256");

const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
// Web Crypto は「暗号文のうしろに認証タグ」の並びで渡す決まりなので、そこに合わせる
const data = Buffer.concat([body, cipher.getAuthTag()]);

const out = {
  note: "この家計は合い言葉で封をしてあります。中身は AES-256-GCM の暗号文です。",
  v: 1,
  // いつ封をしたか。中身は隠すが、この印だけは表に出す。
  // すでに開いた端末が「配信されたほうが新しい」と気づけるようにするため
  stamp: new Date().toISOString(),
  kdf: "PBKDF2-SHA256",
  iter: ITER,
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  data: data.toString("base64"),
};

const dest = outArg || path.join(__dirname, "preset.enc.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`封をしました: ${dest}`);
console.log(`  元の大きさ ${plain.length} バイト → 暗号文 ${data.length} バイト`);
console.log(`  合い言葉「${pass}」→ 鍵のもと「${canon(pass)}」`);

# わんわん るーれっと

ルーレットを回すと、止まったマスの動画（YouTube の無料動画）がそのまま再生される、
幼児がひとりでも操作できるアプリ。スマホにインストールできる PWA（Android / iPhone どちらも可）。
`todo-banshaku` と同じ作りで、GitHub Pages がそのまま配信する。

```
# ローカルで動かす（Service Worker を使うので http で開く）
python3 -m http.server 8000
# → http://localhost:8000
```

## スマホに入れる

**https://todo2023.github.io/todo-wanwan/** を開くと、まずインストール画面が出る。

- **Android（Chrome）**: 「📲 アプリとして入れる」ボタンをタップ
- **iPhone（Safari）**: 画面の案内どおり、共有 → 「ホーム画面に追加」

ボタンは `beforeinstallprompt` を受け取ったときだけ出る。来ない端末には端末別の手順文を出す。
ホーム画面のアイコンから起動したときは、この画面を挟まず `app.html` へ転送する
（manifest の `start_url` も `app.html`）。

一度開けば、通信がなくても画面自体は開く（`sw.js` が一式をキャッシュする）。
ただし**動画の再生には通信が必要**。YouTube への通信は Service Worker では触らない。

公開は `Todo2023/todo-wanwan` の `main` を GitHub Pages がそのまま配信している。
専用リポジトリに分けてあるのは、同じサイトに別の PWA があると `scope` が重なって
インストールできなくなるため。このディレクトリはその写し。

## 人に渡す

**https://todo2023.github.io/todo-wanwan/** を送るだけ。QRは `qr.png`（URLを変えたら
`pip install segno && python3 tools/make-qr.py` で作り直す）。

LINE などアプリ内のブラウザで開かれるとホーム画面に追加できないので、
その場合は案内画面が「まず Safari で開いてください」と出す。

## できること

- **ルーレット式**：まんなかの「まわす」を押すと回って止まり、止まったマスの動画が始まる
- **自分で選べる**：マスを直接タップすれば、その動画をすぐ再生できる
- **わんわん中心**：わんわん（いないいないばあっ！）のルーレットが初期表示で、
  **はるちゃんが出てくる回**を優先してマスに並べ、さらに当たりやすく重みづけしている
- **YouTube のUIを触らせない**：プレイヤーの上にフタをかぶせ、操作は下の大きなボタン3つだけ
- **再生できない動画は自動でスキップ**（埋め込み禁止・削除ずみなど）
- **見守りタイマー**：既定20分で「おしまい」画面になり、解除は大人の長押し（1.5秒）

## 動画の入れかえ

`videos.js` だけを編集する。

```js
{ id: '0oc7_yryqYQ', short: 'わ〜お', emoji: '🙌', haru: true, title: 'メモ' }
```

| 項目 | 意味 |
| --- | --- |
| `id` | `https://www.youtube.com/watch?v=XXXXXXXXXXX` の `XXXXXXXXXXX` |
| `short` | ルーレットのマスに出る短い名前（3〜6文字くらい） |
| `emoji` | マスに出る絵 |
| `haru` | はるちゃんが出る回は `true`（ルーレットで当たりやすくなる） |
| `title` | 画面には出ないメモ |

設定は同じファイルの `APP_CONFIG`。

| 設定 | 既定値 | 内容 |
| --- | --- | --- |
| `sessionMinutes` | `20` | 続けて見られる時間（分）。`0` で無制限 |
| `autoPlayNext` | `true` | 1本終わったら次を自動再生 |
| `wheelSlots` | `8` | ルーレットのマス数 |
| `haruWeight` | `3` | はるちゃん回の当たりやすさ（倍率） |

`videos.js` を変えたら `sw.js` の `CACHE` の版番号（`todo-wanwan-v6`）を1つ上げる。
上げないと、すでに入れた端末で古いリストが残る。

## ファイル

| | |
| --- | --- |
| `index.html` | インストール案内画面。URLやQRはここに着く |
| `app.html` | アプリ本体。PWA の設定はここと index の両方 |
| `style.css` / `app.js` | 見た目とルーレット・プレイヤー制御 |
| `videos.js` | 動画リストと設定（普段さわるのはここだけ） |
| `manifest.webmanifest` / `sw.js` | インストールとオフライン |
| `icon-*.png` / `apple-touch-icon.png` | アイコン（`icon-source.png` から円形に切り出したもの） |
| `_icon.html` / `tools/make-icons.js` | アイコンの元と書き出しスクリプト |
| `icon-source.png` | アイコンの元にした絵 |
| `qr.png` / `tools/make-qr.py` | 共有用QRと、その作り直しスクリプト |
| `demo.html` | 1ファイル完結の簡易版。開くだけで動くが自動スキップ・一時停止はない |

アイコンを描き直したら次を実行する。

```
npm i playwright && node tools/make-icons.js
```

## 注意

- 埋め込みが許可されていない動画は再生できない。アプリが自動で次に飛ぶので、
  気づいたら `videos.js` から削除する
- 動画が非公開・削除されると再生できなくなるため、ときどき見直す
- 音声つき自動再生はブラウザの制限があるため、必ず画面のタップ（＝ルーレットの操作）を起点にしている

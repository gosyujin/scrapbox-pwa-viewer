# scrapbox_viewer

Scrapboxプロジェクトのエクスポート JSON（設定画面の「Export」→ JSON）を、
単一の自己完結 HTML ファイル（+ Service Worker）に変換するビルドスクリプト。

- PC: 生成された HTML をダブルクリックで開くだけで、高速にページ一覧・検索・閲覧ができる。
- スマホ: **GitHub Pages で一度だけ公開し、Safari で一度開くと Service Worker がページ全体を
  キャッシュする。** 以降は機内モードでも通常のSafari（ホーム画面に追加すればアプリ風にも）で
  完全にオフライン動作する。
  （画像は外部URL参照のままなので、オフライン時は表示されない。テキスト・コード・リンク・
  バックリンクはすべてファイル内に埋め込み済みで問題なく見える）

> iOS Safari は `file://` でローカルHTMLを直接開く手段を持たず、Files アプリ経由の
> クイックルック表示は大きいファイルで固まりやすいため、GitHub Pages 経由での配布を採用している。

## 使い方

```bash
python3 build.py --input /path/to/export.json
```

- `--input` : Scrapbox からエクスポートした JSON ファイル
- `--output`: 生成する HTML のパス（省略時は `docs/index.html`。`sw.js` / `manifest.json` は
  同じディレクトリに自動生成される）
- `--title` : 表示タイトルを上書きしたい場合に指定（省略時はプロジェクトの表示名）

生成物は `docs/index.html`・`docs/sw.js`・`docs/manifest.json` の3つ。この3つを配布・
デプロイすればOK（他に依存ファイルなし）。

## GitHub Pages で公開してスマホをオフライン対応させる

1. このリポジトリを GitHub に push する
2. GitHub の Settings → Pages で Source を「Deploy from a branch」、
   Branch を `main` / フォルダを `/docs` に設定
3. 発行された `https://<user>.github.io/<repo>/` を **一度だけネット接続した状態で** iPhone の
   Safari で開く（Service Worker がページ全体を裏でキャッシュする）
4. 以降は機内モードでも同じURLを開けば完全にオフラインで動作する。共有シートから
   「ホーム画面に追加」すればアプリのように起動できる

再エクスポートしてページ内容を更新したときは、同じ手順で `docs/` を再生成して push すれば、
次にオンラインでアクセスしたタイミングで Service Worker が新しい内容に自動更新する。

## 動作確認（ローカルでプレビューする場合）

```bash
cd docs && python3 -m http.server 8000
```

その後 `http://localhost:8000/` を開く。

## 機能

- 全ページの一覧・検索（タイトル優先、本文もヒット、ハイライト表示）
- ページ間リンク（`[リンク]` / `#タグ` / `[[強調リンク]]`）のクリック遷移
- 該当ページが存在しない内部リンクは赤色で区別表示
- 被リンク（backlinks）一覧をページ末尾に表示
- コードブロック（`code:filename`）、テーブル（`table:name`）、引用（`>`）、
  太字/斜体/打ち消し線などの装飾、インデントによるアウトライン（箇条書き）に対応
- 画像（Gyazoなど）はリンク先URLを保持したまま埋め込み表示（オンライン時のみ表示される）
- ライト/ダークモード自動切替
- モバイル幅（760px以下）ではトップページ＝ページ一覧を直接表示し、画面下部に
  常時表示のホームボタン＋検索ボックスを配置（検索ボックスがキーボードのすぐ上に来る）
- Service Worker によるオフラインキャッシュ（初回アクセス後は機内モードでも動作）

## ディレクトリ構成

```
build.py            変換スクリプト本体（Scrapbox記法パーサ含む）
templates/
  shell.html         出力HTMLの骨格
  style.css           スタイル
  app.js              クライアント側ロジック（検索・ルーティング・描画）
  sw.js               Service Worker（そのままdocsにコピーされる）
docs/                 生成物の出力先。GitHub Pagesの公開元
```

## 制限事項・既知の非対応記法

- 画像・アイコンはダウンロードせず外部URL参照のまま（オフライン時は非表示）
- KaTeX数式 (`[$ ...]`) は未対応（プレーンテキストとして表示）
- ページ内リンクの解決はタイトルの完全一致（大文字小文字無視）のみ。別プロジェクトへの
  リンク（`/project/page`）は外部リンク的に扱われる
- GitHub Pages は公開リポジトリ前提（URLを知っていれば誰でもアクセス可能）

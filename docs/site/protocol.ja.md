# フレームワーク拡張とサイト拡張の契約

> **中身**: 実装とサイトの解説をどう繋ぐか。何を手で書き、何を生成するか。
> **読むとき**: どちらの作業を始めるときも最初に。**この1枚が正**で、役割ごとに文書は分けない。

## 全体像

```
機能を追加・修正する
  ├─ 実装（flutter/ java/ typescript/）
  ├─ spec/（スキーマ・reference.json・例・pitfalls）
  ├─ docs/site/topics.json に1行足す ──→ CI が網羅を検証（漏れたら落ちる）
  └─ site/prose/<section>/<id>.ja.md に散文を書く
                                  ↓
                    キー表・例・間違い・デモへのリンクは
                    spec/ と台帳から自動生成
```

**1つの機能は1つのブランチ・1つの PR にまとめる**（実装・spec・サイトの解説を分けない）。
分けると「片方だけ main に入った状態」が生まれて、どちらが正か分からなくなる。

散文以外は全部生成物。**同じ内容を人間向けと AI 向けで書き分けない**（1つの内容を HTML と `.md` の2つの形で出す）。

## 手で書く場所・書かない場所

| 対象 | 手で書くか |
| --- | --- |
| `flutter/` `java/` `typescript/` | ○ 実装 |
| `spec/`（スキーマ・例・pitfalls） | ○ ただし `spec/reference.json` は生成物（再生成する） |
| `docs/site/topics.json`（台帳） | ○ 1機能につき1件足す |
| `site/prose/**`（散文） | ○ ここだけが散文 |
| `site/docs/index.md` `site/docs/ai.md`（手書きページ） | ○ 必要なら |
| `site/docs/dsl/` `site/docs/partials/` `site/docs/public/` | **×** 生成物（`npm run gen` が毎回作り直す） |
| `site/tools/**`（生成・検証） | ○ 仕組みを変えるときだけ |

> 以前は「フレームワークとサイトを同じ PR で触ると CI で落とす」運用だった
> （`check-boundary.mjs`）。**1つの機能を1つの PR にまとめる**方針に変えたので、この
> チェックは外した。

## フレームワーク拡張の手順

1. 実装する（`flutter/` `typescript/` `java/`）
2. `spec/hatake-page.schema.json` を更新し、`spec/reference.json` を再生成する
3. 例（`spec/examples/`）と、間違えやすいなら `spec/pitfalls.json` に項目を足す
4. **`docs/site/topics.json` にトピックを1件足す**（下記）
5. **`site/prose/<section>/<id>.ja.md` に散文を書く**（下記。同じブランチで）
6. `cd site && node tools/check-coverage.mjs` と `node tools/site-todo.mjs` が
   「未執筆ゼロ」になることを確認する
7. `cd site && npm run build` が通ることを確認する

### 台帳に足すもの

```json
{
  "id": "table-grouping",
  "section": "dsl",
  "title": "一覧を小計付きでまとめる",
  "blurb": "同じ値で行をまとめて、グループごとの合計を出す",
  "keys": ["groupBy", "aggregate"],
  "demo": "sales_report"
}
```

| 欄 | 中身 |
| --- | --- |
| `id` | 英小文字とハイフン。URL（`/dsl/<id>`）と散文のファイル名になる |
| `section` | いまは `dsl` のみ |
| `title` | **やりたいことの言葉**で書く（キー名ではなく「一覧に列を出す」） |
| `blurb` | 1行。一覧表とページ冒頭に出る |
| `keys` | このトピックで説明するキー。ここに書いたキーの型表・例・間違いが自動で載る |
| `demo` | デモアプリの画面 id（`flutter/packages/hatake_example/assets/sales_app.yaml`）。無ければ `null` |

- キーは複数のトピックに書いてよい（`type` のように何にでも出るキーがある）。
- 既にあるトピックの話なら、新しいトピックを作らずそこの `keys` に足す。
- ページに出さないキーは `internal` に入れる。**ただし逃げ道として使わない**
  （ページに出ないキーは、利用者から見て存在しないのと同じ）。

### サイト拡張チャットの起動

`node tools/site-todo.mjs --json` の出力を使って `spawn_task` を呼ぶ。1クリックで
役割付きのチャットが立ち上がる。指示文は自己完結させる（このチャットの文脈は引き継がれない）。

`spawn_task` が無い環境では、代わりにこのコマンドを出力して終わる。

```bash
claude "/site <トピックid> の解説を書く"
```

## サイト拡張の手順

1. `cd site && npm install`（初回のみ）
2. `node tools/site-todo.mjs` でキューを見る
3. `site/prose/<section>/<id>.ja.md` に**散文だけ**書く
4. `npm run dev` で見た目を確認する
5. `npm run build` が通ることを確認する

### 散文に書くこと・書かないこと

| 書く | 書かない（生成される） |
| --- | --- |
| 何ができるか | キーの一覧・型・既定値 |
| いつ使うか、いつ使わないか | よくある間違い |
| 最小の例と、その読み方 | 例のカタログ |
| 迷いどころ（似ているキーとの違い） | デモへのリンク |

- `#`（H1）は書かない。タイトルは台帳の `title` から入る。見出しは `##` から。
- **デモへのリンクは `[デモ](/demo/)` と書かない。** デモは VitePress のページではないので、
  SPA ルータに乗っ取られて 404 になる。`<a href="/hatake/demo/" target="_self">…</a>` と書く
  （理由は `site/tools/lib/site.mjs`。間違えた書き方は `npm run gen` が落とす）。
- キー表を手で書くと、スキーマが変わったときにズレる。**絶対に書かない**。
- `site/docs/dsl/` `site/docs/partials/` `site/docs/public/` は生成物。手で編集しない
  （`node tools/generate.mjs` が毎回まるごと作り直すので、書いても消える）。

## CI が守っていること

| チェック | 落ちる条件 |
| --- | --- |
| `check-coverage.mjs` | `reference.json` のキーが、どのトピックにも `internal` にも無い／台帳の参照（キー名・section・demo）が解決しない／`id` 重複 |
| `npm run build` | リンク切れ、生成ページの構文エラー |
| `site-todo.mjs` | 落とさない（未執筆は正常）。ログに残件が出る |

## 決めたこと・積み残し

- 「済／未」はどのファイルにも保存しない。**散文ファイルが在るか無いかだけ**で判定する。
  両方のチャットが同じファイルを書き合わないため。
- `spec/reference.json` の `description` は英語なので、キー表の説明列は英語で出る。
  日本語を出すには spec 側に日本語の説明を持たせる必要がある（フレームワーク側の作業）。
- `llms.txt` のリンク先は GitHub raw のまま。Pages の URL に向け替えるとブランチ名から
  切り離せる（フレームワーク側の作業）。
- `llms-full.txt`（全文を1枚に連結）と `/en/` の英語セクションは未着手。
- **Playground は入った**（デモアプリの中。`/hatake/demo/?playground=1`、定義を載せた
  共有リンクは `?yaml=<base64>`）。サイトからは手書きページからリンクする。
- **`ci.yml` の Actions が Node 20 廃止の警告を出している**（`actions/checkout@v4`
  `actions/setup-node@v4` `actions/setup-java@v4` `actions/setup-python@v5`）。
  `site.yml` 側は上げ済み（checkout/setup-node は `@v7`）。**`ci.yml` はフレームワーク側の担当**
  なので、そちらの PR で上げる。
- デモへのリンクは `/demo/` のトップまで。**プレイグラウンドだけは URL で直接指せる**
  （`?playground=1` / `?yaml=<base64>`）。各画面を URL で指すには、デモアプリのルータを
  URL に同期させる必要がある（ロードマップの「Web URL 同期」）。

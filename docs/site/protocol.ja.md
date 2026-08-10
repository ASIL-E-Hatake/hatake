# フレームワーク拡張とサイト拡張の契約

> **中身**: 2つの作業（フレームワークを拡張する／サイトを書く）をどう分けて、どう引き継ぐか。
> **読むとき**: どちらの作業を始めるときも最初に。**この1枚が正**で、役割ごとに文書は分けない。
> **なぜ分けるか**: 説明文と実装を同じ流れで書くと、どちらが正か分からなくなる。分けたうえで、
> 繋ぎ目を機械が検証する形にする。

## 全体像

```
フレームワーク拡張        docs/site/topics.json        サイト拡張
（実装 + spec/）    ──→    に1行足す           ──→    散文を書く（prose/）
                              ↑                          ↓
                       CI が網羅を検証          キー表・例・間違いは
                       （漏れたら落ちる）        spec/ から自動生成
```

散文以外は全部生成物。**同じ内容を人間向けと AI 向けで書き分けない**（1つの内容を HTML と `.md` の2つの形で出す）。

## 担当ファイル

| 対象 | フレームワーク拡張 | サイト拡張 |
| --- | --- | --- |
| `flutter/` `java/` `typescript/` `spec/` | ○ | **×** |
| `docs/site/topics.json`（台帳） | ○ 追記する | **×** |
| `site/prose/**`（散文） | **×** | ○ |
| `site/docs/**`（手書きページ・テーマ設定） | **×** | ○ |
| `site/tools/**`（生成・検証） | **×** | ○ |
| `.github/workflows/ci.yml` | ○ | **×** |
| `.github/workflows/site.yml` | **×** | ○ |

同じ PR で両方を触ると CI（`site/tools/check-boundary.mjs`）が落ちる。どうしても同時に
変える必要があるとき（キー名の改名など）は `ALLOW_CROSS_BOUNDARY=1`。

**フレームワーク側の PR が先に main へ入る。** 台帳が main に無いと、サイト側のキューに出てこない。

## フレームワーク拡張の手順

1. 実装する（`flutter/` `typescript/` `java/`）
2. `spec/hatake-page.schema.json` を更新し、`spec/reference.json` を再生成する
3. 例（`spec/examples/`）と、間違えやすいなら `spec/pitfalls.json` に項目を足す
4. **`docs/site/topics.json` にトピックを1件足す**（下記）
5. `cd site && node tools/check-coverage.mjs` が通ることを確認する
6. `cd site && node tools/site-todo.mjs` を実行し、残件があれば
   **サイト拡張のチャットを起動する**（下記）

散文（説明文）はここで書かない。書くと担当が二重になる。

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
| `check-boundary.mjs` | フレームワークとサイトを同じ PR で変更している |
| `npm run build` | リンク切れ、生成ページの構文エラー |
| `site-todo.mjs` | 落とさない（未執筆は正常）。ログに残件が出る |

## 決めたこと・積み残し

- 「済／未」はどのファイルにも保存しない。**散文ファイルが在るか無いかだけ**で判定する。
  両方のチャットが同じファイルを書き合わないため。
- `spec/reference.json` の `description` は英語なので、キー表の説明列は英語で出る。
  日本語を出すには spec 側に日本語の説明を持たせる必要がある（フレームワーク側の作業）。
- `llms.txt` のリンク先は GitHub raw のまま。Pages の URL に向け替えるとブランチ名から
  切り離せる（フレームワーク側の作業）。
- `llms-full.txt`（全文を1枚に連結）、Playground（貼ると検証）、`/en/` の英語セクションは未着手。
- デモへのリンクは `/demo/` のトップまで。画面を URL で直接指せるようにするには
  デモアプリ側の対応が必要（フレームワーク側の作業）。

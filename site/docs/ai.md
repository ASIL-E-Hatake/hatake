---
title: AI に書かせる
description: hatake の定義を AI エージェントに書かせるための繋ぎ方。MCP・URL・CLI の3経路。
---

# AI に書かせる

AI はブラウザを開かない。だからこのページは「AI が読むページ」ではなく、**あなたの AI を hatake 対応にするための手順書**である。読者は人間。

hatake 側の仕組みは3つの入口しか持たない。使っているクライアントで選ぶ。

| 使っているもの | 選ぶ経路 |
| --- | --- |
| Claude Code / Claude Desktop など MCP 対応クライアント | [経路1: MCP](#経路1-mcp) — 一番速い |
| ChatGPT・ブラウザの AI など、MCP が使えないもの | [経路2: URL を渡す](#経路2-url-を渡す) |
| 自分で書いた定義を機械的に確かめたい | [経路3: CLI](#経路3-cli) |

## 経路1: MCP

繋ぐと、**このサイトも仕様書も読ませずに**、必要なときだけ仕様を引きに来る。渡すコンテキストが小さくて済むのでこれが一番速い。

```bash
claude mcp add hatake -- node <repo>/typescript/dist/mcp.js
```

リポジトリを clone してある場合は、同梱の `.mcp.json` がそのまま使える（事前に `cd typescript && npm install && npm run build`）。

```json
{
  "mcpServers": {
    "hatake": {
      "command": "node",
      "args": ["typescript/dist/mcp.js"]
    }
  }
}
```

エージェントに渡る道具は11個。

| 道具 | 何をするか |
| --- | --- |
| `hatake_examples` | やりたいことに近い例を取る（まずこれ。写して直すのが最速） |
| `hatake_new_page` | 新規なら雛形を出す |
| `hatake_reference` | キーの型・既定値・書ける場所を引く（仕様書を読まなくていい） |
| `hatake_validate` | 書いた定義を検証する。**必ず通す** |
| `hatake_pitfalls` | よくある間違いと直し方 |
| `hatake_api_shape` | バックエンドが返すべき JSON の形 |
| `hatake_diff` | 既存の定義を直したとき、契約を壊していないか・**確かめてほしい変化**（消えた列・ボタン・選択肢、権限の変化）はないか |
| `hatake_explain` | 書いた定義が何をする画面か、日本語で読み返す（**意図どおりか**は警告では分からない）。`before` を渡せば変更の言い直し、`brief` で1行 |
| `hatake_fix` | 指摘のうち**直し方が一意なもの**を直す（綴り違い・入れる値が決まっている指定）。自分で書き直すと別の場所を壊しがち |
| `hatake_minimize` | 冗長になった定義を短くする（既定値と同じ指定を落とす。**意味は変えない**） |
| `hatake_refs` | その定義をアプリに組み込むのに、何を登録すればいいか |

Docker で動かす手順は [MCP ガイド](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/mcp.ja.md) にある。

## 経路2: URL を渡す

MCP が使えないクライアントには、[`/llms.txt`](/llms.txt) を読ませる。ここから先の素材へは llms.txt がリンクしているので、渡すのは1本でいい。

前置きとして、これをコピーして貼る。

```text
hatake という宣言型フレームワークで業務画面を作る。
仕様は https://asil-e-hatake.github.io/hatake/llms.txt にある。まずこれを読むこと。

守ること:
- Flutter / Dart のコードは書かない。書くのは定義（YAML）だけ。
- 定義に無い機能は、実装で回避せずプラグインでの拡張を提案する。
- 近い例があれば例を写して直す。ゼロから書かない。
- 書いたら npx hatake validate にかけ、警告が出たら直す（警告は「落ちないが意図どおり動かない」書き方）。
- 知らないキーを想像で書かない。迷ったら reference.json を引く。
```

「Flutter を書かない」と明示するのが効く。指示が無いと、AI は慣れている Widget コードを書きに行く。

### 素材の一覧

<!--@include: ./partials/ai-assets.md-->

大きさを載せているのは、コンテキストに何をどれだけ積むかを選べるようにするため。全部渡す必要はない。普通は `llms.txt` か `api-cheatsheet.ja.md` の1枚で足りる。

### このサイトのページは `.md` でも取れる

どのページも、同じ URL に `.md` を付けると Markdown の素で返る。HTML を取ってタグを剥がす必要はない。

```text
https://asil-e-hatake.github.io/hatake/dsl/table-columns     ← 人間向け
https://asil-e-hatake.github.io/hatake/dsl/table-columns.md  ← AI 向け（中身は同じ）
```

人間向けと AI 向けで文書を書き分けてはいない。**同じ1つの中身を、2つの形で出しているだけ**である。書き分けると必ず片方が古くなるので、そうしない。

## 経路3: CLI

AI に書かせるにしても、最後は機械で確かめる。エージェントが `validate` を通す前提で作られているので、CI でも同じものを使う。

```bash
npx hatake validate page.yaml          # 検証。--json で機械可読、--warn-as-error で CI を落とせる
npx hatake new crud --id customer --title 顧客マスタ
npx hatake reference rowsPerPage       # そのキーの型・既定値・書ける場所
npx hatake examples 帳票               # 近い例
npx hatake pitfalls groupBy            # 間違い → 正しい書き方
npx hatake failures unknown-repository # 実際に転んだ実例（なぜそう書くか付き）
npx hatake explain page.yaml           # この定義、結局どういう画面？
npx hatake explain page.yaml --brief   # 1行の要約（app なら画面一覧の表）
npx hatake explain --diff before.yaml page.yaml  # 何を変えたのか、画面の言葉で
npx hatake harvest definitions/        # 繰り返し転んでいる所を実例カタログの候補に
npx hatake index definitions/ --find "顧客 検索"  # どこに何の画面があるか
npx hatake diagram app.yaml --out app.svg  # 画面とメニューと遷移の図
npx hatake minimize page.yaml          # 既定値と同じ指定を落として短く（意味は変えない）
npx hatake diff before.yaml after.yaml # 変更の影響（契約・画面・権限・アプリ構成）
npx hatake refs page.yaml --needs-registration  # アプリ側に何を登録すればいいか
npx hatake registry lib/main.dart              # アプリが登録しているものを実装から読む
```

`validate` は構文エラーだけでなく、**解析は通るのに意図どおり動かない書き方**も警告する（宣言していない行アクション、存在しないページへの遷移、`sort` の無い `groupBy` など）。画面を見ても気づけない類なので、警告が出たら直す。

### 書けたものを、日本語で読み返す

`validate` が見るのは綴りと構造だけ。**条件の向きを間違えた・意図と違う項目を必須にした**は全部通る。AI に書かせるなら、最後に人の言葉で読み返すのが要る。

```bash
npx hatake explain page.yaml
```

```
顧客入力（customer_form）— 1件を入力する画面（新規と編集の両方）

## 基本情報
  ・コード … 必須、新規のときだけ触れる、20 文字以内
  ・登録番号 … 区分 が 法人 のときだけ必須

## 請求先（区分 が 法人 のときだけ出る枠）
  ・請求先コード … 必須
```

**キーの名前は出さない**ので、DSL を知らない人がレビューできる。条件は項目と選択肢のラベルで言う（`{ field: kind, value: corp }` ではなく「区分 が 法人 のとき」）。AI 自身に読み返させてもよく、MCP なら `hatake_explain`。

1行だけ欲しいときは `--brief`。画面一覧や PR 本文に貼る形で、`app` を渡すと表になる。

```
顧客入力（customer_form）… 1件の入力。4 枠に項目 11（必須 5）、条件で出し分け 4 項目、customerRepository から
```

### AI に直させたとき、何が変わったのかを読む

`diff` は機械の言葉で言う（`ui / column-format-changed / …columns.amount.format`）。壊れるかを CI で見るにはそれが正しいが、**人がレビューするときに読みたいもの**ではない。

```bash
npx hatake explain --diff before.yaml after.yaml
```

```
顧客入力（customer_form）— 変わったところ

## 基本情報
  ・「コード」が変わりました
      前: コード … 必須、20 文字以内
      後: コード … 必須、30 文字以内
## 請求先
  ・枠「請求先」は、区分 が 法人 のときだけ出るようになりました

※ ここは見え方の話です。呼び出し側が壊れるか（後方互換）は hatake diff で見てください。
```

やっているのは「**説明どうしを比べる**」こと。差分の規則から文を組み立てているのではないので、既定値の変化や「できないこと」の増減のような、規則を書いていない変化も自動で入ってくる。`app` ならメニューの移動（開く先が同じなら「消えて増えた」ではなく「移った」）と、両方にあるページを1枚ずつ。

判定（壊すか）は `diff`、言い直し（何が変わったか）は `explain --diff`。後者は終了コードを変えない（読むための道具なので）。

### AI が実際に転んだ実例

対照表（`pitfalls`）は人が考えた間違いの集合で、AI が転ぶ所とはズレる。実例は別に溜めてある。

```bash
npx hatake failures            # 全件（こう書いた → こう言われた → こう直した）
```

各件は**本当に道具にかけ直して**、記録した診断と一致することを CI で確認している。**機械では拾えない件も載っている**（載せないと「道具が万全」という嘘になる）ので、そこには「レビューでどこを見るか」が書いてある。

実例は手で書くと増えない。増えないカタログは、道具が良くなったのか拾っていないだけなのか見分けが付かないので、定義の山から候補を拾う。

```bash
npx hatake harvest definitions/    # 繰り返し出ている診断を候補として出す（既定は2回以上）
```

候補は**人が書く欄を空のまま**出る。「なぜそう書いてしまうか」は機械には書けないし、そこがこのカタログの価値なので、自動で追加はしない。定義そのものも持ち出さない（ラベルや列名に客先の語彙が入るので、出すのはファイル名・場所・回数だけ）。

`--repro` を付けると、**最小の再現**（その診断が出続ける形まで削った下書き）も作る。守るのは意味ではなく診断で、削り終わってからラベルを記号に置き換える。手で作るといちばん手間な所なので、下書きまでは機械がやる。

### 一意な直しは機械にやらせる

AI は指摘されると**別の場所を直して壊す**ことがある。「`witdh` は知らないキーです」と言われて列ごと書き換える、というような直し方をする。綴り違いのような一意な直しは、機械のほうが速くて安全。

```bash
npx hatake fix page.yaml            # 既定は出すだけ。--write で上書き
```

```
2 件を直しました:
  page.table.columns[0].witdh のキー名を width に直しました
  page.table.rowActions[1] を "aprove" から "approve" に直しました

直さなかったもの（意図が要るので人の仕事です）:
  page.repository [unknown-repositories] 登録済みの名前に近いものがありません（"zzz"）。名前を決めるのは人の仕事です。
```

直すのは**綴り違い**（キー名・Repository / プラグイン / 型 / ページ id / アクション id）と、**入れる値が決まっている指定**（小計のある帳票に `report.sort` を足す）だけ。近い名前が2つあれば直さない（人が選ぶ）。1件ずつ当てて「問題が減る・**新しい問題が出ない**」ことを確かめ、崩れたら何もしない。

同じ項目の重複・`field` の無い集計・条件で使えない演算子は**意図が要る**ので触らず、理由つきで「直さなかった」と言う。

### 書き足したほうがいい所

短くする（`minimize`）の逆。業務システムで多いのは書きすぎより**書き足りない**（並べ替えできない一覧・絞り込みの無い一覧・誰でも消せる画面）。書いていないものは警告にもスキーマにも出ないので、別の物差しで見る。

```bash
npx hatake advise page.yaml
```

```
# page.actions[0].roles [open-dangerous-action]
  こうなる: 「削除」は誰でも押せます（消したものは戻りません）。
  書き足す: `roles` で見える人を決める（権限はアプリ側の判定と合わせて二重にかける）。
```

**これは助言で、警告ではない。** 警告は「書いたのに効かない」＝事実なので CI で落としてよいが、助言は「書いていないから不便かもしれない」＝好みなので終了コードを変えない。混ぜると警告の信頼が落ちる。画面の種別も見る（照会に「必須が無い」とは言わない）。

助言は好みなので、**物差しは案件ごとに差し替えられる**。

```bash
npx hatake advise page.yaml --rules team.json
```

`team.json` に書けるのは3つだけ。合わない規則を止める（`off`）、組み込みの規則の目盛りを変える（`options`）、案件の決めごとを「**この場所には必ずこのキーを書く**」の形で足す（`require`）。条件式は書けない — 書けるようにすると設定ファイルが小さなプログラムになるので。知らないキーや知らない規則名はエラーにする（設定が黙って効かないのが一番まずい）。

### レビュー用に1枚で出す

説明の「この画面でできないこと」と助言の「書き足したほうがいい所」は隣の話。レビューする人が見る紙は1枚がいいので、まとめて出せる。

```bash
npx hatake explain page.yaml --review
npx hatake explain app.yaml --review --page order_search   # 助言もその画面だけに絞る
```

助言は最後の節にまとめ、**警告ではない**と毎回書く。1枚にしても終了コードは変わらない。

### 生成した定義が長くなったら短くする

AI に書かせた定義は冗長になる（`type: text`、`required: false`、`validators: []`）。冗長な定義はレビューが重くなり、次に AI が読むときのコンテキストも太る。

```bash
npx hatake minimize page.yaml > short.yaml   # 落としたものは標準エラーに出る
```

落とすのは「既定値と同じ指定」と「空の指定」だけ。**1つ落とすたびに解析後のモデルが1バイトも変わらないことを確かめ、変わったら戻す**ので、意味は変わらない。出力は落とす所だけを切るので、コメントも書き方も改行コードもそのまま（差分が「消えた行」だけになる）。書き間違いのある定義は最小化しない — 未知キーを黙って消す道具になってはいけないので。

### 定義が増えたら、索引で探す

画面が10枚を超えると「どこに何があるか」が分からなくなる。grep では「その画面が何をするか」が出てこないので、1行の要約を集めた索引を作る。

```bash
npx hatake index definitions/ --find "顧客 検索"
npx hatake index definitions/ --by size      # 規模の大きい画面から
npx hatake index definitions/ --json         # AI に渡す（近い画面を探させる入口）
```

探せるのは**現場の言葉と実装の言葉の両方**（ラベルの「得意先」でも、項目名の `customer` でも当たる）。`--find` は語の AND なので、文ではなく語を並べる。

索引は**アプリの中からも引ける**（Dart 版・Java 版に同じものがある）。定義の山を持っているのはアプリ側なので、CLI だけに在ると「自分の画面を探す」ができない。

```dart
final index = ScreenIndex.ofApp(app);            // hatake_core
for (final screen in index.search('顧客 検索')) print(screen.brief);
```

種別の見出し語は `spec/vocabulary.json` が正で、3つのエディションはそれを転記している（一致は各エディションの試験で見る）。同じ定義の山なら、どのエディションでも同じ枚数になる。

### 画面と遷移を図にする

```bash
npx hatake diagram app.yaml --out app.svg
```

段は「メニューから開ける画面 → そこから遷移で開く画面 → …」。この並べ方にすると**どこからも開けない画面**（メニューにも遷移先にも無い）が自然に落ちてくる。画面が増えると一覧では気づけないやつ。

段のあいだの遷移は**1本ずつ線**になる（まとめて1本の矢印にすると「AとBのどちらから開くのか」が読めない）。線を引けなかった遷移（同じ段の中・戻り）は文で全部挙げるので、図に出ていない遷移が黙って消えることはない。できあがりは[図解](/diagrams#定義から作った遷移図)のページに置いてある。

箱の中には**誰が開けるか**も出る。ページに `roles` は書けないので、メニューとボタンの `roles` から辿って数えている。赤枠＝誰でも開けて消す/持ち出せる画面、点線＝**誰も開けない画面**（入口の権限が食い違っている）。`--role admin` を付けると、その役割で通れる道だけの図になる。

1枚の画面の中身は図にしない（`explain` のほうが読める）。図は「画面が増えたときの遷移」のためのもの。[図解](/diagrams)のページに載せている3枚も同じコマンドで描いている。

### 定義の外との食い違いも見られる

定義は自分だけでは動かない。`repository: orderRepository` と書いても、アプリ側がその名前で登録していなければ**画面は出るがデータが来ない**。名前の食い違いは画面を見ても気づけないので、機械に言わせる。

```bash
npx hatake refs page.yaml --needs-registration   # 定義が要求しているもの
npx hatake registry lib/main.dart --out hatake-registry.json  # アプリが登録しているもの
npx hatake validate page.yaml --registry hatake-registry.json # 突き合わせる
```

`refs` が「何を登録すればいいか」、`registry` が「実際に何を登録しているか」を出し、`validate` が突き合わせる。定義の隣に `hatake-registry.json` を置いておけば `--registry` は省ける。AI に組み込みまでやらせるなら、`hatake_refs` を引かせてから登録コードを書かせるのが早い。

`registry` は言語のパーサを持たない。**その場に書いてある文字列しか読めない**ので、変数や関数から組み立てている登録は「読めなかった」と報告して終了コード 1 になる。黙って落とすと「登録してあるのに未登録」という嘘の警告になるため、不完全なら不完全だと言って止まる。

読めなかったぶんは、**動いているアプリに聞く**（Flutter 側の `registrySnapshot`）。出す形は同じなので、ソースを読む道と実行時に聞く道のどちらで作った一覧でも `validate --registry` に渡せる。

```dart
File('hatake-registry.json').writeAsStringSync(registrySnapshotJson(scope));
```

### 直した影響を見る

```bash
npx hatake diff before.yaml after.yaml
```

3段で返る。`✗ 破壊的` は呼び出し側が壊れる（必須項目を足した・返す形から消した・型を変えた）。`△ 要確認` は壊れないが人に確かめてほしい（列やボタンや選択肢が消えた・権限が狭まった／広がった・ページやメニューが消えた）。`・安全` は増えただけ。

**「要確認」を「破壊的」と混ぜていない**のが要点で、列を消すのは普通にやることだから止める話ではなく気づかせる話。CI で止めたいなら `--caution-as-error`。

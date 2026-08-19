# 図解

文章で読むのがしんどい所だけ絵にした3枚。**この絵は生成物**で、元は隣の `*.json`。
直したら作り直す（CI が作り直して差分を見るので、絵だけ古いという状態にはならない）。

```bash
for f in docs/diagrams/*.json; do
  node typescript/dist/cli.js diagram "$f" --out "${f%.json}.svg"
done
```

描いているのは CLI（`hatake diagram`）で、**定義から作る図と同じ描画**を使う
（[`typescript/src/diagram.ts`](../../typescript/src/diagram.ts)）。資料用と道具用で
描画を2本持つと、必ず片方が古くなる。

サイトでも同じ絵を出している → <https://asil-e-hatake.github.io/hatake/diagrams>

## 1. 定義から画面まで

![定義から画面まで](architecture.svg)

読みどころは3つ。

* **人と AI が書くのは定義だけ。** Widget を書き始めたら、それは DSL の穴（拡張の提案が先）
* **`PageDefinition` が唯一の正。** YAML から来たか API から来たかは、ここには残らない
* **Renderer は業務を知らない。** 業務ロジックも HTTP も持たない。足すものは Registry へ

→ 責務の話は [仕組みと責務分担](../guide/concepts.ja.md)、DSL は [仕様](../../spec/dsl-spec.ja.md)。

## 2. 検索して一覧に出し、直して保存するまで

![検索して一覧に出し、直して保存するまで](dataflow.svg)

**データの出入りは Repository の1点だけ。** フレームワークは HTTP も SQL も知らないので、
バックエンドは何でもよく、テストではモックに差し替えるだけで済む。

画面は出るのにデータが来ない、という事故はほぼ**名前の食い違い**（`orderRepository` と
`orderRepo`）。これは目で見ても気づけないので機械に言わせる:

```bash
npx hatake refs page.yaml --needs-registration      # 定義が要求しているもの
npx hatake registry lib/main.dart --out hatake-registry.json  # アプリが登録しているもの
npx hatake validate page.yaml --registry hatake-registry.json # 突き合わせる
```

## 3. 層の責務（どこに何を書くか）

![層の責務](layers.svg)

迷ったら「その知識はこの層のものか」で決める。**足りないものは Plugin で足す**
（本体を直すと、次の版で全員のコードが壊れる）。

→ 判断に迷う所は [ページ種別の選び方](../guide/page-types.ja.md) と
[よくある間違い](../../spec/pitfalls.json)（`npx hatake pitfalls <キー名>`）。

## 定義から作る図

手で書く元データの他に、**実際の定義から**図を作れる。

```bash
npx hatake diagram app.yaml --out app.svg    # 画面とメニューと遷移
npx hatake diagram app.yaml --json           # 元データだけ（手で直してから描ける）
```

段は「メニューから開ける画面 → そこから `navigate` で開く画面 → …」。**どこからも開けない
画面**（メニューにも遷移先にも無い）はこの並べ方で自然に落ちてくるので、そこだけ別に出す。
1枚の画面の中身は図にしない（`hatake explain` のほうが読める）。

## 絵を直す・足す

1枚 = `docs/diagrams/<名前>.json`。書けるのは縦積みだけで、行は3種類。

| 行 | 中身 |
| --- | --- |
| `boxes` | 横に並べる箱（`label` / `note` / `lines` / `tone`）。`lines` の先頭が `+` なら○、`!` なら× |
| `arrow` | 下向きの矢印。`label` が行き、`back` があれば右に戻りの矢印も描く |
| `note` | 幅いっぱいの注記（絵の下に添える1行） |

`tone` は `input`（外から入るもの）/ `core`（フレームワーク）/ `output`（出来上がるもの）/
`outside`（利用者が用意するもの）。`**…**` で強調できる。

**文字幅は測らずに数えている**ので、枠から溢れる文を書くと生成器がそこで落ちる
（溢れたことに気づかないまま配るのが一番まずいので、警告ではなくエラー）。落ちたら文を
短くするか、`lines` を分ける。

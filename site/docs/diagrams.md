# 図解

文章で読むのがしんどい所だけ、3枚にした。**絵は生成物**（元は
[`docs/diagrams/*.json`](https://github.com/ASIL-E-Hatake/hatake/tree/main/docs/diagrams)）で、
CI が作り直して差分を見ているので「言葉を直したのに絵が古い」が起きない。

## 定義から画面まで

![定義から画面まで](/diagrams/architecture.svg)

読みどころは3つ。

- **人と AI が書くのは定義だけ。** Widget を書き始めたら、それは DSL の穴（先に拡張を考える）
- **`PageDefinition` が唯一の正。** YAML から来たか API から来たかは、ここには残らない
- **Renderer は業務を知らない。** 業務ロジックも HTTP も持たない。足すものは Registry へ

## 検索して一覧に出し、直して保存するまで

![検索して一覧に出し、直して保存するまで](/diagrams/dataflow.svg)

**データの出入りは Repository の1点だけ。** フレームワークは HTTP も SQL も知らないので、
バックエンドは何でもよく、テストではモックに差し替えるだけで済む。

画面は出るのにデータが来ない、という事故はほぼ**名前の食い違い**（`orderRepository` と
`orderRepo`）。目で見ても気づけないので機械に言わせる。

```bash
npx hatake refs page.yaml --needs-registration      # 定義が要求しているもの
npx hatake registry lib/main.dart --out hatake-registry.json  # アプリが登録しているもの
npx hatake validate page.yaml --registry hatake-registry.json # 突き合わせる
```

## 層の責務（どこに何を書くか）

![層の責務](/diagrams/layers.svg)

迷ったら「その知識はこの層のものか」で決める。**足りないものは Plugin で足す**
（本体を直すと、次の版で全員のコードが壊れる）。

## 定義から作った遷移図

同じ描画で、**実際の定義から**「画面とメニューと遷移」の図も作れる。下は同梱の例
（`spec/examples/sales_app.yaml`）から作ったもので、この絵も CI が作り直して差分を見ている。

![受注アプリの画面と遷移](/diagrams/sales-app-flow.svg)

```bash
npx hatake diagram app.yaml --out app.svg
```

段は「メニューから開ける画面 → そこから遷移で開く画面 → …」。この並べ方にすると**どこからも開けない画面**（メニューにも遷移先にも無い）が自然に落ちてくる。画面が増えたときに一覧では気づけないやつが、図だと目に入る。

段のあいだの遷移は**1本ずつ線**になる。まとめて1本の矢印にすると「AとBのどちらから開くのか」が読めないため。線を引けるのは隣り合う行のあいだだけなので、段の中では次の段へ進む画面を後ろに置く。それでも引けない遷移（同じ段の中・戻り）は**絵の下に文で全部挙げる** — 線が無い＝遷移が無い、と読まれるのが一番まずいので。

書き方の入口は [機能別の書き方](/dsl/)、AI に書かせるなら [AI に書かせる](/ai)。

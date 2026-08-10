会社の色や情報密度は `app.theme` に書く。**挙動は何も変わらない**、見た目だけの指定。

```yaml
app:
  id: sales_admin
  title: 販売管理
  theme:
    primaryColor: "#1B5E20"
    secondaryColor: "#FF6F00"
    brightness: light
    density: compact
    fontFamily: Noto Sans JP
    radius: 8
```

## 色は1つ書けばいい

`primaryColor` を種にして配色が作られる。`secondaryColor` は省略すれば主色から導かれるので、**コーポレートカラーが1色決まっていれば書くのはそれだけ**。

書き方は `#RRGGBB` か `#AARRGGBB`。色として読めない文字列を書くとパース時にエラーになる（黙って無視されると「書いたのに変わらない」で悩むことになるので、あえて落とす）。

## 業務画面では density: compact

| density | 行の高さ・余白 |
| --- | --- |
| `comfortable` | 広い。タッチ操作が主な画面 |
| `standard` | 既定 |
| `compact` | 狭い。**業務画面はこれ** |

1画面にどれだけ情報が載るかが効率に直結するので、PC で使う業務システムなら `compact` から始めるのが良い。

## brightness: system は端末に従う

`light` / `dark` / `system` の3つ。`system` にすると端末の設定に従う。社内システムで見た目を固定したいなら `light` を明示する。

## ページごとには変えられない

`theme` は `app` にしか書けない。**画面ごとに色を変えることはできない**。「この画面だけ赤くしたい」という要求は、たいてい「危険な操作だと分からせたい」なので、テーマではなくアクションの `danger: true` で表現するほうが正しい。

## Renderer が自分の流儀に落とす

`theme` は Material 固有の指定ではない。Material の Renderer なら `ThemeData` に、別の Renderer なら別の仕組みに翻訳される。だから**書けるのは「意図」だけ**で、細かい見た目の作り込みはできない。

そこから先（影の付け方、特定のボタンの形）を変えたいなら、`config` に Renderer 固有の設定を渡すか、Renderer 側を差し替える。

```yaml
theme:
  primaryColor: "#1B5E20"
  config: { logo: assets/logo.png }
```

## 既存の Flutter アプリに混ぜるとき

自分で `MaterialApp` を組んでいる場合は、この `theme` から `ThemeData` を作る関数（`materialThemeOf`）が用意されている。定義で色を管理しつつ、アプリの組み立ては自分でやる、という使い方ができる。

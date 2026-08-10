`config` は「Framework が意味を知らない設定」を渡す場所。中身は自由で、受け取るのはフォーマッタ・Renderer・プラグインの側。

```yaml
- { field: price, label: 価格, type: number, format: currency,
    config: { symbol: "¥", negative: triangle } }

actions:
  - { id: csv, type: export, label: CSV出力,
      config: { filename: 売上明細, bom: true, delimiter: "," } }
```

## 5か所に書ける

`field` / `column` / `filter` / `action` / `theme`。どこに書いても「その要素の追加設定」という意味になる。

## 一番よく使うのはフォーマッタのオプション

`format` で指定した整形の細かい挙動は `config` で変える。**`format` と `config` は同じ要素に並べて書く**（`config` を別の場所に書いても届かない）。

| format | 主な config |
| --- | --- |
| `currency` | `symbol` `decimals` `negative`（`minus` / `triangle` / `blackTriangle` / `paren`） |
| `percent` | `decimals` `ratio`（true で ×100） |
| `date` | `pattern`（`yyyy/MM/dd` など） |
| `wareki` | `style`（`long` / `short`） |
| `mask` | `keep`（残す桁数） `char` |

会計帳票で負の金額を `△1,234` にしたいときは `negative: triangle`。日本の業務システムでは地味に効く。

## Framework は中身を検証しない

`config` は**閉じていない**（知らないキーを書いてもエラーにならない）。受け取る側が知らないキーは黙って無視される。

つまり `config` の綴りを間違えても気づけない。`symbol` を `symbold` と書いたら通貨記号が出ないだけで、何も言われない。**効いていないと思ったらまず綴りを確認する**。

ここは他のキーと扱いが違う。定義の他の部分は `validate` が知らないキーを弾いてくれるが、`config` の中はプラグインの領域なので Framework が判断できない。

## 本体を直さずに拡張する

`config` は「プラグインで足した機能に引数を渡す」ための口でもある。hatake の拡張は全部この形をとる。

| 足したいもの | やること | 定義での書き方 |
| --- | --- | --- |
| 独自の入力欄 | 名前で登録する | `type: productPicker` |
| 独自の整形 | 名前で登録する | `format: employeeCode` |
| 独自の検証 | 名前で登録する | `validators: [{ type: ourCodeRule }]` |
| 独自の処理 | 名前で登録する | `type: plugin, plugin: approve` |
| 独自の計算 | 名前で登録する | `computed: { op: withTax }` |

どれも**組み込みの名前がある開いた文字列**なので、Framework 本体を fork せずに増やせる。増やした機能に渡すパラメータが `config`。

## 何を config に入れて、何を入れないか

`config` に業務ロジックの分岐条件を詰め込むと、定義を読んでも画面の挙動が分からなくなる。目安はこう。

- **入れる**: 見せ方の細部（記号、桁数、パターン、ファイル名）
- **入れない**: 「この条件のときだけ表示する」（`visibleWhen` がある）、「このロールだけ」（`roles` がある）

DSL に用意されているキーで表現できるものは、そちらで書く。`config` は最後の逃げ道であって、最初に手を伸ばす場所ではない。

一覧に出す列は `table.columns` に並べる。並べた順がそのまま画面の左からの順になる。

```yaml
page:
  type: master
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: code

  table:
    columns:
      - { field: code, label: コード, width: 120, sortable: true }
      - { field: name, label: 顧客名, sortable: true }
      - { field: sales, label: 売上, format: currency }
```

`field` がデータ側の項目名、`label` が画面に出る見出し。`label` を省くと `field` がそのまま出るので、業務の言葉にしたいときは書く。

## 幅は基本書かない

`width` を省くと内容に応じて配分される。書くのは「コードは短いのに広く取られてしまう」ような、見た目が崩れる列だけでいい。全列に書くと画面幅が変わったときに破綻する。

## 値の見せ方は format で変える

金額・日付・和暦などは、データを加工してから渡すのではなく `format` で指定する。加工を自分のコードでやると、同じ項目を別の画面に出したときに揃わなくなる。

```yaml
- { field: sales,     label: 売上,   format: currency, config: { symbol: "¥" } }
- { field: updatedAt, label: 更新日, format: wareki }
```

書ける `format` の一覧は下の表と、[チートシート](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/api-cheatsheet.ja.md)にある。足りない見せ方はプラグインで足す。

## 並べ替えは列ごとに許可する

`sortable: true` を書いた列だけ、見出しを押して並べ替えられるようになる。並べ替えの実行はデータ側に投げられるので、Repository がその指定を受け取って処理する。

## columns はもう1か所ある

`layout.columns`（1行あたり何項目並べるか）は別物。名前が同じだけで、意味も書く場所も違う。混ざりやすいので、下の「よくある間違い」も見ておくとよい。

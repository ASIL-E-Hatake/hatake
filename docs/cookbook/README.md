# cookbook（写経用レシピ）

> **中身**: 業務画面を定義だけで組むレシピ集。骨格 → よくある追加要件 → つまずきポイント の順。
> **読むとき**: 作りたい画面が決まっているとき。API 一覧は [チートシート](../api-cheatsheet.ja.md)、全仕様は [DSL 仕様書](../../spec/dsl-spec.ja.md)。

| レシピ | 作るもの | 使う機能 |
|---|---|---|
| [マスタメンテ](master-maintenance.ja.md) | 検索＋一覧＋登録/編集/削除の1画面 | `type: master`／`normalize`／`visibleWhen`／`roles` |
| [一覧→詳細](search-list-detail.ja.md) | メニュー付きアプリ＋行から詳細へ遷移 | `app:`／`menu`／`navigate`／パンくず |
| [消費税・インボイス](invoice-tax.ja.md) | 税率別合計・端数処理 | `computeTax`／`computeInvoice`／`format: currency` |

各レシピが参照する完成形は [`spec/examples/`](../../spec/examples/) にあり、**CI でスキーマ検証**されている（＝ドキュメント内のサンプルが腐らない）。

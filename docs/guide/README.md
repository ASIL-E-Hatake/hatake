# guide（機能別ガイド）

> **中身**: 「仕組みの理解」と「判断」が必要なテーマだけを置いた場所。
> **ここに無いもの**: 名前や既定値の一覧は [チートシート](../api-cheatsheet.ja.md) と [DSL 仕様書](../../spec/dsl-spec.ja.md)、画面の作り方は [cookbook](../cookbook/)。**同じ表を二重に持たない**方針（読む量を増やさないため）。

| ガイド | 分かること |
|---|---|
| [仕組みと責務分担](concepts.ja.md) | 自分のコードをどこに書くか。Framework が持たないもの。正規化→検証→永続化の流れ |
| [ページ種別の選び方](page-types.ja.md) | crud / master / search / detail / form のどれを使うか |
| [入力検証](validation.ja.md) | 検証の順番・空値の扱い・独自ルール・**メッセージ差し替え（i18n）** |
| [バックエンド連携](backend.ja.md) | 同じ定義でサーバ検証・クエリ組み立て・JPA 変換 |

拡張（独自フィールド型 / Renderer 差し替え）の手順は [Plugin ガイド](../../flutter/docs/plugins.ja.md)。

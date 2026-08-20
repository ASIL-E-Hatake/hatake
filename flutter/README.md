# hatake — Flutter 版 🌱

> 業務定義（種）を蒔いたら画面が実る。その Flutter 実装。

これは [hatake](../README.md) の **Flutter / Dart 版**。hatake 自体が何なのか（多言語の話とか思想）は上位 README を見てもらうとして、ここは「Flutter でどう使うか」の話。

Widget ライブラリじゃない。**業務を書いたら画面が出てくる**のが狙い。

```
Business Definition (YAML / JSON / Dart)
        │  Parser
        ▼
   PageDefinition        ← 唯一の正
        │  Renderer（交換可能）
        ▼
   Flutter Widget
```

## パッケージ構成

| パッケージ | 役割 | 依存 |
|---|---|---|
| `hatake_core` | PageDefinition モデル・Repository 契約・Validation。**純 Dart** | なし |
| `hatake_yaml` | YAML / JSON → PageDefinition | core |
| `hatake_dsl` | Dart 型安全ビルダー → PageDefinition | core |
| `hatake` | Renderer 契約・ランタイム・描画 API（Flutter） | core |
| `hatake_material` | Material3 Renderer 実装 | hatake |
| `hatake_print` | 帳票 → PDF（opt-in アダプタ）。**純 Dart**＝UI 無しでも刷れる | core |
| `hatake_encoding` | 文字コード変換（cp932 / Shift_JIS / EUC-JP。opt-in アダプタ） | なし |
| `hatake_example` | サンプルアプリ | all |

## ざっとイメージ

```yaml
dsl_version: "1.0"
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  key: id
  table:
    columns:
      - { field: code, label: コード, sortable: true }
      - { field: name, label: 顧客名, sortable: true }
  form:
    sections:
      - title: 基本情報
        fields:
          - { field: code, label: コード, type: text, required: true }
          - { field: name, label: 顧客名, type: text, required: true }
```

フルの例は [`spec/examples/customer_master.yaml`](../spec/examples/customer_master.yaml) を見て。DSL の全仕様は [仕様書（日本語）](../spec/dsl-spec.ja.md)（[English](../spec/dsl-spec.md)）、機械検証用の [JSON Schema](../spec/hatake-page.schema.json) もある。定義がおかしくないかは、これで確認できる:

```bash
python spec/tools/validate_schema.py path/to/def.yaml
```

具体的な使い方（`main.dart` とか Repository の書き方）は [Flutter 版の紹介記事](../docs/blog/introducing-hatake-flutter.md) が手っ取り早い。

## 自分の画面を探す（画面の索引）

画面が増えると「どこに何の画面があるか」が分からなくなる。CLI（`npx hatake index`）と同じものが
`hatake_core` にも入っているので、**アプリの中から自分の画面を引ける**（画面選択・ジャンプ窓・
管理者向けの画面一覧はこれで作る）。

```dart
// 解析済みの画面から（アプリの中）
final index = ScreenIndex.ofApp(app);
for (final screen in index.search('顧客 検索')) {
  print(screen.brief);   // 顧客マスタ（customer_master）… 検索＋一覧＋登録・修正・削除。列 4、項目 6…
}

// 定義の文字列の山から（資産・ファイル）— hatake_yaml
final index = buildScreenIndex([IndexInput('sales_app.yaml', source)]);
print(renderScreenIndex(index.bySize(), showSize: true));
```

* 探せるのは**現場の言葉と実装の言葉の両方**（ラベルの「得意先」でも `customer` でも
  `orderRepository` でも当たる）。`search` は**語の AND**
* 1行の要約（`briefOf`）は CLI の `hatake explain --brief` と同じ言い方。種別の見出し語は
  [`spec/vocabulary.json`](../spec/vocabulary.json) が正で、Dart 版はそれを転記している（一致する
  ことを試験で見ているので、CLI と画面で同じ画面の呼び方が変わることはない）
* `app:` は**中の画面を1枚ずつ**数える。読めなかった定義は黙って落とさず
  `ScreenIndex.unreadable` に入る（索引が不完全だと言えるように）
* ページの部品を種別ごとの `switch` なしで読みたいときは `PageParts`
  （`page.tableArea` / `page.formArea` / `page.pageActions` …）

## 開発状況

CrudPage と SearchPage が動いてる。中身はこんな感じ。

| 領域 | 状態 |
|---|---|
| `hatake_core` PageDefinition モデル | ✅ 完了（テスト+解析クリーン） |
| `hatake_yaml` YAML/JSON パーサ | ✅ 完了（YAML↔JSON 収束テスト済み） |
| `hatake_dsl` Dart 型安全ビルダー | ✅ 完了（DSL↔YAML 収束テスト済み） |
| `hatake` ランタイム + Renderer 契約 | ✅ 完了 |
| `hatake_material` CrudPage 描画（検索/一覧/ページング/削除） | ✅ 完了（widget テスト済み） |
| `hatake_print` 帳票 → PDF（座標まで中立な PrintLayout 経由） | ✅ 完了（見本の PDF を1バイト単位で固定・別実装で読み返す） |
| フォーム（新規/編集/バリデーション・ダイアログ） | ✅ 完了（widget テスト済み） |
| バリデーションエンジン（純Dart・Plugin拡張可） | ✅ 完了（ユニットテスト済み） |
| `hatake_example` サンプルアプリ（YAML→描画） | ✅ 完了（widget テスト済み） |
| 公開準備（Apache-2.0 / pub metadata / CHANGELOG / CI） | ✅ 完了（dry-run 0 warnings） |
| ライブデモ（Flutter web ビルド + Pages デプロイ workflow） | ✅ ビルド確認済み（push で自動公開） |
| Plugin 機構（[日本語](docs/plugins.ja.md) / [EN](docs/plugins.md)：Validator/Action/Field型/Renderer） | ✅ 完了（3種のPluginをテストで実証） |
| SearchPage（照会画面：検索+読取専用一覧+行プラグインアクション） | ✅ 完了（parser/renderer/DSLビルダー/テスト、3形式収束） |
| フィールド描画（text/number/select/checkbox/radio/multiSelect/date） | ✅ 完了（widget テスト済み） |
| 他Renderer（Fluent等） | ⏳ そのうち |

> **地味に効くポイント**: `Dart DSL builder == parsePageYaml == parsePageJson` が実機テストで一致してる。どの書き方でも同じ `PageDefinition` になる、が保証されてる。

検証はローカルに SDK 入れず Docker で回してる（純Dart=`dart:stable`、Flutter=`ghcr.io/cirruslabs/flutter:stable`）。

## セットアップ

Flutter 版はモノレポの `flutter/` にある。

```bash
cd flutter
dart pub global activate melos
melos bootstrap
melos run analyze
melos run test
```

## ライセンス

[Apache License 2.0](../LICENSE) — Copyright 2026 Hatakeyama.

## CI

GitHub Actions（[.github/workflows/ci.yml](../.github/workflows/ci.yml)）で全パッケージの analyze / test と `hatake_core` の `pub publish --dry-run` を回してる。

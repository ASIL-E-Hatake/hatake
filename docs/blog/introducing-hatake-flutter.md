---
title: "hatake の Flutter 版を使ってみる — YAML 一枚で業務画面が出る話"
emoji: "🌱"
type: "tech"
topics: ["flutter", "dart", "dsl", "業務システム", "ローコード"]
published: false
---

これは hatake の **Flutter 版** の具体的な使い方の記事。hatake そのものが何なのか（多言語の話とか設計思想）は [全体イントロ](introducing-hatake.md) を先に読んでもらえるとスッと入る。ここでは「で、Flutter でどう動かすの？」だけやる。

## まず動いてる画面

顧客マスタの CRUD 画面。定義はこの YAML 一枚（[spec/examples/customer_master.yaml](../../spec/examples/customer_master.yaml)）。

```yaml
dsl_version: "1.0"
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  table:
    rowActions: [edit, delete]
    columns:
      - { field: code,   label: コード,     sortable: true }
      - { field: name,   label: 顧客名,     sortable: true }
      - { field: status, label: ステータス, type: badge }
  form:
    sections:
      - title: 基本情報
        fields:
          - { field: code, label: コード, type: text, required: true }
          - { field: name, label: 顧客名, type: text, required: true }
  actions:
    - { id: create, type: create, label: 新規登録 }
```

これで検索・一覧・ページング・行編集/削除・新規/編集フォーム（ダイアログ＋バリデーション）まで全部出る。画面用の Widget は書いてない。

<!-- 画面キャプチャ: 一覧画面 -->
![顧客マスタ 一覧画面](../images/demo-list.png)

<!-- 画面キャプチャ: フォームダイアログ -->
![新規登録フォーム](../images/demo-form.png)

## 書く Dart はこれだけ

YAML を画面にするのに必要なコードは実質これ。3 ステップ。

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. 定義を読む（YAML でも JSON でも Dart ビルダーでも可）
  final yaml = await rootBundle.loadString('assets/customer_master.yaml');
  final definition = parsePageYaml(yaml) as CrudPageDefinition;

  runApp(MaterialApp(
    home: HatakeScope(
      // 2. Repository を登録（データ取得は自分の実装）
      repositories: RepositoryRegistry({'customerRepository': MyCustomerRepository()}),
      // 3. Renderer を選ぶ（Material。将来 Fluent とかに差し替え可）
      renderer: const MaterialRenderer(),
      child: Scaffold(body: HatakeCrudView(definition: definition)),
    ),
  ));
}
```

`Repository` はメソッド 5 個のインターフェースだけ。**hatake は HTTP も DB も知らん**ので、そこは自分で埋める。バックエンドが Spring Boot だろうが Firebase だろうが、書くのはこれだけ。

```dart
abstract interface class Repository {
  Future<PageResult> search(RepositoryQuery query);
  Future<DataRecord?> findByKey(Object key);
  Future<DataRecord> create(DataRecord data);
  Future<DataRecord> update(Object key, DataRecord data);
  Future<void> delete(Object key);
}
```

## YAML がだるければ型安全な Dart で書ける

同じ定義を、IDE 補完が効くビルダーでも書ける。で、**YAML で書こうがこれで書こうが、できる `PageDefinition` は完全に同じ**（テスト済み）。

```dart
final page = crudPage(
  id: 'customer_master',
  title: '顧客マスタ',
  repository: 'customerRepository',
  table: table([
    column('code', label: 'コード', sortable: true),
    column('name', label: '顧客名', sortable: true),
  ]),
  form: form([
    section('基本情報', [
      field('code', label: 'コード', required: true, validators: [maxLength(20)]),
      field('name', label: '顧客名', required: true),
    ]),
  ]),
);
```

## 拡張は本体をいじらず足す

フィールド型・バリデータ・アクション・Renderer は、全部「登録」で足せる。本体を fork する必要はない。例えば独自バリデータ:

```dart
final validators = ValidatorRegistry({
  'even': (value, def) => (value as num) % 2 == 0 ? null : '偶数にして',
});
```

独自フィールド型（Material の Widget を返すだけ）:

```dart
MaterialRenderer(fieldBuilders: {
  'color': (ctx) => /* 好きな入力 Widget */,
});
```

詳しくは [Plugin ガイド](../../flutter/docs/plugins.ja.md) 参照。

## パッケージ構成

| パッケージ | 役割 |
|---|---|
| `hatake_core` | PageDefinition モデル・Repository 契約・バリデーション（純 Dart） |
| `hatake_yaml` | YAML / JSON → PageDefinition |
| `hatake_dsl` | Dart 型安全ビルダー → PageDefinition |
| `hatake` | Renderer 契約・ランタイム・ウィジェット（Flutter） |
| `hatake_material` | Material 3 Renderer |

## いまの状態

CrudPage と SearchPage（照会）が動いてて、フォームのフィールド型も text / number / select / checkbox / radio / multiSelect / date（ピッカー）まで対応済み。全部テスト通してある。この先は Fluent とかの別 Renderer と、他の業務コンポーネントを足していく。

- リポジトリ: https://github.com/ASIL-E-Hatake/hatake
- ライセンス: Apache-2.0

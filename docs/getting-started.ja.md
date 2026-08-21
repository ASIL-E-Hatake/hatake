# 導入（Getting Started）

> **中身**: 動かす → 自分のアプリに入れる → 最小コードで1画面出すまで。
> **読むとき**: 最初に触るとき。定義の書き方は [チートシート](api-cheatsheet.ja.md)、詳細は [DSL 仕様](../spec/dsl-spec.ja.md)。
> **前提**: Flutter stable（Material3）。バックエンド版は [java](../java/README.md) / [typescript](../typescript/README.md) を見て。
> **はじめてなら**: [チュートリアル](tutorial.ja.md)（0から受注入力画面まで通しで1本）のほうが早い。ここは「入れる手順」に寄せた文書。

## 1. まず動かす（クローンして example）

```bash
git clone https://github.com/ASIL-E-Hatake/hatake.git
cd hatake/flutter/packages/hatake_example
flutter pub get && flutter run -d chrome
```

メニュー付きのサンプルアプリ（顧客マスタ／商品マスタ／受注照会→受注詳細）が起動する。中身は [`assets/sales_app.yaml`](../flutter/packages/hatake_example/assets/sales_app.yaml) 1枚＋インメモリ Repository だけ。画面固有のウィジェットコードは**ゼロ**。

## 2. 自分のアプリに入れる

⚠️ **まだ pub.dev 未公開**。当面は git 依存で入れる。`hatake_material` は `hatake` / `hatake_core` を hosted 制約で参照しているので、**公開までは overrides も必要**（公開後は `hatake_material: ^x.y.z` の1行だけで済む）。

```yaml
# pubspec.yaml
dependencies:
  flutter:
    sdk: flutter
  hatake_material:            # 画面描画（Material3）
    git: { url: https://github.com/ASIL-E-Hatake/hatake.git, path: flutter/packages/hatake_material }
  hatake_yaml:                # YAML/JSON を定義に変換（定義を Dart で書くなら不要）
    git: { url: https://github.com/ASIL-E-Hatake/hatake.git, path: flutter/packages/hatake_yaml }

dependency_overrides:         # 公開までの暫定
  hatake_core:
    git: { url: https://github.com/ASIL-E-Hatake/hatake.git, path: flutter/packages/hatake_core }
  hatake:
    git: { url: https://github.com/ASIL-E-Hatake/hatake.git, path: flutter/packages/hatake }
```

| パッケージ | 役割 | 要る？ |
|---|---|---|
| `hatake_core` | 定義モデル・検証・整形・日本企業util（Flutter非依存） | 必須（推移） |
| `hatake` | Renderer 契約・コントローラ・`HatakeScope`/`HatakeApp` | 必須（推移） |
| `hatake_material` | Material3 の描画実装 | 必須 |
| `hatake_yaml` | YAML/JSON パーサ | YAML から読むなら |
| `hatake_dsl` | Dart で定義を書くビルダー | 任意 |

## 3. 定義を書く

```yaml
# assets/customer.yaml
dsl_version: "1.0"
page:
  type: crud                     # crud | search | master | detail | form
  id: customer
  title: 顧客マスタ
  repository: customerRepository  # ← 下で登録するキー
  key: id
  search:
    filters:
      - { field: name, label: 顧客名, type: text, operator: contains }
  table:
    rowActions: [edit, delete]
    columns:
      - { field: code, label: コード, sortable: true }
      - { field: name, label: 顧客名 }
  form:
    sections:
      - title: 基本情報
        fields:
          - { field: code, label: コード, required: true, normalize: [toHankaku, trim] }
          - { field: name, label: 顧客名, required: true }
  actions:
    - { id: create, type: create, label: 新規登録 }
```

`pubspec.yaml` の `flutter: assets:` に登録するのを忘れずに。書けたか不安なら検証できる:

```bash
python spec/tools/validate_schema.py assets/customer.yaml
```

## 4. Repository を実装する

フレームワークが知っているのは**この5メソッドだけ**（HTTP も DB も知らない）。中身は Dio でも Firebase でも何でもいい。

> REST API に繋ぐなら、手で書く前に opt-in の
> [`hatake_http`](../flutter/packages/hatake_http/) を見る。`npx hatake openapi` が定義から
> 宣言する API と**同じ形**で話す `Repository` が入っているので、`collections` の対応表と
> 「送る関数」1つで済む（通信の依存は持たないので web でも動く）。下は自分で書く場合。

```dart
import 'package:hatake_material/hatake_material.dart';

class CustomerRepository implements Repository {
  final List<DataRecord> _rows = [
    {'id': 1, 'code': 'C001', 'name': '山田商事'},
  ];

  @override
  Future<PageResult> search(RepositoryQuery q) async {
    var rows = _rows;
    final name = q.filters['name'];              // 定義の filter がここに来る
    if (name is String && name.isNotEmpty) {
      rows = rows.where((r) => '${r['name']}'.contains(name)).toList();
    }
    final page = rows.skip(q.page * q.pageSize).take(q.pageSize).toList();
    return PageResult(items: page, totalCount: rows.length);
  }

  @override
  Future<DataRecord?> findByKey(Object key) async =>
      _rows.where((r) => r['id'] == key).firstOrNull;

  @override
  Future<DataRecord> create(DataRecord data) async { _rows.add(data); return data; }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    final i = _rows.indexWhere((r) => r['id'] == key);
    if (i >= 0) _rows[i] = data;
    return data;
  }

  @override
  Future<void> delete(Object key) async => _rows.removeWhere((r) => r['id'] == key);
}
```

## 5. 繋いで表示する

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final yaml = await rootBundle.loadString('assets/customer.yaml');
  final definition = parsePageYaml(yaml);          // → PageDefinition

  runApp(MaterialApp(
    home: HatakeScope(
      repositories: RepositoryRegistry({'customerRepository': CustomerRepository()}),
      renderer: const MaterialRenderer(),
      child: Scaffold(body: SafeArea(child: HatakePageView(definition: definition))),
    ),
  ));
}
```

これで検索・一覧・ページング・登録/編集/削除・バリデーションまで動く。`HatakePageView` は種別を自動で振り分けるので、`page.type` を変えるだけで別画面になる。

## 次に読むもの

| したいこと | 行き先 |
|---|---|
| 使える名前（型・整形・検証）を一覧で | [チートシート](api-cheatsheet.ja.md) |
| 業務画面をまるごと写経 | [cookbook](cookbook/) |
| メニュー付きの**アプリ**にする（複数画面＋遷移） | [一覧→詳細レシピ](cookbook/search-list-detail.ja.md) |
| 独自フィールド型・バリデータを足す | [Plugin ガイド](../flutter/docs/plugins.ja.md) |
| サーバ側でも同じ定義で検証する | [java](../java/README.md) / [typescript](../typescript/README.md) |

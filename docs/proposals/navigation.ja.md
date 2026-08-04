# 提案：ナビゲーション＋アプリシェル

ページ定義を束ねて「アプリ1本」を定義から組み上げる縦導線。現状は単一ページを描くだけで、画面遷移やメニューは Flutter 手書きが要る＝「Configuration over Coding」が未完。ここを埋める。

## 位置づけ
`PageDefinition` の一段上に新トップレベル **`AppDefinition`** を追加。描画は **Renderer の責務**（`Renderer.buildApp` を追加、シェルも交換可能を維持）。

```
AppDefinition（器） → menu / pages / home
      ↓ page id で参照
PageDefinition（既存: crud/search/detail/form…）
```

## DSL 案

```yaml
dsl_version: "1.0"
app:
  id: sales_admin
  title: 販売管理
  home: customers
  menu:
    - { id: customers, label: 顧客, icon: people, page: customer_master }
    - group: マスタ
      roles: [admin]                 # roles と連動（isAllowed で出し分け）
      items:
        - { id: products, label: 商品, page: product_master }
  pages:
    - { type: crud, id: customer_master, ... }   # 既存ページ定義をそのまま列挙
    - { type: detail, id: customer_detail, ... }
```

遷移は既存 `action` を拡張：新型 **`navigate`**。

```yaml
- { id: detail, type: navigate, page: customer_detail, params: { id: "$row.id" } }
```
- `$row.id` / `$record.id` で現在行・レコードをルート params に埋める
- detail ルートは params.id を受けてシェルが `repository.findByKey` → `DetailController` に接続（既存コントローラ再利用）
- 典型: メニュー→ページ／一覧行→詳細／詳細→編集フォーム／保存→戻る／back

## 描画
- `HatakeApp(app:)` … シェル（デスクトップ/Web: NavigationRail、モバイル: Drawer）＋コンテンツに現在ページを既存 View で描画
- 内部ルータ `HatakeRouter`（`pageId + params` のスタックを持つ ChangeNotifier。外部依存なし）
- roles 連動でメニュー項目/ページを `isAllowed` 出し分け

## ファイル構成（★AIコスト削減方針）
1ファイル1関心・~200行目安。library-private は `part`/`part of` で維持、純ロジックは単独ファイル。→ 詳細方針はメモリ `feedback-small-files`。

**新規（すべて小ファイル）**
```
hatake_core/lib/src/definition/
  app_definition.dart      # AppDefinition
  menu_item.dart           # MenuItem / MenuGroup
  # action_types.dart に "navigate" 追加（文字列のみ）
hatake/lib/src/runtime/
  hatake_router.dart       # HatakeRouter（ルートスタック、単独・通常import）
hatake/lib/src/widgets/
  hatake_app.dart          # HatakeApp（router 準備 → renderer.buildApp）
hatake_material/lib/src/renderer/
  app_shell.dart           # part: Material シェル（NavigationRail/Drawer + コンテンツ）
```

**既存の巨塊 `material_renderer.dart`（約1250行）は別タスクで part 分割**（crud_page / search_page / detail_page / form_page / form_fields へ）。今回のナビ機能とは切り離し、behavior-preserving な整理として単独で実施（AIコストの本丸だが、ナビ実装とスコープを混ぜない）。

## 決定事項（合意済み）
1. ルータ = 依存ゼロの自前スタック（Web の URL 同期は後段）
2. ページ解決 = app に pages インライン列挙（将来ローダ追加）
3. params 記法 = `$row.id` / `$record.id`
4. 初回スコープ = シェル＋メニュー＋ルートスタック＋`navigate`＋一覧→詳細配線＋roles＋example＋テスト（Dartのみ）

## 段階
- **実装済み ✅**: spec(`AppDefinition`＋JSON Schema)／Dart モデル・パーサ／`Renderer.buildApp`＋`HatakeApp`＋`HatakeRouter`＋`navigate`＋detail配線＋roles／spec例 `sales_app.yaml`／ランナブルデモ(`hatake_example`)／TS・Java の app パーサ（ナビ情報＋浅い `PageRef` 目録）
- **磨き込み済み ✅**: メニューの**グループ見出し**描画（定義の再現漏れを解消）、**レスポンシブ**（≥600px は常設サイドバー／未満は Drawer）、**ブレッドクラム**（`popTo` で祖先へ一気に戻る）
- **次段**: タブ、Web URL 同期、Wizard 連携、Dart の app DSL ビルダー（YAML/JSON は対応済み）
- **別タスク**: `material_renderer.dart` の part 分割

## 非目標（このFrameworkの範囲外）
認証・認可の強制、ディープリンクのセキュリティ、状態の永続化。ルータはあくまで画面遷移の器。

# hatake Plugin ガイド

> 🌐 [English](plugins.md) ・ 日本語版（このページ）

hatake の拡張は **登録（registration）** でやる。本体を fork する必要はない。拡張点は 4 つ。
DSL の型識別子はどれも開いた文字列だから、Plugin は「新しい型の扱い方」を hatake に教えるだけでいい。

| 拡張点 | 登録先 | 追加できるもの |
|---|---|---|
| [バリデータ](#1-バリデータ) | `ValidatorRegistry` → `HatakeScope(validators:)` | 新しい `validators[].type` の値 |
| [アクション](#2-アクション) | `ActionRegistry` → `HatakeScope(actions:)` | `actions[].type: plugin` のハンドラ |
| [フィールド型](#3-フィールド型) | `MaterialRenderer(fieldBuilders:)` | 新しいフォーム `type` の値 |
| [Renderer](#4-renderer) | `Renderer` を実装 → `HatakeScope(renderer:)` | 別デザインの見た目（Fluent, Cupertino …） |

## 1. バリデータ

バリデータは「値 + 規則」をエラーメッセージ（か null）に対応づけるやつ。独自の型を
`ValidatorRegistry` に登録しとけば、どの定義からでも使える。

```dart
final validators = ValidatorRegistry({
  'even': (value, def) {
    final n = value is num ? value : num.tryParse('${value ?? ''}');
    if (n == null) return null;
    return n % 2 == 0 ? null : '偶数を入力してください';
  },
});
```

```yaml
- { field: qty, label: 数量, type: number, validators: [ { type: even } ] }
```

Scope に渡す:

```dart
HatakeScope(validators: validators, /* ... */);
```

## 2. アクション

`type: plugin` のアクションは、`plugin` キーで引いたハンドラに飛ぶ。ハンドラは
`ActionContext`（build context・controller・action、行アクションなら対象行）を受け取る。

```dart
final actions = ActionRegistry({
  'csvExport': (ctx) async {
    // ... 出力処理を行い、必要なら再読込:
    await ctx.controller.load();
    ScaffoldMessenger.of(ctx.buildContext)
        .showSnackBar(const SnackBar(content: Text('CSVを出力しました')));
  },
});
```

```yaml
actions:
  - { id: export, type: plugin, plugin: csvExport, label: CSV出力 }
```

```dart
HatakeScope(actions: actions, /* ... */);
```

## 3. フィールド型

フォームのフィールド描画は Renderer 固有（Widget を作る話）なので、独自フィールド型は
Renderer に登録する。組込型は、独自ビルダーで上書きしない限りそのまま使われる。

```dart
const MaterialRenderer(); // 組込のみ

MaterialRenderer(fieldBuilders: {
  'color': (ctx) => DropdownButtonFormField<Object?>(
        initialValue: ctx.value,
        decoration: InputDecoration(labelText: ctx.field.label, errorText: ctx.errorText),
        items: const [
          DropdownMenuItem(value: 'red', child: Text('赤')),
          DropdownMenuItem(value: 'blue', child: Text('青')),
        ],
        onChanged: ctx.onChanged,
      ),
});
```

```yaml
- { field: theme, label: テーマ色, type: color }
```

## 4. Renderer

`Renderer` 契約は `PageDefinition` を Widget に変換するだけ。業務ロジックは持たない。
別のデザインシステムに対応したいなら、これを実装して Scope に渡すだけ。

```dart
class FluentRenderer implements Renderer {
  @override
  Widget buildCrudPage(BuildContext context, CrudPageDefinition definition,
      CrudController controller) {
    // controller の状態を読み、Fluent の Widget を返し、controller のメソッドを呼ぶ
  }
}

HatakeScope(renderer: FluentRenderer(), /* ... */);
```

Renderer が要る材料は全部 `CrudController` が公開してる。状態
（`items`, `loading`, `error`, `page`, `pageCount`, `mode`, `draft`,
`validation`, `submitting`）と、操作
（`search`, `setPage`, `sortBy`, `startCreate`, `startEdit`, `submitForm`,
`cancelForm`, `deleteRecord`）。これを読んで呼ぶだけでいい。

## まとめ

```dart
HatakeScope(
  repositories: RepositoryRegistry({'customerRepository': myRepo}),
  renderer: MaterialRenderer(fieldBuilders: {'color': myColorField}),
  validators: ValidatorRegistry({'even': myEvenRule}),
  actions: ActionRegistry({'csvExport': myExportHandler}),
  child: HatakeCrudView(definition: definition),
);
```

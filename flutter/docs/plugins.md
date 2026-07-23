# hatake Plugins

> 🌐 English (this page) ・ [日本語版](plugins.ja.md)

hatake is extended through **registration**, never by forking the framework.
There are four extension points. All type identifiers in the DSL are open
strings, so a plugin just teaches hatake how to handle a new one.

| Extension point | Register on | Adds |
|---|---|---|
| [Validator](#1-validators) | `ValidatorRegistry` → `HatakeScope(validators:)` | New `validators[].type` values |
| [Action](#2-actions) | `ActionRegistry` → `HatakeScope(actions:)` | Handlers for `actions[].type: plugin` |
| [Field type](#3-field-types) | `MaterialRenderer(fieldBuilders:)` | New form field `type` values |
| [Renderer](#4-renderers) | implement `Renderer` → `HatakeScope(renderer:)` | A whole new look (Fluent, Cupertino, …) |

## 1. Validators

A validator maps a value + rule to an error message (or null). Register custom
types in a `ValidatorRegistry`; they are usable from any definition.

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

Provide the registry to the scope:

```dart
HatakeScope(validators: validators, /* ... */);
```

## 2. Actions

An action of `type: plugin` dispatches to a handler resolved by its `plugin`
key. Handlers receive an `ActionContext` (build context, controller, action,
and the row for row-level actions).

```dart
final actions = ActionRegistry({
  'csvExport': (ctx) async {
    // ... do the export, then optionally refresh:
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

## 3. Field types

Form field rendering is renderer-specific (it produces widgets), so custom
field types are registered on the renderer. Built-in types are used unless a
custom builder overrides them.

```dart
const MaterialRenderer(); // built-ins only

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

## 4. Renderers

The `Renderer` contract turns a `PageDefinition` into widgets and holds no
business logic. Implement it to support a different design system, then pass it
to the scope.

```dart
class FluentRenderer implements Renderer {
  @override
  Widget buildCrudPage(BuildContext context, CrudPageDefinition definition,
      CrudController controller) {
    // read controller state, return Fluent widgets, call controller methods
  }
}

HatakeScope(renderer: FluentRenderer(), /* ... */);
```

The controller (`CrudController`) exposes all state a renderer needs
(`items`, `loading`, `error`, `page`, `pageCount`, `mode`, `draft`,
`validation`, `submitting`) and all interactions (`search`, `setPage`,
`sortBy`, `startCreate`, `startEdit`, `submitForm`, `cancelForm`,
`deleteRecord`).

## Putting it together

```dart
HatakeScope(
  repositories: RepositoryRegistry({'customerRepository': myRepo}),
  renderer: MaterialRenderer(fieldBuilders: {'color': myColorField}),
  validators: ValidatorRegistry({'even': myEvenRule}),
  actions: ActionRegistry({'csvExport': myExportHandler}),
  child: HatakeCrudView(definition: definition),
);
```

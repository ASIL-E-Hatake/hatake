# 入力検証

> **中身**: 検証の書き方・実行タイミング・独自ルール・**メッセージの差し替え（i18n）**。
> **読むとき**: 入力チェックを足すとき、エラーメッセージを変えたいとき。
> **組込ルールの一覧**: [チートシート](../api-cheatsheet.ja.md)（ここは「使い分けと拡張」に集中）

## 書き方

```yaml
fields:
  - { field: code, label: コード, required: true,          # 必須（マーカーも出る）
      normalize: [toHankaku, trim],                        # 検証の前に正規化される
      validators: [ { type: maxLength, value: 20 } ] }
  - { field: email, label: メール,
      validators: [ { type: email, message: 会社のメール形式で入力してください } ] }
```

- `required: true` は `required` バリデータの糖衣。必須マーカー表示も兼ねる
- `validators` は上から順に評価され、**最初に失敗したものが項目下に表示**される
- `message` を書くと既定メッセージを上書きできる

## 実行される順番

送信時に **`normalize` → 検証 → 永続化** の順で走ります（Framework が保証）。

つまり `normalize: [toHankaku]` を付けておけば、全角で入力されても**半角に直した後で**桁数チェックされます。「全角で入れたら文字数チェックがおかしい」を防げます。

## 空値の扱い

`required` 以外のバリデータは**空値をスキップ**します（未入力は「形式エラー」にしない）。「入れるなら形式を守れ、入れないのは自由」という業務要件に素直に合います。必須にしたいなら `required: true` を併記します。

## 独自ルールを足す

```dart
final validators = ValidatorRegistry({
  // ValidatorFn: (値, 定義) => エラーメッセージ or null
  'even': (value, def) {
    final n = value is num ? value : num.tryParse('$value');
    if (n == null) return null;                  // 空・数値でないものは他ルールに任せる
    return n % 2 == 0 ? null : '偶数を入力してください';
  },
});

HatakeScope(
  repositories: ...,
  renderer: const MaterialRenderer(),
  validators: validators,                        // ← ここで差し込む
  child: ...,
);
```

定義側は登録したキーを書くだけ。**本体の改造は不要**です。

```yaml
- { field: qty, label: 数量, type: number, validators: [ { type: even } ] }
```

パラメータを受けたいときは `def.params['value']` などで取れます（`{ type: even, value: 2 }` のように定義に書いた `type`/`message` 以外のキーが全部入る）。詳しい登録の仕組みは [Plugin ガイド](../../flutter/docs/plugins.ja.md)。

## メッセージを差し替える（i18n）

既定メッセージは日本語です。**個別に変える**なら `message`、**全体を変える/多言語化する**なら `MessageResolver` を注入します。

```dart
final messages = MessageResolver(
  locale: 'en',
  messages: {
    'en': {'required': 'Required', 'maxLength': 'Max {value} chars'},
  },
);

HatakeScope(
  validators: ValidatorRegistry(null, messages),   // 第2引数がリゾルバ
  ...
);
```

| キー | 既定（ja） |
|---|---|
| `required` | 必須項目です |
| `maxLength` / `minLength` | `{value}`文字以内で入力してください / 以上で |
| `min` / `max` | `{value}`以上で入力してください / 以下で |
| `pattern` | 形式が正しくありません |
| `email` | メールアドレスの形式が正しくありません |
| `postalCode` | 郵便番号の形式が正しくありません |
| `compare.gte` ほか | `{target}`以上にしてください（突合ごとに6つ） |

- `{value}` はパラメータに置換される
- 未定義のキー/ロケールは **ja にフォールバック**（それも無ければキー名がそのまま出る）
- `withLocale('ja')` でテーブルを保ったままロケールだけ切替
- 優先順位は **項目の `message` > ロケールのテーブル > 既定**
- Dart / TypeScript / Java で**同名・同挙動**

## サーバ側でも同じ定義で検証する

これが hatake の主目的の一つ。同じ YAML を Java / TypeScript が読んで検証するので、フロントとバックで**チェック内容がズレません**。

```java
var page = DefinitionParser.parsePageYaml(yamlText);
var result = new FormValidator().validate(page.form(), requestBody);
if (!result.valid()) { /* result.errors() を 400 で返す */ }
```

→ [バックエンド連携](backend.ja.md)

## つまずきポイント

| 症状 | 原因 |
|---|---|
| 独自バリデータが無反応 | `HatakeScope(validators:)` に渡していない／定義の `type` とキーが不一致（未知の型は**無視される**仕様） |
| 全角入力で桁数チェックが変 | `normalize` を付ける（`toHankaku` 等）。順番は normalize → 検証 |
| 未入力なのに形式エラーが出ない | 仕様どおり（空値はスキップ）。必須にするなら `required: true` |
| メッセージが英語にならない | `MessageResolver` を `ValidatorRegistry` の**第2引数**に渡す。項目側の `message` は常に優先される |

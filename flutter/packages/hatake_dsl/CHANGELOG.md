# Changelog

## 0.9.3

一覧から詳細へ飛ぶときの鍵を、**画面に書いてある `key` の名前**で受け取るようにした
（前は `id` という名前だけを見ていた）。あわせて、鍵が渡っていない画面移動と、
メニューに直接置いた詳細画面を `advise` が言うようにした。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.9.2

一覧のコードを名前で出す所を、**数字とグラフの画面と帳票にも**広げた
（0.9.1 では crud / search だけだった）。紙に刷る側（`hatake_print`）も同じにしてある。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.9.1

Dart 版そのものに変更はない。**3版は同じ番号で出す**と決めてあるので、
TypeScript 版（診断 `key-wrong-shape` を追加）と Java 版（app 定義の画面を中身まで
読めるように・列の `roles` を読むように）に合わせて番号だけ上げた。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.9.0

最初に配る版。**git の tag から入れる**（pub.dev にはまだ出していない）。
Flutter / TypeScript / Java の3版は**同じ番号**で出している。

変更の一覧はリポジトリの
[CHANGELOG](https://github.com/ASIL-E-Hatake/hatake/blob/main/CHANGELOG.md)、
入れ方は
[リリースと入れ方](https://github.com/ASIL-E-Hatake/hatake/blob/main/docs/guide/release.ja.md)。

## 0.0.1

- Initial release.
- Function-based builder DSL: `crudPage`, `searchPage`, `search`, `filter`,
  `table`, `column`, `form`, `section`, `field`, `action`, `option`.
- Validator helpers: `maxLength`, `minLength`, `minValue`, `maxValue`,
  `pattern`, `email`.
- Produces PageDefinitions identical to the equivalent YAML/JSON.

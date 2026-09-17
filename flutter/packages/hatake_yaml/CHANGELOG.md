# Changelog

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
- `parsePageYaml` / `parsePageJson` / `parsePageMap` converting definition
  documents into `hatake_core` PageDefinitions (`crud` and `search` pages).
- YAML and JSON normalize to the same shape and converge on an identical
  `PageDefinition`.
- `DefinitionParseException` with path information.

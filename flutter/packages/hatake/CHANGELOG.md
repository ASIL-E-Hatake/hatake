# Changelog

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
- `Renderer` contract (presentation only — no business logic), with
  `buildCrudPage` and `buildSearchPage`.
- `ListController` (read path) and `CrudController` (adds the create/edit form
  workflow): renderer-independent runtimes.
- Plugin registries: `RepositoryRegistry`, `ValidatorRegistry` (via core),
  and `ActionRegistry` for `type: plugin` actions.
- Widgets: `HatakeScope`, `HatakeCrudView`, `HatakeSearchView`, and the
  unified `HatakePageView`.

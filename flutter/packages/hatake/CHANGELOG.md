# Changelog

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

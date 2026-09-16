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
- `PageDefinition` model (sealed) with `CrudPageDefinition` and
  `SearchPageDefinition`.
- `Repository` contract and `RepositoryQuery` / `PageResult`.
- Validation engine: `ValidatorRegistry`, built-in validators, `FormValidator`.
- Open string type identifiers (`FieldTypes`, `ValidatorTypes`, `ActionTypes`,
  `ColumnTypes`, `FilterOperators`) for plugin extensibility.

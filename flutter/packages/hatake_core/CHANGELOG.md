# Changelog

## 0.0.1

- Initial release.
- `PageDefinition` model (sealed) with `CrudPageDefinition` and
  `SearchPageDefinition`.
- `Repository` contract and `RepositoryQuery` / `PageResult`.
- Validation engine: `ValidatorRegistry`, built-in validators, `FormValidator`.
- Open string type identifiers (`FieldTypes`, `ValidatorTypes`, `ActionTypes`,
  `ColumnTypes`, `FilterOperators`) for plugin extensibility.

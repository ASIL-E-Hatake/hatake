# Changelog

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

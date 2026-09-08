# Changelog

## 0.0.1

- Initial release.
- `pumpPage`: renders a definition (YAML / JSON / `PageDefinition`) inside a
  widget test, with a fake Repository backing it.
- `FakeRepository`: an in-memory Repository that records what was asked of it.
- `HatakeFind`: finders built on the published key convention (`HatakeKeys`).

# Changelog

## 0.0.1

- Initial release.
- `parsePageYaml` / `parsePageJson` / `parsePageMap` converting definition
  documents into `hatake_core` PageDefinitions (`crud` and `search` pages).
- YAML and JSON normalize to the same shape and converge on an identical
  `PageDefinition`.
- `DefinitionParseException` with path information.

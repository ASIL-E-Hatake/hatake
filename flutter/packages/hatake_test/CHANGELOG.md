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
- `pumpPage`: renders a definition (YAML / JSON / `PageDefinition`) inside a
  widget test, with a fake Repository backing it.
- `FakeRepository`: an in-memory Repository that records what was asked of it.
- `HatakeFind`: finders built on the published key convention (`HatakeKeys`).

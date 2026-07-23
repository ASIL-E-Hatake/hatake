# hatake_core

The pure-Dart core of [hatake](https://pub.dev/packages/hatake).

Contains the **PageDefinition** model (the Single Source of Truth), the
**Repository** contract, and **validation** primitives. It has **no Flutter
dependency** — definitions and parsers can be built and unit-tested without a
Flutter toolchain. Only renderers depend on Flutter.

```
YAML ─┐
JSON ─┼─→ Map ─→ PageDefinition ─→ Renderer ─→ Widget
Dart ─┘        (this package)
```

Type identifiers (field types, validators, actions, columns, operators) are
**open strings** with constant holders (e.g. `FieldTypes.text`) so that plugins
can register new types without modifying the framework.

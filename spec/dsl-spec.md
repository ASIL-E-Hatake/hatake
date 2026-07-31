# hatake DSL Specification (v1.0)

> 🌐 English (this page) ・ [日本語版](dsl-spec.ja.md)

This document defines the hatake definition DSL. A definition describes a
business **page**; hatake parses it into a `PageDefinition` and a renderer draws
it. YAML and JSON are two encodings of the same structure — both normalize to
the same `PageDefinition`. A type-safe Dart builder (`hatake_dsl`) produces the
identical result programmatically.

- Machine-readable schema: [`schema/hatake-page.schema.json`](hatake-page.schema.json) (JSON Schema 2020-12)
- Validate a document: `python spec/tools/validate_schema.py path/to/def.yaml`

## Document structure

The canonical document has a version and a `page`:

```yaml
dsl_version: "1.0"
page:
  type: crud
  # ...
```

`dsl_version` is optional (defaults to `1.0`). The `page` map may also be
provided at the top level directly (without the `page:` wrapper); the canonical
wrapped form is recommended.

### Editor completion

Add this modeline to the top of a YAML file for schema-aware completion and
validation in editors that use the YAML Language Server:

```yaml
# yaml-language-server: $schema=https://github.com/ASIL-E-Hatake/hatake/raw/main/spec/hatake-page.schema.json
```

## Open type system

Type identifiers — field types, filter operators, column render types,
validator types, action types — are **open strings**. Built-ins are listed
below, and plugins may register additional values without changing the schema.
Each element also accepts a free-form `config` map for renderer/plugin-specific
settings.

## Page kinds

`page.type` selects the business component:

| `type` | Component | Has form? | Notes |
|---|---|---|---|
| `crud` | Create/read/update/delete | ✅ | search + table + form + row edit/delete |
| `search` | Read-only search/list (照会) | — | search + table + plugin actions (page & row) |
| `master` | Master maintenance | ✅ | same shape as `crud` |
| `detail` | Read-only single record | — | displays the form's fields; the record is supplied to the view at runtime |
| `form` | Standalone create/edit form | ✅ | form only (no table); edits when a record key is supplied, else creates |

A `search` page has the same `search`, `table`, and `actions` as `crud` but no
`form`, and its `rowActions` reference page-level `plugin` actions (e.g. a
`detail` action) dispatched with the row as context. Example:
[`examples/product_search.yaml`](examples/product_search.yaml).

## `page` (type: crud)

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `type` | string | ✅ | — | Page kind. Currently `crud`. |
| `id` | string | ✅ | — | Stable page identifier. |
| `title` | string | ✅ | — | Page title. |
| `repository` | string | ✅ | — | Key resolving the user-provided `Repository`. |
| `key` | string | | `id` | Primary-key field of a record. |
| `search` | [search](#search) | | — | Search area. Omit to list all records. |
| `table` | [table](#table) | | empty | Results table. |
| `form` | [form](#form) | | empty | Create/edit form. |
| `actions` | [action](#action)[] | | `[]` | Page-level actions. |

## search

| Key | Type | Default | Description |
|---|---|---|---|
| `layout` | [layout](#layout) | `{columns: 1}` | Arrangement of filters. |
| `filters` | [filter](#filter)[] | `[]` | Search inputs. |

### filter

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `field` | string | ✅ | — | Backing data key. |
| `label` | string | ✅ | — | Display label. |
| `type` | string | | `text` | Input type (see [field types](#field-types)). |
| `operator` | string | | `contains` | Match operator (see [operators](#filter-operators)). |
| `options` | [option](#option)[] | | `[]` | For select-style filters. |
| `config` | map | | `{}` | Extra settings. |

## table

| Key | Type | Default | Description |
|---|---|---|---|
| `pagination` | [pagination](#pagination) | `{pageSize: 50}` | Paging config. |
| `rowActions` | string[] | `[]` | Per-row action ids. Built-ins: `edit`, `delete`. |
| `columns` | [column](#column)[] | `[]` | Table columns. |

### column

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `field` | string | ✅ | — | Backing data key. |
| `label` | string | ✅ | — | Header label. |
| `type` | string | | `text` | Render type (see [column types](#column-types)). |
| `width` | number | | flexible | Fixed width in logical pixels. |
| `sortable` | boolean | | `false` | Whether the column can sort. |
| `format` | string | | — | Display formatter name (see [formatters](#formatters)). Options read from `config`. |
| `config` | map | | `{}` | Extra settings (also formatter options). |

### pagination

| Key | Type | Default | Description |
|---|---|---|---|
| `pageSize` | integer (≥1) | `50` | Rows per page. |
| `enabled` | boolean | `true` | Whether paging is on. |

## form

| Key | Type | Default | Description |
|---|---|---|---|
| `sections` | [section](#section)[] | `[]` | Grouped fields. |

### section

| Key | Type | Default | Description |
|---|---|---|---|
| `title` | string | — | Optional heading. |
| `layout` | [layout](#layout) | `{columns: 1}` | Field arrangement. |
| `fields` | [field](#field)[] | `[]` | Input fields. |

### field

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `field` | string | ✅ | — | Backing data key. |
| `label` | string | ✅ | — | Display label. |
| `type` | string | | `text` | Field type (see [field types](#field-types)). |
| `required` | boolean | | `false` | Adds a `required` validator + marker. |
| `readOnly` | boolean | | `false` | Whether the field is read-only. |
| `defaultValue` | any | | — | Value applied on create. |
| `validators` | [validator](#validator)[] | | `[]` | Validation rules. |
| `options` | [option](#option)[] | | `[]` | For select/radio/multiSelect. |
| `format` | string | | — | Display formatter name (see [formatters](#formatters)). |
| `normalize` | string[] | | `[]` | Input converters applied before validation (see [converters](#converters)). |
| `config` | map | | `{}` | Extra settings. |

### validator

`type` selects the validator; every other key except `message` is passed as a
parameter.

```yaml
- { type: maxLength, value: 20 }
- { type: pattern, pattern: "^[A-Z]+$", message: 大文字のみ }
```

| Built-in `type` | Parameter | Meaning |
|---|---|---|
| `required` | — | Value must not be empty. |
| `maxLength` | `value` (int) | String length ≤ value. |
| `minLength` | `value` (int) | String length ≥ value. |
| `min` | `value` (num) | Number ≥ value. |
| `max` | `value` (num) | Number ≤ value. |
| `pattern` | `pattern` (regex) | Must match the regular expression. |
| `email` | — | Must be a valid email address. |
| `postalCode` | — | Japanese postal code (`1234567` or `123-4567`). |

`message` overrides the default (Japanese) message.

## action

| Key | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Stable id (referenced by `rowActions`). |
| `type` | string | ✅ | Action type (see [action types](#action-types)). |
| `label` | string | ✅ | Button label. |
| `plugin` | string | | Plugin key (when `type: plugin`). |
| `config` | map | | Extra settings. |

## option

| Key | Type | Required | Description |
|---|---|---|---|
| `value` | string/number/bool/null | | Stored value. |
| `label` | string | ✅ | Display label. |

## layout

| Key | Type | Default | Description |
|---|---|---|---|
| `columns` | integer (≥1) | `1` | Items per row on wide layouts. |

## Built-in value vocabularies

### Field types
`text`, `textarea`, `number`, `select`, `multiSelect`, `checkbox`, `radio`,
`date`, `dateTime`, `time`

### Filter operators
`equals`, `contains`, `startsWith`, `endsWith`, `gt`, `gte`, `lt`, `lte`,
`between`, `in`

### Column types
`text`, `number`, `badge`, `boolean`, `date`, `dateTime`

### Action types
`create`, `edit`, `delete`, `plugin`

### Formatters
(display, via `format`) `currency`, `percent`, `date`, `wareki`, `postal`, `mask`.
Options are read from the element's `config` (e.g. `{ symbol: "¥", negative: "triangle" }`).

### Converters
(input normalization, via `normalize`) `toHankaku`, `toZenkaku`, `hiraToKata`,
`kataToHira`, `trim`, `collapseSpaces`, `parseNumber`.

## Complete example

See [`examples/customer_master.yaml`](examples/customer_master.yaml).

## Equivalence guarantee

For any definition, these produce an identical `PageDefinition`:

```
parsePageYaml(yaml) == parsePageJson(json) == <hatake_dsl builder>
```

This is enforced by tests in `hatake_yaml` and `hatake_dsl`.

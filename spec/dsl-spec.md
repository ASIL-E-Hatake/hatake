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
wrapped form is recommended. To bundle several pages into one navigable
application, use `app:` as the root instead — see [app](#app-navigation).

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

## app (navigation)

A top-level definition that bundles several pages into **one application**. Use
`app:` as the document root instead of `page:`. Drawing it (shell + routing) is
the renderer's responsibility.

```yaml
dsl_version: "1.0"
app:
  id: sales_admin
  title: 販売管理
  home: customers                 # initial route (a menu id; defaults to the first leaf)
  menu:
    - { id: customers, label: 顧客, icon: people, page: customer_master }
    - group: マスタ                # an entry with children is a group
      roles: [admin]              # gated by roles (isAllowed)
      items:
        - { label: 商品, page: product_master }
  pages:
    - { type: crud, id: customer_master, ... }   # ordinary page definitions, listed as-is
    - { type: detail, id: customer_detail, ... }
```

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | ✅ | — | Application identifier. |
| `title` | string | ✅ | — | Application title (shown by the shell). |
| `home` | string | | first leaf | Initial route (a [menu-item](#menu-item) id). |
| `menu` | [menu-item](#menu-item)[] | | `[]` | Navigation menu (a tree of leaves and groups). |
| `pages` | page[] | | `[]` | Page definitions making up this app, referenced by id from `menu` / `navigate`. |

### menu-item

Either a leaf (opens a `page`) or a group (has `items`).

| Key | Type | Description |
|---|---|---|
| `id` | string | Route key of a leaf (defaults to its `page`). |
| `label` / `group` | string | Label. A group carries its heading in `group:`. |
| `icon` | string | Icon name (the renderer maps it to a real icon). |
| `page` | string | Page id the leaf opens. |
| `items` | menu-item[] | Children of a group. |
| `roles` | string[] | Roles allowed to see it (see [access control](#access-control-roles)). |

### navigate action

Navigation is an `action` of type `navigate`. It carries `page` (the target id)
and `params` (values passed to the route; `$row.id` / `$record.id` interpolate
the current row / record).

```yaml
- { id: detail, type: navigate, label: 詳細, page: customer_detail, params: { id: "$row.id" } }
```

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

**How each input appears** (the renderer decides from `type`):

| `type` | Input | Value sent |
|---|---|---|
| `text` / `textarea` | Text box | string (nothing is sent when empty) |
| `number` | Numeric keyboard | number (falls back to the string when unparseable) |
| `select` | Dropdown (with `—` = unset) | `option.value` |
| `checkbox` | **Tri-state** dropdown (unset / yes / no) | `true` / `false` (unset sends nothing) |
| `date` / `dateTime` | Calendar picker | `yyyy-MM-dd` |

Adding `operator: between` turns the filter into **two inputs (from / to)** and
the value arrives as a 2-element `[from, to]` list (either side may be omitted —
the other is then `null`). This is how you express a date range:

```yaml
- { field: orderDate, label: 受注日, type: date, operator: between }
```

When several filters are used, `search.layout.columns` sets the column count
(narrow screens collapse to a single column). **Empty inputs are never sent**,
so a blank condition never narrows the result set.

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
| `roles` | string[] | | `[]` | Roles allowed to see it (see [access control](#access-control-roles)). Empty = everyone. |

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
| `visibleWhen` | [condition](#condition) | | — | Show only while the condition holds. Absent = always visible. |
| `enabledWhen` | [condition](#condition) | | — | Enable only while the condition holds. Absent = always enabled. |
| `computed` | [computed](#computed) | | — | Derive the value from the record (shown read-only). |
| `roles` | string[] | | `[]` | Roles allowed to see it (see [access control](#access-control-roles)). Empty = everyone. |
| `columns` | [column](#column)[] | | `[]` | Child-row grid columns (for `type: subTable`; see [child rows](#child-rows-subtable)). |
| `fields` | field[] | | `[]` | Child-row editor fields (for `type: subTable`; derived from `columns` when omitted). |
| `source` | [subTableSource](#subtablesource) | | — | Take child rows from their own repository (for `type: subTable`; embedded in the parent record when omitted). |

### Child rows (subTable)

A built-in field type for handling **master-detail** data — an order header plus
its lines — on one screen. With `type: subTable`, **the field's value is an array
of records** (the child rows); `columns` describes the grid and `fields` the row
editor.

```yaml
- field: lines                # the parent's `lines` is [{...}, {...}]
  label: 明細
  type: subTable
  columns:                    # display (same shape as column — format/width/roles apply)
    - { field: item,  label: 品名 }
    - { field: qty,   label: 数量, type: number, width: 100 }
    - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
  fields:                     # row editing (same shape as field — required/validators/computed apply)
    - { field: item, label: 品名, required: true }
    - { field: qty,  label: 数量, type: number, required: true, validators: [ { type: min, value: 1 } ] }
    - { field: price, label: 単価, type: number, required: true }
    - { field: amount, label: 金額, computed: { op: product, fields: [qty, price] } }
```

Header and lines are saved **together in a single call**
(`Repository.update(key, {...header, lines: [...]})`). When the detail is large
enough to need paging, use [subTableSource](#subtablesource) instead.

Rows can be **reordered** (move up / move down per row — for documents where the
line order carries meaning). On by default; opt out with
`config: { reorderable: false }`:

```yaml
- { field: lines, label: 明細, type: subTable, config: { reorderable: false }, columns: [...] }
```

**The same definition validates child rows on the server.** `FormValidator`
(Dart / TypeScript / Java) checks every `subTable` row against the field's
`fields` and reports errors under an indexed path —
**`<field>[<index>].<rowField>`** (e.g. `lines[0].qty`). The rules that guard the
row editor in the UI therefore guard the backend too, so a detail line cannot
slip through unchecked (the [conformance suite](conformance/)'s
`subtable_validation.json` pins all three languages to the same behaviour).

### subTableSource

Adding `source` to a `subTable` fetches the child rows **from their own
repository by foreign key** rather than from inside the parent record. This is
for details running into the thousands of rows; a few dozen rows are better
served by the embedded form (no `source`).

```yaml
- field: lines
  label: 明細
  type: subTable
  source:
    repository: orderLineRepository   # repository key for the child rows
    parentKey: orderNo                # child field holding the parent key
    key: lineNo                       # primary-key field of a child row (default id)
    pageSize: 20                      # rows per page (default 20)
  columns: [...]
  fields: [...]
```

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `repository` | string | ✅ | — | Repository key for the child rows. |
| `parentKey` | string | ✅ | — | Child field holding the parent key. Passed as the search filter `{ parentKey: <parent key value> }`. |
| `key` | string | | `id` | Primary-key field of a child row, used to update/delete it. |
| `pageSize` | integer | | `20` | Rows per page. |

**How it differs from the embedded form** — the behaviour changes, so choose
deliberately:

| | Embedded (no `source`) | Child repository (`source`) |
|---|---|---|
| Where rows live | A field of the parent record (`lines: [...]`) | Their own repository; the parent record has no `lines` |
| Loading | Arrive with the parent's `findByKey` | `search({ filters: { parentKey: <parent key> }, page, pageSize })` |
| Saving a row | Once, with the parent | **Immediately, per row** (`create` / `update` / `delete`) |
| While the parent is unsaved | Editable as usual | **Not editable** — without the parent key there is no foreign key to write. Save the parent first |
| Reordering | ✅ (`reorderable`) | ✗ — order is the repository's concern. Model it as a field and sort on it |
| The parent's `FormValidator` | The field's own rules plus every row against `fields` | **The whole field is skipped** (its value is not in the record, so a `required` here would be meaningless). Rows are validated as they are saved, against the same `fields` |

Using `source` gives up "saved atomically in one call". **If the business
requires the header and its lines to commit together, choose the embedded
form.**

### Access control (roles)

`roles` (a list of allowed roles) on a `field` / `column` / `action` **shows or
hides it according to the current user's roles**. Empty or absent means visible
to everyone.

```yaml
- { field: salary, label: 給与, type: number, roles: [hr, manager] }
```

The rule is: an empty `roles` allows anyone, otherwise the user needs at least
one of the listed roles (`isAllowed`).

**Note**: this is **UI-level display gating**, not authentication or
authorization — those are outside the framework's scope. The current user's role
set is supplied at runtime (`HatakeScope(roles: {...})` in Flutter). Real access
control — protecting and validating the data itself — must always be enforced on
the backend.

### condition

The declarative condition used by `visibleWhen` / `enabledWhen`, evaluated
against a record. Either a **leaf** or a **combinator**:

```yaml
# leaf (field / operator / value)
visibleWhen: { field: type, operator: equals, value: corporate }

# combinators (all=AND / any=OR / not)
enabledWhen:
  all:
    - { field: type, operator: equals, value: corporate }
    - { field: age,  operator: gte,    value: 20 }
```

Operators: `equals` `notEquals` `gt` `gte` `lt` `lte` `contains` `in` `isEmpty`
`isNotEmpty`. Two numbers compare numerically, anything else compares as
strings. An unknown operator evaluates to false.

### computed

A derived field, calculated from the record. `op` selects the calculation
(plugins may register more).

```yaml
computed: { op: concat, fields: [lastName, firstName], separator: " " }
computed: { op: sum, fields: [price, tax] }
```

| Built-in `op` | Meaning |
|---|---|
| `concat` | Joins `fields` with `separator` (default empty). |
| `sum` | Numeric sum of `fields` (missing counts as 0). |
| `subtract` | `fields[0]` minus the sum of the rest. |
| `product` | Numeric product of `fields` (missing counts as 1). |

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

`message` overrides the default (Japanese) message. To replace the defaults
wholesale — including for another locale — inject a `MessageResolver` into the
`ValidatorRegistry`.

## action

| Key | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Stable id (referenced by `rowActions`). |
| `type` | string | ✅ | Action type (see [action types](#action-types)). |
| `label` | string | ✅ | Button label. |
| `plugin` | string | | Plugin key (when `type: plugin`). |
| `config` | map | | Extra settings. |
| `roles` | string[] | | Roles allowed to run it (see [access control](#access-control-roles)). Empty = everyone. |

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
`date`, `dateTime`, `time`, `subTable`

### Filter operators
`equals`, `contains`, `startsWith`, `endsWith`, `gt`, `gte`, `lt`, `lte`,
`between`, `in`

### Column types
`text`, `number`, `badge`, `boolean`, `date`, `dateTime`

### Action types
`create`, `edit`, `delete`, `navigate`, `plugin`

### Formatters
(display, via `format`) `currency`, `percent`, `date`, `wareki`, `postal`, `mask`.
Options are read from the element's `config` (e.g. `{ symbol: "¥", negative: "triangle" }`).

### Converters
(input normalization, via `normalize`) `toHankaku`, `toZenkaku`, `hiraToKata`,
`kataToHira`, `trim`, `collapseSpaces`, `parseNumber`.

## Complete example

See [`examples/customer_master.yaml`](examples/customer_master.yaml). For a whole
application (menu + several pages) see
[`examples/sales_app.yaml`](examples/sales_app.yaml), and for master-detail
[`examples/order_entry.yaml`](examples/order_entry.yaml) (embedded rows) and
[`examples/order_entry_paged.yaml`](examples/order_entry_paged.yaml) (child
repository).

## Equivalence guarantee

For any definition, these produce an identical `PageDefinition`:

```
parsePageYaml(yaml) == parsePageJson(json) == <hatake_dsl builder>
```

This is enforced by tests in `hatake_yaml` and `hatake_dsl`.

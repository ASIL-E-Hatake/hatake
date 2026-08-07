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

**Only the values are open; the keys are closed.** Any number of type names may
be added, but writing `labell` for `label` is simply a mistake — which is what
the next section is about.

## Unknown keys (strict)

By default the parser drops keys it does not know. That keeps existing
definitions working, but it has a side effect: **misspelling an optional key does
nothing at all** (a misspelled *required* key already fails, because the value it
needs cannot be found — the silent ones are `readOnly`, `sortable`,
`visibleWhen`, and most of the DSL is optional).

Hence **strict parsing**. With it, not a single unknown key is allowed.

```dart
parsePageYaml(source, strict: true);   // Dart
```
```ts
parsePageYaml(source, { strict: true });          // TypeScript
```
```java
DefinitionParser.parsePageYaml(source, true);     // Java
```

- It is **exactly as strict as the [JSON Schema](hatake-page.schema.json)**: only
  nodes with `additionalProperties: false` are closed, and it never looks inside
  free-form holders (`config`, `validators`, `computed`, `visibleWhen`) — those
  are where plugins add their own keys.
- It does **not stop at the first one**: every offending key comes back together,
  so one round trip is enough to fix them all.
- It **suggests** the nearest known key when there is one (case-insensitive edit
  distance ≤ 2, so `pagesize` → `pageSize`, `visible_when` → `visibleWhen`).
- An unknown **page kind** skips the key check (the kind error is more
  fundamental, so that is what you get).
- Results are ordered by `(path, key)`, identically in all three languages.

```
知らないキーが 2 件あります:
  - page.form.sections[0].fields[0]: 知らないキー "readonly"（readOnly の間違い？）
  - page.form.sections[0].fields[0]: 知らないキー "requred"（required の間違い？）
```

Use strict in CI and in tools that author definitions
([`conformance/strict_keys.json`](conformance/strict_keys.json) pins all three
languages; a second test proves each edition's key table matches the schema).

## Page kinds

`page.type` selects the business component:

| `type` | Component | Has form? | Notes |
|---|---|---|---|
| `crud` | Create/read/update/delete | ✅ | search + table + form + row edit/delete |
| `search` | Read-only search/list (照会) | — | search + table + plugin actions (page & row) |
| `master` | Master maintenance | ✅ | same shape as `crud` |
| `detail` | Read-only single record | — | displays the form's fields; the record is supplied to the view at runtime |
| `form` | Standalone create/edit form | ✅ | form only (no table); edits when a record key is supplied, else creates |
| `wizard` | Stepped input | ✅ | the form split into `steps`, **validated one step at a time**, saved once at the end (→ [wizard](#wizard-type-wizard)) |
| `dashboard` | Dashboard | — | a grid of `items` (cards); one card = one small read-only query plus how to show it (→ [dashboard](#dashboard-type-dashboard)) |
| `report` | Report (帳票) | — | the printable counterpart of a list: groups, subtotals, paper (→ [report](#report-type-report)) |

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

## wizard (type: wizard)

A single-record page that walks long input through **steps**. Only one step's
fields are shown, and **only that step's fields are validated** before advancing.
The repository is touched once, on the final step — nothing partial is written.

It carries `steps` in place of `form`; everything else matches the
[`form` page](#page-type-crud) (`repository` / `key`, editing when a record key is
supplied, creating otherwise).

```yaml
dsl_version: "1.0"
page:
  type: wizard
  id: customer_onboarding
  title: 顧客登録
  repository: customerRepository
  key: id
  steps:
    - id: basic
      title: 基本情報
      description: まず会社の基本情報を入力してください   # optional
      layout: { columns: 2 }
      fields:
        - { field: code, label: コード, required: true, normalize: [toHankaku, trim] }
        - { field: name, label: 会社名, required: true }
    - id: contact
      title: 連絡先
      fields:
        - { field: zip, label: 郵便番号, validators: [ { type: postalCode } ] }
        - { field: email, label: メール, validators: [ { type: email } ] }
    - id: confirm
      title: 確認
      fields:
        # Show earlier answers back via computed (read-only).
        - { field: summary, label: 内容, computed: { op: concat, fields: [code, name], separator: " / " } }
  actions:
    - { id: showDef, type: plugin, plugin: showDefinition, label: 定義を見る }
```

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `type` | string | ✅ | — | `wizard`. |
| `id` | string | ✅ | — | Stable page identifier. |
| `title` | string | ✅ | — | Page title. |
| `repository` | string | ✅ | — | Key resolving the user-provided `Repository`. |
| `key` | string | | `id` | Primary-key field of a record. |
| `steps` | [step](#step)[] | ✅ | — | Steps (at least one), walked in declaration order. |
| `actions` | [action](#action)[] | | `[]` | Page-level actions. |

### step

Think of it as **a [section](#section) with an `id` and a heading** — `fields` and
`layout` are the section's.

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | ✅ | — | Step identifier (for stable references). |
| `title` | string | ✅ | — | Step heading. |
| `description` | string | | — | Optional explanatory text. |
| `layout` | [layout](#layout) | | `{columns: 1}` | Field arrangement. |
| `fields` | [field](#field)[] | | `[]` | Fields belonging to this step. |

**How validation applies**:

- **Next** … checks this step's `fields` only. A later step's blank `required`
  never blocks leaving an earlier one.
- **Save** … checks the final step, then the **whole wizard as one form**. If a
  field from an earlier step fails there, the wizard **jumps back to the step that
  owns it** rather than failing silently.
- Saving happens once, and `normalize` is applied to every field at that point
  (see [converters](#converters)) — so a confirmation step shows the raw input.

The same definition validates on the server: hand `FormValidator` (Dart /
TypeScript / Java) **one step's form** to check that step, or **the whole page's
form** to check everything (the [conformance suite](conformance/)'s
`wizard_validation.json` pins all three languages to the same behaviour).

## dashboard (type: dashboard)

A read-only page of cards. **One card = one small read-only query plus how to
display its result.**

Unlike the other page kinds it **addresses no single record**, so it has no
`key`, and `repository` is only the default for cards that declare none (each
card may read a different repository).

**How aggregation works**: the framework never issues an aggregate query. The
repository **returns rows** and the definition only describes the reduction over
them (see [aggregates](#aggregate-operations)) — which makes `limit` the sample
size an aggregate sees. When a number must be exact over a big table, point the
card at a **pre-aggregated endpoint** and omit `aggregate` (one row = one point),
or use `count`: `count` alone uses the **total count** the repository reports, so
`limit` does not affect it.

```yaml
dsl_version: "1.0"
page:
  type: dashboard
  id: sales_dashboard
  title: 売上ダッシュボード
  repository: orderRepository       # default for cards that omit one
  layout: { columns: 4 }            # card grid width
  # The search area is merged into every card's query (one period filters all)
  search:
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  items:
    # metric: one aggregated number. Without `value` it counts rows
    - { id: orderCount, title: 受注件数, action: openOrders }
    - id: totalAmount
      title: 受注金額
      value: { aggregate: sum, field: amount }
      format: currency
      config: { symbol: "¥" }
    - id: pending
      title: 未出荷
      filters: { status: 未出荷 }   # this card's own fixed condition
    # chart: with `aggregate`, rows sharing a label fold into one point
    - id: byCustomer
      type: chart
      title: 顧客別の受注金額
      span: 2
      chart: { kind: bar, labelField: customer, valueField: amount, aggregate: sum }
    # table: a few rows (columns take the same shape as a table's column)
    - id: recent
      type: table
      title: 直近の受注
      span: 2
      limit: 5
      sort: { field: orderDate, ascending: false }
      columns:
        - { field: orderNo, label: 受注番号, width: 140 }
        - { field: amount, label: 金額, type: number, format: currency }
  actions:
    - { id: openOrders, type: navigate, label: 受注照会, page: order_search }
```

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `type` | string | ✅ | — | `dashboard`. |
| `id` | string | ✅ | — | Stable page identifier. |
| `title` | string | ✅ | — | Page title. |
| `repository` | string | | — | Default repository key for cards that omit one. |
| `layout` | [layout](#layout) | | `{columns: 2}` | Card grid width. |
| `search` | [search](#search) | | — | Filters merged into **every** card's query (they win over a card's `filters`). |
| `items` | [item](#item)[] | ✅ | — | Cards (at least one), in declaration order. |
| `actions` | [action](#action)[] | | `[]` | Page-level actions (referenced by a card's `action`). |

### item

One card. It declares how to read (`repository` / `filters` / `limit` / `sort`)
and how to show (`type`, plus the matching `value` / `columns` / `chart`).

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | ✅ | — | Card identifier. |
| `title` | string | ✅ | — | Card heading. |
| `type` | string | | `metric` | Card kind (see [dashboard item types](#dashboard-item-types)). |
| `repository` | string | | the page's | Repository this card reads. |
| `span` | integer (≥1) | | `1` | Grid columns this card occupies. |
| `filters` | map | | `{}` | This card's own fixed conditions. |
| `limit` | integer (≥1) | | `100` | Rows to fetch (the query's `pageSize`). |
| `sort` | `{field, ascending}` | | — | Sort; `ascending` defaults to `true`. |
| `value` | [value](#value) | | `{aggregate: count}` | Reduction for a `metric`. |
| `format` | string | | — | Display formatter (see [formatters](#formatters)). |
| `config` | map | | `{}` | Extra settings (formatter options, `height`, …). |
| `columns` | [column](#column)[] | | `[]` | Columns for a `table`. |
| `chart` | [chart](#chart) | | — | Plot for a `chart`. |
| `action` | string | | — | Id of a page action to run when the card is tapped. |
| `roles` | string[] | | `[]` | Roles allowed to see this card (see [access control](#access-control-roles)). |

**Cards load independently**, so one failing repository fails **only that card**.

### value

How a `metric` card folds its rows into a single number.

| Key | Type | Default | Description |
|---|---|---|---|
| `aggregate` | string | `count` | Aggregate operation (see [aggregates](#aggregate-operations)). |
| `field` | string | — | Field to reduce. Not needed by `count`, required by the others. |

### chart

How a `chart` card turns its rows into points.

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `kind` | string | | `bar` | Chart kind (see [chart kinds](#chart-kinds)). |
| `labelField` | string | ✅ | — | Field holding each point's label. |
| `valueField` | string | | — | Field holding each point's value (not needed by `count`). |
| `aggregate` | string | | — | Aggregate applied per label. **Omit it and every row is a point** (for pre-aggregated data). |

Labels keep their **first-appearance order** (so every language produces the same
sequence; sorting is the repository's job). Rows without a label fall into one
group whose label is the empty string.

## report (type: report)

The **printable counterpart of a list**. Detail columns come from
[table](#table), so the report and the list of the same data cannot drift apart;
`report` adds only the printing structure. It addresses no single record, so it
has no `key`.

**Grouping is a control break**: rows are read in order and a change of key emits
a subtotal and then a heading. So the **rows must already be sorted** — that is
the repository's job — and the same value appearing twice apart makes two groups.

**Printing itself is outside the framework.** Definition + rows produce a neutral
report document; the renderer draws it at the paper's shape (a preview). Turning
it into PDF or sending it to a printer is an opt-in adapter's job — the same
position `QuerySpec` holds.

```yaml
dsl_version: "1.0"
page:
  type: report
  id: sales_report
  title: 売上明細表
  repository: orderRepository
  # Output conditions, passed straight to the repository as filters
  search:
    layout: { columns: 2 }
    filters:
      - { field: orderDate, label: 受注日, type: date, operator: between }
  # Detail columns (plain `column`s; number columns print right-aligned)
  table:
    columns:
      - { field: orderNo, label: 受注番号, width: 140 }
      - { field: amount, label: 金額, type: number, format: currency, config: { symbol: "¥" } }
  report:
    paper: { size: A4, orientation: portrait }
    rowsPerPage: 30
    sort: { field: customer }          # groupBy depends on this order
    groupBy:
      - { field: customer, label: 顧客, pageBreak: true }   # one sheet per customer
    totals:
      - { field: amount, aggregate: sum }
      - { field: amount, aggregate: count }
  actions:
    # The CSV comes from the same columns (the sink is registered by the app)
    - { id: csv, type: export, label: CSV出力, config: { filename: 売上明細, bom: true } }
```

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `type` | string | ✅ | — | `report`. |
| `id` | string | ✅ | — | Stable page identifier. |
| `title` | string | ✅ | — | Report title (printed on the sheet too). |
| `repository` | string | ✅ | — | Key resolving the user's `Repository`. |
| `search` | [search](#search) | | — | Output conditions. |
| `table` | [table](#table) | | empty | Detail columns. |
| `report` | below | | defaults | Printing structure. |
| `actions` | [action](#action)[] | | `[]` | Page-level actions (e.g. `export`). |

**`report`**:

| Key | Type | Default | Description |
|---|---|---|---|
| `paper` | `{size, orientation}` | `{A4, portrait}` | `size` is an open string (`A4` / `A3` / `B5` / `letter`); `orientation` is `portrait` / `landscape`. |
| `rowsPerPage` | integer (≥1) | `40` | Lines per sheet. **Group headings and total lines count as lines** — that is what keeps page breaks identical across the three languages. |
| `limit` | integer (≥1) | `1000` | Rows read for one run. A report is printed, not paged. |
| `sort` | `{field, ascending}` | — | Print order (passed to the repository). A report has no clickable headers, so this is **the only place its order is stated** — and `groupBy` depends on it. |
| `groupBy` | [reportGroup](#reportgroup)[] | `[]` | Control breaks, outermost first. |
| `totals` | [reportTotal](#reporttotal)[] | `[]` | Figures on the subtotal / grand-total lines. |

### reportGroup

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `field` | string | ✅ | — | Field whose change breaks the group. |
| `label` | string | ✅ | — | Heading label (printed as `顧客: 山田商事`). |
| `pageBreak` | boolean | | `false` | Start a new sheet whenever this group changes. |

### reportTotal

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `field` | string | ✅ | — | Field to aggregate. |
| `aggregate` | string | | `sum` | Aggregate operation (see [aggregates](#aggregate-operations) — the same vocabulary a dashboard uses). |

Two totals may share a `field` (e.g. `sum` and `count` of 金額), so the figures on
a total line pair up with the declarations **by position**, not by field name.

**How the document is built** (identical in all three languages, pinned by
[`conformance/report.json`](conformance/report.json)):

1. Walk the rows; when a `groupBy` value changes → **subtotals from the deepest
   level up** → (a new sheet if that group has `pageBreak`) → **headings from the
   outermost down**
2. Emit one detail line
3. At the end: subtotals for the levels still open → the **grand total**
4. Fill sheets with the resulting lines, `rowsPerPage` at a time (a full sheet
   pushes subtotals and the grand total onto the next one)
5. No rows → no sheets (the renderer says so)

## export (CSV)

The `export` action type. It builds the CSV **from the page's own columns
(`table.columns`) and rows**, so lists and reports are written the same way.
Columns a role may not see stay out of the file.

```yaml
- { id: csv, type: export, label: CSV出力, config: { filename: 受注一覧, bom: true } }
```

| `config` | Type | Default | Description |
|---|---|---|---|
| `filename` | string | page title | File name (`.csv` is appended when it has no extension). |
| `header` | boolean | `true` | Write the heading row (column labels). |
| `delimiter` | string | `,` | Field separator (`"\t"` for TSV). |
| `newline` | string | `crlf` | Line break (`crlf` / `lf`). |
| `bom` | boolean | `false` | Prepend a BOM (so Excel reads UTF-8 Japanese). |
| `raw` | boolean | `false` | Skip `format` and write raw values (to compute in Excel). |
| `limit` | integer | `10000` | Cap on the rows a list page re-reads for the export. |

**Writing rules** ([`conformance/csv.json`](conformance/csv.json)): a value
containing the delimiter, a quote or a line break is wrapped in `"` and its quotes
are doubled (RFC 4180); missing values and `null` are empty; no columns means an
empty string; the last line ends with a line break too.

**A list page's `export` writes the whole result, not the page on screen** (it
re-reads up to `limit`). A report page already read `report.limit` rows, so it
writes exactly those.

**Writing the file is outside the framework.** It produces the text (BOM
included) and stops; downloading, showing a save dialog, sharing or uploading is
done by the sink the application registers. Character-set conversion (Shift_JIS
and friends) belongs to the sink for the same reason.

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
`create`, `edit`, `delete`, `navigate`, `plugin`, `export` (→ [export](#export-csv))

### Dashboard item types
(an [item](#item)'s `type`) `metric`, `table`, `chart`

### Chart kinds
(a [chart](#chart)'s `kind`) `bar`, `line`, `pie`

### Aggregate operations
(the `aggregate` of a [value](#value) / [chart](#chart)) `count`, `sum`, `avg`,
`min`, `max`.

| op | Meaning | On no rows |
|---|---|---|
| `count` | Row count (ignores `field`) | `0` |
| `sum` | Sum of the numeric values (non-numeric counts as 0) | `0` |
| `avg` | Mean of the numeric values (non-numeric rows are not counted) | `null` |
| `min` / `max` | Smallest / largest numeric value | `null` |

Numbers are read exactly as `computed` reads them (`"1500"` is a number, a
boolean is not). An unregistered op yields `null` rather than throwing. All three
languages are pinned to the same results by
[`conformance/dashboard_aggregate.json`](conformance/dashboard_aggregate.json).

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
repository). Stepped input:
[`examples/customer_wizard.yaml`](examples/customer_wizard.yaml). Dashboard:
[`examples/sales_dashboard.yaml`](examples/sales_dashboard.yaml). Report:
[`examples/sales_report.yaml`](examples/sales_report.yaml).

## Equivalence guarantee

For any definition, these produce an identical `PageDefinition`:

```
parsePageYaml(yaml) == parsePageJson(json) == <hatake_dsl builder>
```

This is enforced by tests in `hatake_yaml` and `hatake_dsl`.

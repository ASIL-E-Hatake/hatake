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
| `theme` | [theme](#theme) | | — | Look and feel. Omitted = the renderer's default. |
| `menu` | [menu-item](#menu-item)[] | | `[]` | Navigation menu (a tree of leaves and groups). |
| `pages` | page[] | | `[]` | Page definitions making up this app, referenced by id from `menu` / `navigate`. |

### theme

Brand colour, brightness, density and shape. **Renderer neutral** — Material turns it into a `ThemeData`, another renderer into its own equivalent — and **behaviour-free**. Renderer specific extras go in `config` rather than growing the DSL.

```yaml
app:
  theme:
    primaryColor: "#1B5E20"
    density: compact
    radius: 8
```

| Key | Type | Default | Description |
|---|---|---|---|
| `primaryColor` | string | — | Brand colour (`#RRGGBB` / `#AARRGGBB`); the seed the palette derives from. |
| `secondaryColor` | string | derived | Accent colour. |
| `brightness` | `light` / `dark` / `system` | `light` | `system` follows the device setting. |
| `density` | `comfortable` / `standard` / `compact` | `standard` | Row height and padding; business screens usually want `compact`. |
| `fontFamily` | string | — | Font family name (the renderer resolves it). |
| `radius` | number (≥0) | — | Corner radius in logical pixels. |
| `config` | map | `{}` | Renderer specific extras. |

A colour that is not a colour, or an unknown `brightness` / `density`, is a **parse error**: ignoring it silently would leave "I wrote it and nothing changed" with no way to find out why.

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
position `QuerySpec` holds. `hatake_print` is that adapter (`reportPdf(page,
rows)` returns PDF bytes; pure Dart, so a batch with no UI can print too). To read
the paper before printing it, `npx hatake paper <file>` renders the same layout as
text (so does the MCP tool `hatake_print_preview`); the coordinates come from the
same computation, pinned by a [shared fixture](conformance/report_layout.json).
**A definition needs no change to be printed** — margins, footers and page
numbers are a print shop's concern, not the business's, so the caller passes
them to the adapter.

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
| `charset` | string | `utf-8` | Charset name handed to the sink (below). **No conversion happens here.** |

**Writing rules** ([`conformance/csv.json`](conformance/csv.json)): a value
containing the delimiter, a quote or a line break is wrapped in `"` and its quotes
are doubled (RFC 4180); missing values and `null` are empty; no columns means an
empty string; the last line ends with a line break too.

**A list page's `export` writes the whole result, not the page on screen** (it
re-reads up to `limit`). A report page already read `report.limit` rows, so it
writes exactly those.

**Writing the file is outside the framework.** It produces the text (BOM
included) and stops; downloading, showing a save dialog, sharing or uploading is
done by the sink the application registers.

### Charset

Receiving systems that only accept Shift_JIS are still common. **The sink does the
conversion** (it writes the bytes), so a definition only declares what the other
side wants. The name is passed through — `ExportRequest.charset` in Flutter, and on
the MIME type as `text/csv; charset=cp932`.

```yaml
- id: csvSjis
  type: export
  label: CSV出力（Shift_JIS）
  config: { filename: 受注一覧, charset: cp932 }
```

| Name | What it is |
|---|---|
| `utf-8` (default) | as-is |
| `cp932` | **Windows / Excel's Shift_JIS** (a.k.a. windows-31j / MS932). "Please send Shift_JIS" almost always means this |
| `shift_jis` | Shift_JIS as JIS X 0208 (strict). `①` `㈱` `髙` `～` are *not* in it — pick this to reject extended characters |
| `euc_jp` | EUC-JP (JIS X 0208) |

**`bom` only applies to UTF-8.** A BOM is a UTF-8 thing; prepending it to Shift_JIS
puts three bytes of garbage in the first cell, so it is skipped whenever `charset`
is not UTF-8 — declared or not.

The conversion itself lives in the opt-in package
[`hatake_encoding`](../flutter/packages/hatake_encoding/) (cp932 / Shift_JIS /
EUC-JP; the tables are generated, and
[`conformance/charset.json`](conformance/charset.json) is what Dart and the JVM are
checked against). The name is an open string, so a sink can add its own charsets.

## print (on paper)

The `print` action type. **Reports only** — a page with a `report:` — and it hands
the paper's contents to the registered print sink. It prints the rows already on
screen, so a report that looked like three sheets prints as three sheets.

```yaml
- { id: printPdf, type: print, label: Print, config: { filename: sales } }
```

| `config` | Type | Default | What it does |
|---|---|---|---|
| `filename` | string | page title | file name (`.pdf` is added when it has no extension) |

**Everything in `config` other than `filename` passes through unread.** Trays,
typefaces and duplex are a print shop's vocabulary, so the adapter reads them
instead of the DSL growing keys for them (write `config: { font: mincho }` and the
sink can pick it up).

**The bytes are made outside the framework.** A CSV is a string the framework can
build; a PDF is fonts, encodings and page trees — a subsystem an app that never
prints should not carry. So `print` hands over the *contents* (the report, the
rows, the roles, the formatters); the opt-in
[`hatake_print`](../flutter/packages/hatake_print/) turns them into a PDF, and the
application gets that to a printer or a file.

```dart
HatakeScope(
  printSink: (request) async {
    final bytes = reportPdf(
      request.page,
      request.rows,
      formatters: request.formatters,  // reads the same as the screen
      roles: request.roles,            // a hidden column stays off the paper
    );
    await save(request.filename, bytes);
  },
  ...
)
```

With no `printSink` registered the button **says so** rather than doing nothing
quietly, and `print` on a page without a `report` is a warning
(`print-without-report`) so you do not discover it by pressing. To take a list away
as a file, use [`export`](#export-csv) instead — that works on any page.

To read the paper before printing it, `npx hatake paper <file>` renders the same
coordinates as text; a [shared fixture](conformance/report_layout.json) pins them
to what the printer produces.

## Running over a selection (`scope: selection`)

Declaring `scope: selection` on an action makes **the table on that page
selectable**, and the handler receives the rows that were checked — the rows
themselves, not their keys.

```yaml
actions:
  - id: approveSelected
    type: plugin
    plugin: approveOrders
    label: Approve selected
    scope: selection
    confirm: { message: Approve the selected orders? }
```

| Decision | Why |
|---|---|
| **Rows become selectable only when a bulk action exists** | A separate "selectable" key would allow two broken screens: checkboxes with nothing to do, and a bulk button with no way to choose rows. One declaration cannot drift from itself |
| **Disabled until something is selected** (the count is in the label) | A button that does nothing when pressed teaches the user the screen is broken |
| **The selection is dropped when the rows change** | After a new search, a page change or a reload, acting on rows that are no longer on screen is the dangerous case |
| **The selection clears once the action ran** | Running the same rows twice is, almost always, an accident |
| Only `type: plugin` can run over a selection | What a bulk operation *does* (approve, close, confirm shipment) is business logic, and the framework holds none |
| **There is no bulk delete** | An irreversible action scales its accidents with the row count. Delete one row at a time (the `delete` row action) |
| The handler gets **records**, not keys | A bulk decision needs a status or an amount; keys alone would force the handler to read every row back |

In Flutter the registered handler reads `ActionContext.records`. It is called
**once**, so the API can be called once too.

### Reporting the result as counts

A bulk run **partly failing** is the normal case (one of the five was already
shipped). The handler reports counts through `ActionContext.report`, and *what to
say* stays in the definition (`onSuccess` / `onError`) instead of in every handler.

```dart
'approveOrders': (ctx) async {
  final rejected = await api.approve(ctx.records);   // one call
  // Name the rows it could not do: counting alone leaves the shop floor
  // redoing all of them.
  ctx.report(ActionOutcome.rejected(
    succeeded: ctx.records.length - rejected.length,
    rows: [
      for (final one in rejected) FailedRow(one.orderNo, reason: one.why),
    ],
  ));
},
```

| Reported | How it is treated |
|---|---|
| nothing (and no throw) | success; for a bulk run the **rows handed over** fill `{count}` |
| `failed: 0` | success; `onSuccess` runs |
| some failed | **`onSuccess` does not run**; `onError` (default: "3 件を実行しました（1 件失敗）") |
| all failed | same (default: "2 件すべて失敗しました") |
| threw | failure; `onError` (default: the reason as reported) |

A `scope: selection` action on a page with no table, or on a type other than
`plugin`, is reported by `validate`.

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
| `optionsFrom` | string | | — | Parent filter name; its value narrows the options (see [linked options](#linked-options-optionsfrom--when--optionssource)). |
| `optionsSource` | [optionsSource](#linked-options-optionsfrom--when--optionssource) | | — | Fetch the options from a repository. |
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
| `visibleWhen` | [condition](#condition) | — | Show the **whole section** only while the condition holds. A hidden section's fields are not validated either (see [controlling a field](#controlling-a-field-visiblewhen--enabledwhen--readonlywhen--requiredwhen)). |

### field

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `field` | string | ✅ | — | Backing data key. |
| `label` | string | ✅ | — | Display label. |
| `type` | string | | `text` | Field type (see [field types](#field-types)). |
| `required` | boolean | | `false` | Adds a `required` validator + marker. |
| `requiredWhen` | [condition](#condition) | | — | Required only while the condition holds (**also enforced server-side**). |
| `readOnly` | boolean | | `false` | Whether the field is read-only. |
| `readOnlyWhen` | [condition](#condition) | | — | Read-only while the condition holds (the input keeps its ordinary look). |
| `defaultValue` | any | | — | Value applied on create. |
| `validators` | [validator](#validator)[] | | `[]` | Validation rules. |
| `options` | [option](#option)[] | | `[]` | For select/radio/multiSelect. |
| `format` | string | | — | Display formatter name (see [formatters](#formatters)). |
| `normalize` | string[] | | `[]` | Input converters applied before validation (see [converters](#converters)). |
| `config` | map | | `{}` | Extra settings. |
| `visibleWhen` | [condition](#condition) | | — | Show only while the condition holds. Absent = always visible. |
| `enabledWhen` | [condition](#condition) | | — | Enable only while the condition holds (**greyed out** otherwise). Absent = always enabled. |
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

**"only while creating" / "only while editing"** is a `mode` leaf. The record
cannot tell you which one it is, and inspecting the key field instead leaves the
intent unreadable.

```yaml
# the code may be typed while creating, never changed afterwards
- { field: code, label: コード, enabledWhen: { mode: create } }
- { field: updatedBy, label: 更新者, readOnly: true, visibleWhen: { mode: edit } }
```

| `mode` | True while |
|---|---|
| `create` | creating (nothing saved yet) |
| `edit` | editing an existing record |

**False wherever the mode is unknown** (a read-only detail page has none):
`{ mode: create }` asks for a specific state, so it is not satisfied where that
state cannot be told. In a `subTable`, adding a row is `create` and opening an
existing row is `edit`.

### Controlling a field (`visibleWhen` / `enabledWhen` / `readOnlyWhen` / `requiredWhen`)

Four keys drive a field from a condition. Because they mix *looks* with
*validation*, how far each one reaches is settled up front:

| Key | Effect | Server-side validation |
|---|---|---|
| `visibleWhen` | shown / hidden | **yes** (a hidden field is not validated) |
| `enabledWhen` | enabled / **disabled (greyed out)** | no |
| `readOnlyWhen` | read-only (**looks unchanged**) | no |
| `requiredWhen` | required / optional | **yes** |

```yaml
# a personal customer may not edit the member number (but should read it)
- { field: memberNo,  label: 会員番号, readOnlyWhen: { field: kind, value: personal } }
# the registration number is required for companies only
- { field: invoiceNo, label: 登録番号, requiredWhen: { field: kind, value: corp } }
```

**`enabledWhen` vs `readOnlyWhen`**: both stop editing, but a disabled input says
"not something you touch now" with its colour, while a read-only one still looks
like something to read. Use `readOnlyWhen` when the value matters to the reader.
`enabledWhen: { not: … }` expresses the same thing, but reading an inverted
condition adds a step, so the plain direction has its own key.

**A hidden field is not validated.** A field removed by `visibleWhen` (or living
in a section removed by `visibleWhen`) skips `required` and every other
validator, because requiring input nobody can give produces a form that cannot be
saved or fixed. Conversely a **visible** field's `required` still applies, so
"required once shown" is `visibleWhen` + `required: true`. `requiredWhen` is for
the other case: **visible, but required only sometimes**.

Hide a whole group with `section.visibleWhen` — heading included, and its fields
are not validated:

```yaml
sections:
  - title: 請求先
    visibleWhen: { field: kind, value: corp }
    fields:
      - { field: billingCode, label: 請求先コード, required: true }
```

`requiredWhen` runs off the same definition on the server (`FormValidator` in all
three editions). If the condition mentions `{ mode: … }`, pass the mode when you
validate (POST / PUT knows it). Without it a mode leaf is false, so **validation
errs on the lenient side**.

Note that a hidden field's leftover value is still **saved** — validation is
skipped, values are not cleared.

### Linked options (`optionsFrom` / `when` / `optionsSource`)

Prefecture → city, category → subcategory: **the parent's value narrows the
child's choices**. There are two ways to write it, and which one you want depends
on whether the choices fit in a definition.

```yaml
# 1. in the definition (a fixed, knowable set)
- { field: prefecture, label: 都道府県, type: select,
    options: [{ value: tokyo, label: 東京都 }, { value: osaka, label: 大阪府 }] }
- field: city
  label: 市区町村
  type: select
  optionsFrom: prefecture              # the parent field
  options:
    - { value: shibuya, label: 渋谷区, when: tokyo }   # offered for this parent value
    - { value: kita,    label: 北区,   when: osaka }
    - { value: other,   label: その他 }               # no `when` = always offered

# 2. from a repository (when the choices are data)
- field: city
  label: 市区町村
  type: select
  optionsFrom: prefecture
  optionsSource:
    repository: cityRepository   # registered by the application
    value: code                  # row field to store (default `code`)
    label: name                  # row field to show (default `name`)
    parentKey: prefecture        # row field holding the parent value; passed as a filter
    limit: 200
```

Settled behaviour:

- **While the parent is empty, options with a `when` are not offered** (the child
  stays empty until the parent is chosen). Options without a `when` always show,
  which is what "none" / "other" wants.
- Values compare the same loose way conditions do (`'1'` equals `1`).
- **When the parent changes and the child's value is no longer offered, it is
  cleared.** Losing the choice beats saving 渋谷区 under 大阪府.
- In form 2 nothing is fetched while the parent is empty (fetching everything
  would defeat the cascade). `parentKey` goes together with `optionsFrom`.
- Writing both `options` and `optionsSource` lets the fetched one win, and
  `hatake validate` warns about it.
- The framework knows no HTTP and no SQL: form 2 uses the same
  `Repository.search` a list screen uses.

**Search filters (`search.filters`) take the same keys with the same meaning.**
The only difference is what "the current values" are: whatever is typed into the
search area rather than a record — the narrowing itself is shared code. A range
filter (`operator: between`) holds two values, so it cannot be a parent.

### computed

A derived field, calculated from the record. `op` selects the calculation
(plugins may register more).

```yaml
computed: { op: concat, fields: [lastName, firstName], separator: " " }
computed: { op: sum, fields: [price, tax] }
```

| Built-in `op` | Meaning |
|---|---|
| `concat` | ① Joins `fields` with `separator` (default empty). |
| `sum` | ①② Numeric sum of `fields` (missing counts as 0), or the total of `of` over the rows. |
| `subtract` | ① `fields[0]` minus the sum of the rest. |
| `product` | ① Numeric product of `fields` (missing counts as 1). |
| `count` | ② Number of rows (`of` not needed). |
| `avg` | ② Average of `of` over the rows. |
| `min` / `max` | ② Smallest / largest `of` over the rows. |
| `join` | ② Lists `of` over the rows, separated by `separator` (default `", "`). Produces **text**, not a number. |

Two modes, chosen by which key is written: `fields` folds values of the **same record**
(①), while `field` + `of` folds the **rows of a subTable** (②, the vertical total).
Mode ② also takes `where`, which keeps only some of the rows.

```yaml
computed: { op: sum, fields: [subtotal, tax] }              # ①
computed: { op: sum, field: lines, of: amount }             # ②
computed: { op: count, field: lines }                       # ②
computed: { op: join, field: lines, of: item }              # ② text, not a number
computed: { op: sum, field: lines, of: amount,              # ② fold only some rows
            where: { field: cancelled, operator: notEquals, value: true } }
```

Mode ② borrows both the vocabulary and the implementation of the dashboard `aggregate`
(this framework has one aggregate, not two). `join` is not an aggregate — it produces text
— so it is implemented separately; it skips empty values so the separators do not pile up.
With no rows, `sum` and `count` are 0 while `avg` / `min` / `max` are **null** (an average
of 0 would read as "0 yen on average") and `join` is an empty string. Only rows saved with
the parent record can be folded: a subTable with `source` is paged, so its rows are not
all here (`validate` says so). If both `field` and `fields` are written, `field` wins.
Computed fields are derived once, in declaration order — put the subtotal before the tax
that uses it, or the tax is computed while the subtotal is still empty (`validate` says
so). When the dependencies get tangled, `hatake diagram <file> --computed` draws them as
one picture (Mermaid / DOT; an edge that runs against the declaration order is red).

`where` is the same condition language as `visibleWhen` (a leaf `{ field, operator, value }`
plus `all` / `any` / `not`) — this framework does not have two ways to write a condition —
but it is evaluated against **one row**, so `{ mode: create }` is never true there and an
unknown operator is false: both leave no rows at all (`validate` says so). With no rows
left, the value is the same as with no rows at all. On mode ① (`fields`) there are no rows
to filter, so `where` does nothing (`validate` says so).

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
| `compare` | `operator` / `field` (+ `aggregate` / `of`) | **Compares with another field** (below). |

`message` overrides the default (Japanese) message. To replace the defaults
wholesale — including for another locale — inject a `MessageResolver` into the
`ValidatorRegistry`.

### Cross-field validation (`compare`)

Rules a single field cannot express (「開始日 ≤ 終了日」, 「合計＝明細の和」) are written with
`compare`. It is the only built-in that reads **another field's value**; every other one sees
only its own.

```yaml
- field: endDate
  label: 終了日
  type: date
  validators:
    - { type: compare, operator: gte, field: startDate }   # at least 開始日

- field: total
  label: 合計
  type: number
  validators:
    # folds the child rows (subTable) into a number — 「合計＝明細の和」
    - { type: compare, operator: equals, field: lines, aggregate: sum, of: amount }
```

| Parameter | Meaning |
|---|---|
| `operator` | `equals` / `notEquals` / `gt` / `gte` / `lt` / `lte` (default `gte`) — only the ordered ones |
| `field` | The **field name** to compare with (in the same form). Required |
| `aggregate` | When the other side is a child table: how to fold it (`sum` / `avg` / `min` / `max` / `count` — the dashboard's aggregates) |
| `of` | The row field to fold (not needed for `count`) |

Decisions:

* Compared **as numbers when both read as numbers, as text otherwise**. An ISO date
  (`2026-01-05`) is zero-padded, so text order is date order — no date type is involved,
  because date parsing differs per language
* **Passes when it cannot judge**: this field empty is `required`'s job; the other field empty
  or absent is that field's own rules. It never fails silently in the other direction
* The message names the other field by its **label** (「開始日以上にしてください」), not by its
  field name
* Writing mistakes (a typo'd target, an operator with no order, a missing `of`) would pass
  **silently**, so `hatake validate` warns about them (`compare-unknown-field`,
  `compare-bad-operator`, `compare-aggregate-without-of`, `compare-with-itself`,
  `compare-without-field`)
* That all three editions answer the same is pinned by
  [`spec/conformance/cross_field_validation.json`](conformance/cross_field_validation.json) —
  the file is itself a runnable example

## action

| Key | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Stable id (referenced by `rowActions`). |
| `type` | string | ✅ | Action type (see [action types](#action-types)). |
| `label` | string | ✅ | Button label. |
| `scope` | string | | What it runs on. `page` (default) = the screen, `selection` = **the rows the user checked** (see [running over a selection](#running-over-a-selection-scope-selection)). |
| `plugin` | string | | Plugin key (when `type: plugin`). |
| `confirm` | [confirm](#confirm) | | Ask before running it. |
| `onSuccess` | [onSuccess](#onsuccess) | | What to do once it succeeded. |
| `onError` | [onError](#onerror) | | What the user is told when it failed. |
| `maxRows` | integer \| object | | For `scope: selection`: how many rows one press may act on (min 1). The object form (`{ default, byRole }`, where a limit may be `all`) caps per role — with several matching roles the **most permissive** wins. While more are picked the button is disabled. Omit and the real limit is the page size. The backend can read the same limit (`checkBulkLimit` / `BulkLimits.check`). |
| `prompt` | [prompt](#prompt) | | Asked before it runs (a small form). |
| `batchSize` | integer \| `{ default, byRole }` | | For `scope: selection`: how many rows to hand the handler per call (min 1). Absent = one call with all of them. With it the framework owns the loop, so **progress and an estimate are shown and the run can be stopped between batches** (see [batchSize](#batchsize)). Can be set per role. |
| `enabledWhen` | [condition](#condition) | | Whether it **can be pressed right now** (see [enabledWhen](#enabledwhen)). Where the action sits decides what is judged. |
| `config` | map | | Extra settings. |
| `roles` | string[] | | Roles allowed to run it (see [access control](#access-control-roles)). Empty = everyone. |

### batchSize

How many rows to hand the handler **per call**. Absent = every checked row in one call
(the bulk default).

```yaml
- id: approveSelected
  type: plugin
  plugin: approveOrders
  label: Approve
  scope: selection
  batchSize: 20
  onError:
    message: '{count} approved ({failed} failed, {skipped} never sent)'
```

**Progress and stopping only exist when there are batches.** Hand everything over in one
call and only the handler knows how far it got — the framework cannot show what it cannot
see. Once the framework owns the loop, progress, stopping and merging the per-batch reports
come for free.

- Progress is shown as a count ("12 / 100"), and the dialog has **no close button**: it
  ends either by finishing or by being stopped, so nothing keeps running behind a dialog
  the user dismissed.
- **Stopping only means "do not send the rest".** What was already sent has run, so the
  report counts "done" and "never sent" separately (`{skipped}`).
- **A failed batch stops the rest** — the same reason usually fails again, and failing 100
  rows with no way to stop is the worse outcome.
- **A stopped run is not a success**, so `onSuccess` does not run. When nothing failed and
  the run was merely stopped, the framework says so in its own words rather than borrowing
  `onError`.
- With one batch (picked rows ≤ `batchSize`) nothing changes and no dialog appears.
- A batch at or above `maxRows` would be a single batch, so `validate` says
  `batchsize-above-maxrows`.

**The estimate is only ever "about".** All it can be built from is what the run has
measured so far, so before the first batch finishes (or while less than a second has
passed) **nothing is said**. When it is said it is rounded **up**, to ten seconds
("about 30 seconds left" / "about 2 minutes left"): being made to wait past a promise is
worse than finishing early.

**Unfinished rows stay checked.** Whether the user stopped the run or a batch failed,
everything after the last finished batch is still selected — so **pressing again continues
where it stopped**, which is why a stopped run says "2 done (3 never sent — the rest is
still selected, press again to continue)". The rows of a failed batch count as unfinished
too, since the framework cannot know whether they ran; rows that did finish are never
re-selected (running the same row twice is an accident, not a retry).

**What is left over can leave the screen.** Re-selecting only helps here and now — a
re-query, a page change or closing the screen loses it, while a bulk failure or a stop is
usually followed by real work (hand it to someone, retry tomorrow). So the notification and
the failed-rows dialog offer **"CSV に出す"**, shown only when an `exportSink` is registered
(a button that does nothing is worse than no button).

- **One file**, not one per kind: what happens next is the same for both, so instead of
  splitting, a **reason column** says per row whether it failed (with the handler's reason)
  or was never run.
- The columns are the table's (**only the ones this user can see**, as with `type: export`)
  plus that reason.
- When a batch threw, the failures **named before it** are still in the file.

**The batch size can be written per role.** How much to push through at once depends on
where the user sits (a thin line at a branch office wants small batches, the head office
does not), so it takes the same shape as `maxRows`.

```yaml
    scope: selection
    batchSize:
      default: 20
      byRole: { branch: 5, admin: 100 }
```

| Key | Type | Default | Description |
|---|---|---|---|
| `default` | integer | (required) | Rows per call for anyone the roles do not name (min 1). |
| `byRole` | map<string, integer> | `{}` | Role -> rows per call. A role not named falls back to `default`. |

**With several matching roles the smallest one wins — the opposite of `maxRows`.** A limit
is about what someone is allowed to do, so roles widen it; a batch is about how much is
pushed through at once, so the safest number wins.

There is no `all` here: not splitting means no progress and no stopping, which is what
leaving `batchSize` out already says. A batch written for a role that cannot press the
button, or for a role name that appears nowhere in the definition, does nothing —
`validate` says `batchsize-unknown-role`.

### enabledWhen

Says "a shipped order cannot be rejected" **through the button's state**. The condition
language is the same as `visibleWhen` ([condition](#condition)).

```yaml
table:
  rowActions: [openEntry]
actions:
  - id: openEntry
    type: navigate
    label: Lines
    page: order_entry
    enabledWhen: { field: status, operator: notEquals, value: shipped }
```

**Where it sits decides what is judged.**

| Where | Record judged |
|---|---|
| A row action listed in `table.rowActions` | that row |
| `scope: selection` (bulk) | **every** checked row — one mismatch and the button is disabled |
| A button on a page being filled in (`form` / `wizard`) | **the values currently entered** (before saving; computed fields included) |
| A button on a read-only page (`detail`) | the record being shown |
| A button above a list (`search` / `crud` / `master` / `report` / `dashboard`) | **none** — `validate` reports `enabledwhen-without-record` |

- **Bulk needs all of them.** Nobody notices that only part of a selection ran, so a
  mismatch disables the button and the label says how many rows do not match (the same
  stance as `maxRows`).
- **A disabled button stays visible** — greyed out, with **what it depends on** shown
  (built from the condition; you do not write the wording). Hiding it would hide that the
  operation exists at all.
- **Not the same as `roles`**: roles decide whether it is visible, `enabledWhen` decides
  whether it can be pressed right now. Both may be written.
- **With nothing to judge the button stays enabled** — the tool does not gate on a
  condition it cannot evaluate.
- **On a page being filled in it changes without saving.** "A draft can be sent" is
  expressible because the button judges the **same** record the fields judge
  (`visibleWhen` / `computed`); a button that only reacts after a save looks broken while
  the user is looking at the value they just fixed.
- `{ mode: create }` / `{ mode: edit }` can be judged there too (a "Save draft" button that
  only works while creating). A read-only page has no form state, so a `mode` leaf is not
  satisfied.
- The field named in the disabled reason uses **that screen's label** ("状態", not
  `status`).

### confirm

Ask before running, declared instead of coded once per screen.

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `title` | string | | renderer's | Dialog heading. |
| `message` | string | ✅ | — | The question itself. |
| `okLabel` | string | | renderer's | Label of the button that runs it. |
| `cancelLabel` | string | | renderer's | Label of the button that does nothing. |
| `danger` | bool | | `false` | Style the confirming button as destructive. |

**A `type: delete` asks even without `confirm`** — it cannot be undone, so the safe default wins. Declaring `confirm` replaces the wording.

That declaration is read when its **id is `delete` (the built-in name) and `table.rowActions` lists `delete`**. A row-operation declaration never becomes a screen button (listing one would produce a button that does nothing when pressed, so the renderer leaves it out). Declarations that take effect nowhere are reported by `validate` (`row-declaration-unused`).

### onSuccess

Runs **only when the action succeeded**. That it does not run on failure is the point of declaring it rather than writing code after the call.

| Key | Type | Description |
|---|---|---|
| `message` | string | Shown briefly (a snackbar in Material). |
| `page` | string | Page id to move to afterwards. |
| `params` | map | Route params for `page` (`$row.id` / `$record.id` are interpolated). |

Failure covers an unregistered plugin handler, a missing export sink, or a repository that refuses. `create` / `edit` only open a form, so `onSuccess` does not apply — whether the save worked is not known at that point.

### prompt

**Asked before the action runs.** "Write the reason, then reject" is an everyday
business requirement; without this it needs a hand-written dialog in the
application — exactly the thing this framework exists to remove.

| Key | Type | Description |
|---|---|---|
| `fields` | [field](#field)[] (required, at least one) | What to ask. **Ordinary fields**: types, `required`, `validators`, `computed` and `normalize` behave as in a form. |
| `title` | string | Heading (defaults to the action's label). |
| `okLabel` | string | Confirming button (falls back to `confirm.okLabel`, then the label). |
| `cancelLabel` | string | Cancelling button (falls back to `confirm.cancelLabel`). |

```yaml
- id: rejectSelected
  type: plugin
  plugin: rejectOrders
  label: Reject
  scope: selection
  confirm: { message: Rejecting cannot be undone., danger: true }
  prompt:
    title: Reason for rejection
    okLabel: Reject
    fields:
      - { field: reason, label: Reason, type: textarea, required: true }
      - { field: rejectedOn, label: Rejected on, type: date }
```

| Decision | Why |
|---|---|
| It **replaces** the confirmation dialog | If there is something to ask, that OK *is* the confirmation. Two dialogs in a row only teach people to click without reading; the `confirm` wording, labels and `danger` styling are carried by this one |
| The fields are **ordinary `field`s** | The input vocabulary is not duplicated: `required`, `validators`, `computed` and `normalize` are the same ones the forms use |
| **Nothing runs until it validates** | Validation happens inside the dialog and it stays open until it passes (closing it would take away the place to fix the value) |
| Values pass through the **same normalization as a save** | Full-width digits do not reach the business logic |
| Only `type: plugin` can receive it | The values arrive as `ActionContext.input`; other types have nowhere to put them, so `validate` reports it |
| A bulk action **asks once** | One reason for the selected rows is the shape the business wants; being asked per row would make it unusable |

### onError

**What the user is told when it failed.** Without it the reason is shown as reported (`RepositoryHttpException: … 500 …`) — true, but not the language of the business, and the same failure means different things per screen.

| Key | Type | Description |
|---|---|---|
| `message` | string (required) | Shown instead of the raw reason. |

**`onError` cannot move the screen** (there is no `page`). `onSuccess` can; this deliberately cannot, because leaving the screen that failed hides what happened and takes the row that needs fixing out of sight.

Placeholders are filled only when known; an unfilled one **stays as text**, and `validate` says so first (`placeholder-not-filled`):

| Placeholder | What goes in |
|---|---|
| `{error}` | the reason as reported |
| `{count}` | rows that succeeded (`scope: selection` only) |
| `{failed}` | rows that failed (same) |
| `{total}` | rows in the run (same) |

**Before it runs** — `confirm.title`, `confirm.message` and `prompt.title` — `{count}` is
the number of rows the user picked (`scope: selection` only). Nothing has happened yet, so
`{failed}` / `{total}` / `{error}` do not fill there (`validate` says so).

```yaml
  confirm: { message: 'Approve {count} orders?' }   # before → rows picked
  onSuccess: { message: 'Approved {count}' }        # after  → rows that succeeded
```

The button itself already shows the count ("Approve (3)"). Writing it in the confirmation
too matters because **that sentence is the last thing read** before it happens (`advise`
reports `bulk-confirm-without-count`).

```yaml
- id: approveSelected
  type: plugin
  plugin: approveOrders
  label: Approve selected
  scope: selection
  onSuccess: { message: 'Approved {count}' }
  onError: { message: 'Approved {count}; {failed} were already shipped' }
```

**A partial result is a failure for this purpose**: `onSuccess` does not run while even one row is left behind. The counts come from the handler (see below).

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
`equals`, `notEquals`, `contains`, `startsWith`, `endsWith`, `gt`, `gte`, `lt`,
`lte`, `between`, `in`

`isEmpty` / `isNotEmpty` take no value, so they belong to
[conditions](#condition) only; conversely `between` / `startsWith` / `endsWith`
are search-only.

### Column types
`text`, `number`, `badge`, `boolean`, `date`, `dateTime`

### Action types
`create`, `edit`, `delete`, `navigate`, `plugin`, `export` (→ [export](#export-csv)),
`print` (→ [print](#print-on-paper))

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

## Machine-readable reference

This document is prose. To look up *what may be written here*, use
[`reference.json`](reference.json) — generated from the JSON Schema, so it cannot
drift from the spec (CI fails if it does).

```bash
npx hatake reference                      # everything, as JSON
npx hatake reference rowsPerPage          # by key name: which nodes take it, type, default
npx hatake reference report               # node name / page kind too (every match)
npx hatake reference --page-kind report   # only what that page kind can reach
```

| Field | Contents |
|---|---|
| `pageKinds` | page kind (`crud` …) → node name + required keys |
| `nodes` | per node (`table` / `column` …): description, keys, **which page kinds reach it**, parents |
| `nodes.*.keys[]` | `key` / `type` / `required` / `default` / `values` / `open` / `minimum` / `nodes` |
| `keyIndex` | key name → nodes that accept it ("where does this key go?") |

`open: true` means `values` lists the *built-ins* and a registry can add more;
`open: false` is an enum. A node with `closed: false` is a free-form container
(`config` / `validators` / `computed` / `visibleWhen`), which strict parsing also
leaves alone.

## Structural warnings

Strict parsing catches unknown keys and the schema checks types and required
fields — yet a definition can pass both and still not do what it says. Those are
reported as warnings.

```bash
npx hatake validate page.yaml                    # warnings are shown by default
npx hatake validate page.yaml --warn-as-error    # fail CI on them
npx hatake validate page.yaml --no-warn --json
```

| Rule | What happens |
|---|---|
| `rowaction-not-declared` | a `rowActions` id with no matching `actions` entry — the button silently never appears (only `edit` / `delete` are built in) |
| `rowactions-as-objects` | a `rowActions` element that is not a string — not treated as a row action |
| `unknown-page` | `navigate` / `onSuccess.page` / a menu target missing from `pages` — nothing happens on tap |
| `unknown-home` | `app.home` matches no menu item or page — the first page opens instead |
| `unknown-action` | a dashboard card pointing at an action that does not exist |
| `duplicate-page-id` / `duplicate-action-id` / `duplicate-field` | duplicated ids or field names — the later one hides the earlier |
| `condition-operator-unsupported` | an operator a condition does not understand (e.g. `between`) — evaluates to false forever, so the field never shows |
| `aggregate-without-field` | anything but `count` without a `field` — the result is null |
| `groupby-without-sort` | no print order declared — the group splits and its subtotal repeats |
| `total-without-column` | a total on a field with no column — it is printed nowhere |
| `required-as-validator-only` | a `validators` element that is not an object — no validation is added |
| `requiredwhen-with-required` / `readonlywhen-with-readonly` | an unconditional flag next to its conditional twin — the condition cannot matter |
| `option-when-without-optionsfrom` / `optionsfrom-unknown-field` / `optionssource-parentkey-without-optionsfrom` / `options-and-optionssource` | linked options that do not line up (input fields and search filters alike) |
| `compare-unknown-field` / `compare-without-field` / `compare-with-itself` / `compare-bad-operator` / `compare-aggregate-without-of` | a mistake in a cross-field rule (`compare`) — **that rule passes silently** |
| `page-nobody-can-open` | the `roles` on the ways in (menu items, navigate buttons) disagree — **nobody can open that screen** |
| `prompt-unsupported-type` | a `prompt` on a type that cannot receive the values (anything but `plugin`) — the input is **collected and thrown away** |
| `compare-where-unknown-field` | a row filter on a `compare` validator names a row field that does not exist and **looks like a typo** — the condition never matches |
| `compare-where-ignored` | `where` without `aggregate` — there are no rows to filter |
| `compare-where-mode` | `{ mode: … }` inside a `compare` row filter — a row has no form mode, so no rows are folded |
| `computed-where-unknown-field` | a row filter (`computed.where`) names a row field that does not exist and **looks like a typo** — the condition never matches, so no rows are folded |
| `computed-where-ignored` | `where` on mode ① (`fields`) — there are no rows to filter |
| `computed-where-mode` | `{ mode: … }` inside `where` — a row has no form mode, so it is always false and no rows are folded |
| `computed-order` | a computed field uses a computed field **written after it** — computed fields are derived once, in declaration order, so it is computed while the other is still empty |
| `computed-self-reference` | a computed field uses itself — it always folds the previous value (empty at first) |
| `computed-of-unknown-field` | a row-folding `computed` (`field` / `of`) points at a missing field, a field that is not a subTable, or a value the rows do not have — nothing to fold, so the field shows empty or 0 |
| `computed-of-paged-subtable` | folding a `source`-backed (paged) subTable — the rows are not all here, so the result is 0 |
| `computed-rows-unsupported-op` | an `op` that cannot fold rows was given a `field`, or a row-folding op (`count`/`avg`/`min`/`max`) has no `field` — nothing is computed |
| `computed-aggregate-without-of` | a row-folding `computed` without `of` (except `count`) — nothing says what to fold, so the field shows empty |
| `computed-field-and-fields` | both `field` and `fields` are written — `field` wins and `fields` does nothing |
| `create-action-unusable` | `type: create` on a page other than `crud` / `master` — the button appears but **nothing happens when pressed** (`create` opens the new-record form of a list; `form` / `wizard` already have a save button) |
| `export-without-rows` | `type: export` on a page with **no table** (`form` / `wizard` / `dashboard` / `detail`) — there are no rows to write, so pressing it produces nothing |
| `plugin-without-name` | `type: plugin` without `plugin:` — there is nobody to call, so nothing happens when pressed |
| `navigate-to-self` | a `type: navigate` whose target is the page itself — it only opens another copy of the same screen, which reads as "nothing happened" |
| `row-declaration-unused` | a row-operation declaration (`type: edit` / `type: delete`) that **takes effect nowhere** — a page with no rows to edit/delete, a name missing from `table.rowActions`, or an id that is not the built-in name (`edit` / `delete`) |
| `builtin-rowaction-unsupported` | a built-in row action (`edit` / `delete`) in `table.rowActions` of a page other than `crud` / `master` — nothing appears in the row (a `search` page's `rowActions` point at the ids of the page's own actions) |
| `enabledwhen-without-record` | `enabledWhen` written where **there is no record to judge** (a button above a list) — the button appears and can be pressed, so the gating silently does nothing |
| `batchsize-without-selection` | `batchSize` on an action that is **not** a bulk one — there is nothing to split, so nothing happens |
| `batchsize-above-maxrows` | a batch at or above the per-press limit (`maxRows`) — it would be a single batch, so **no progress and no stopping** (per-role batches are compared with that role's limit) |
| `batchsize-unknown-role` | `batchSize.byRole` names a role that cannot press the button, or one that appears nowhere in the definition — that batch size does nothing |
| `placeholder-not-filled` | a message with a placeholder that cannot be filled (counts exist only for `scope: selection`, `{error}` only on failure, **before it runs only `{count}` fills** — there is no failure and no reason yet — and **any other name, a field like `{orderNo}`, has nothing to fill it**) — it stays as literal text and you find out by pressing the button |
| `maxrows-unknown-role` | a role in `byRole` cannot use the button (not in `roles`) or appears nowhere in the definition — nothing matches it, so that limit never applies |
| `maxrows-without-selection` | `maxRows` on an action that is not `scope: selection` — there is nothing to count, so the limit does nothing |
| `maxrows-above-page-size` | `maxRows` is larger than the page size — only the rows on screen can be picked, so the limit can never bind |
| `selection-without-table` | a `scope: selection` button on a page with **no table** — there is no way to choose rows, so the button stays unpressable |
| `selection-unsupported-type` | `scope: selection` on a type other than `plugin` — pressing it does nothing (what a bulk operation *does* is business logic, so it belongs to the application) |
| `print-without-report` | a `type: print` button on a page with **no `report`** — there is no paper to print, so the button appears and pressing it only reports that this page cannot print |
| `columns-wider-than-paper` / `rows-per-page-too-many` | the report does not fit its paper (declared column widths exceed the sheet, or a sheet holds so many rows that a line has no readable height) — the printer shrinks everything instead of failing, so you get an unreadable sheet rather than an error. Paper sizes live in [`spec/papers.json`](papers.json) |

These are **not errors** (some of these shapes can be made to work by a
repository or a registered plugin). Navigation targets are only checked for `app:`
documents, since a single page does not know the others. Warnings that map onto a
[pitfall](pitfalls.json) carry its id, so `hatake pitfalls <id>` shows the correct
form. **Every shipped example and the demo produce zero warnings**, which CI
enforces.

### Names the definition expects from outside

The rules above stay **inside** the definition. One layer out, `repository:
orderRepository` only works if the application registered a repository under that
name — otherwise the screen renders and no data arrives. The same goes for
`format`, `plugin` and custom field types: a name that does not match fails
silently.

Neither strict parsing nor the schema can see this, because **neither knows what
is registered**. So it is split in two:

```bash
npx hatake refs page.yaml --needs-registration    # list what the definition demands
npx hatake registry lib/main.dart --out reg.json  # read what the application registers
npx hatake validate page.yaml --registry reg.json # compare the two
```

`refs` lists without judging; `validate` compares **only the categories you
pass** (pass nothing and the check is exactly as before). Built-in names are added
automatically, so the list only needs what you registered yourself.

The place where those registrations are written can be **drafted**:

```bash
npx hatake wire app.yaml --base /api --out lib/wiring.dart
```

It emits a Dart `HatakeScope` listing every registration the definition demands
(repositories, plugins, sinks, and any custom validator / converter / formatter /
computed op / aggregate / field type / card type). **The bodies stay TODO** — what
they do is business, how they connect is environment — and until they are filled
they throw `UnimplementedError`, so no "silently does nothing" stub is left
behind. With `--base` the repositories come from
[`hatake_http`](../flutter/packages/hatake_http/) instead, so that part is not a
TODO (collection names are **guessed** as plurals).

The output is emitted so that it **compiles**. Two drafts are committed under
`flutter/packages/hatake_example/tool/` and run through `flutter analyze`, so a
broken generator fails analysis.

| Rule | What happens |
|---|---|
| `unknown-repository` | the screen renders, no data arrives |
| `unknown-plugin` | the button appears, tapping it does nothing |
| `unregistered-sink` | no sink for the output (`exportSink` for CSV, `printSink` for printing) — the button appears and says "not registered" when pressed |
| `unknown-validator` / `unknown-converter` | that validation / normalization is **silently skipped** |
| `unknown-formatter` | the raw value is shown unformatted |
| `unknown-computed-op` / `unknown-aggregate` | nothing is computed; the value stays empty |
| `unknown-field-type` / `unknown-column-type` / `unknown-action-type` / `unknown-dashboard-item-type` / `unknown-chart-kind` | neither built in nor registered — not handled as that type |
| `unknown-page-ref` | a single-page definition cannot resolve its navigation target (`unknown-page` covers `app:`) |
| `role-not-in-app` | a role name in the definition is **not among the roles the application hands out** — whatever it gates is **visible to nobody** (and a per-role count written for it applies to nobody) |

The list passed to `--registry` has the same shape `refs --needs-registration
--json` prints:

```json
{ "repositories": ["orderRepository"], "plugins": ["csvExport"], "roles": ["manager"] }
```

`roles` is the **vocabulary of roles the application can hand out**
(`HatakeScope(knownRoles:)`) — names only, unlike the other kinds, which map a name
to an implementation. Crucially it is **not** the roles currently handed out
(`HatakeScope(roles:)`): those are login state, so a snapshot taken while signed in
as staff would claim that `manager` does not exist in the application.

A role is **not something to delete**, so it is left out of the reverse comparison
(`refs --unused`): the definition not using it says nothing about the application's
authorization. Conversely, a role the application declares **counts as part of the
definition's vocabulary**, so a role written only under `maxRows.byRole` is not
reported as matching nobody.

Omit `--registry` and a `hatake-registry.json` next to the definition (or in the
current directory) is picked up silently. A name referenced from many places is
reported **once**, with the count — the fix is one registration either way.

The list does not have to be written by hand. There are two ways to produce it, and
**both emit the same shape**:

| Source | When | Limit |
|---|---|---|
| `hatake registry <path...>` — read the code | no need to run the app; regenerate in CI and diff | reads **only the strings written at the registration site** |
| `registrySnapshot(scope)` — ask the running app | registrations built dynamically | the app has to run |

Declaring the role vocabulary also buys one thing on screen: **a role handed out
that is not in the vocabulary is caught during development** (`assert`). An
application-side typo (`manger` for `manager`) cannot be spotted by looking at the
screen, since not being visible is what the feature does.

```dart
HatakeScope(
  knownRoles: const {'staff', 'manager'},   // what this app can ever hand out
  roles: session.roles,                     // who is looking right now
  ...
)
```

The first carries no language parser, so a registry built from a variable or a
function cannot be read. Those are **reported rather than dropped, and the command
exits 1**: dropping them would produce a "registered but reported missing" warning,
which discredits the whole check. What it cannot read, the second one covers.

```dart
File('hatake-registry.json').writeAsStringSync(registrySnapshotJson(scope));
```

Both emit **only what the application added** (built-ins are known to the checker;
mixing them in bloats the list and dates it every time a built-in is added). An empty
kind is omitted — that means "nothing to say", not "this kind is empty", so it stays
out of the comparison.

`spec/conformance/registry_snapshot.json` pins that the two routes share one
vocabulary and one shape, checked from both editions.

## Common mistakes

Strict parsing catches misspellings, but neither **writing a key in the wrong
place** (`columns` directly on the page, `fields` directly under `form`) nor
**what parses yet does not mean what you wanted** (`groupBy` without `sort`, a
`metric` that counts instead of summing) can be fixed from a key name alone.
Those live in [`pitfalls.json`](pitfalls.json), in Japanese and English.

```bash
npx hatake pitfalls groupBy --lang en   # wrong form → why → correct form
npx hatake validate page.yaml           # unknown keys pull the matching fix in automatically
```

Every entry is verified in CI: the wrong form really fails strict parsing and the
correct form really passes, so the table cannot lie.

## Real failures

The table above is a curated set of mistakes **a human thought of**, which is not
the same as where an agent actually trips. Observed incidents live separately in
[`failures.json`](failures.json).

```bash
npx hatake failures unknown-repository   # what was written → what the tools said → the fix
```

What sets it apart is provenance, plus a field the pitfalls table has no room for:
**why someone writes it that way**. Every entry is replayed through the real tools
in CI and must match the recorded diagnosis — so this table cannot lie either, and
a regression in diagnostic quality (no longer detected, message changed) fails the
build.

Entries **the tools cannot catch are included too** (an empty diagnosis). Leaving
them out would imply the tooling is complete; instead they carry a note on what a
reviewer should look for.

A hand-written catalogue does not grow, so candidates can be harvested from a corpus
of definitions instead.

```bash
npx hatake harvest definitions/          # diagnoses that keep coming back, as candidates
```

Candidates are printed **with the human-written fields left empty** — "why someone
writes it that way" cannot be derived by a machine, and that field is the point of the
catalogue. Nothing is ever appended to `failures.json` automatically. The definitions
themselves are not carried out of the scan (file, path and counts only), and diagnoses
already in the catalogue are counted rather than proposed again.

`--repro` additionally drafts a **minimal reproduction**: the offending definition
shrunk for as long as the target diagnosis keeps firing and no new one appears. Free
text (`label` / `title` / `description`) is replaced with symbols afterwards, while
identifiers stay — so this form does carry definition text, and is off by default.

## Repairing what is uniquely repairable

```bash
npx hatake fix page.yaml            # prints by default; --write overwrites
```

Two kinds of repair only: **misspellings** (key names, repository / plugin / type names, page ids,
action ids, the parent of linked options) and **specifications whose value is determined** (adding
`report.sort` to a report that has subtotals). Nothing is changed unless the nearest name is
unique — two equally close candidates means a human decides. With a registry, abbreviated names
(`orderRepo` for `orderRepository`) are restored too.

The guard is the *diagnosis*: each repair is applied on its own and kept only if the number of
problems goes down and **no new problem appears**; the final text is re-read and checked the same
way, and nothing is written if that fails. Duplicated fields, an aggregate with no field and an
operator a condition cannot understand are left alone — with the reason printed, never silently.

## Suggesting what is worth adding

```bash
npx hatake advise page.yaml
```

Reports a list with no sortable column, a list with no filters, a key that is not in the list, a
form with nothing required, a delete/export/bulk button with no roles, **a bulk action with no
confirmation**, **a bulk action that moves 100 rows per press with no `batchSize`**, a
money-looking column with no formatting, a child table with no parent key, and a report with no
totals.

This is **advice, not a warning**, so it never changes the exit code: a warning states a fact
("you wrote it and it does not work"), advice states a preference ("not writing this may hurt").
Mixing the two would cost the warnings their credibility. That every suggested key really is
writable at that place is checked in CI against the schema-derived reference.

The ruler can be supplied from outside (`--rules team.json`; see
[`docs/guide/advise-rules.example.json`](../docs/guide/advise-rules.example.json)). Advice is a
preference, so it differs per company and per project — a fixed table alone ends as "does not match
ours, so we do not use it". Only three things are writable:

* `off` — silence a rule that does not fit
* `options` — the knobs a built-in rule actually has (column thresholds, the words that look like
  money, and so on)
* `require` — a project decision, in the form "**this place must carry this key**" (`page`,
  `column`, `filter`, `field`, `action`; `when` narrows by value, `every: true` demands it
  everywhere)

It is deliberately **not a language for writing rules**: allowing expressions would turn the
configuration into a small program. An unknown key or an unknown rule name is an error — a setting
that silently does nothing is the worst outcome.

`explain --review` prints the explanation (including what the screen cannot do) and the advice as
**one sheet**: a reviewer reads one sheet, and output split across tools gets half-read. Even on one
sheet, advice stays advice and the exit code does not move.

## The words used to explain a definition

The phrasing `explain` uses (how a formatter looks, how a condition reads, what a page kind is)
lives in [`vocabulary.json`](vocabulary.json); every edition transcribes it. Keeping the words
inside one implementation would mean maintaining them twice as soon as another edition — or an
English rendering — wants to explain a definition.

`{value}` marks a substitution point. Both `ja` and `en` are carried; only the Japanese is
rendered today (an English `explain` is built from the other column). CI checks three things: the
TypeScript table matches the `ja` column exactly, every built-in value in `reference.json` has a
word, and no word is left for a value the DSL no longer has.

## An index of screens

```bash
npx hatake index definitions/ --find "customer search"
```

Collects the one-line summaries (`explain --brief`) into a table that answers "which screen is
where". The searchable words include both what users see (labels) and what implementers write
(field names, repository keys). `--find` is an AND of terms, `--by size` orders by size, and
`--json` / `--out` produce the machine-readable form. An `app:` contributes one row per page.

**Every edition has the index** (`ScreenIndex`). It is needed wherever the pile of definitions
lives, so a CLI-only index cannot answer "which of my screens does this?" from inside an app:

| Edition | Entry point |
|---|---|
| TypeScript | `npx hatake index <path...>` / `buildIndex` |
| Dart | `ScreenIndex.ofApp(app)` (parsed) / `buildScreenIndex([IndexInput(...)])` (from text) |
| Java | `ScreenIndex.build(List.of(new ScreenIndex.Source(file, text)))` |

The heading word per page kind comes from `pageKinds[].short` in
[`vocabulary.json`](vocabulary.json); all three editions transcribe it and each edition's tests
check the transcription. The same pile of definitions therefore yields **the same count** in every
edition. The one difference: the backend edition has no buttons (`actions`), so its summaries omit
them and buttons are not searchable there.

## Screens and navigation as a picture

```bash
npx hatake diagram app.yaml --out app.svg
```

Derives a picture (SVG) of screens, menu and navigation from an `app:` definition. Rows are
layers: screens reachable from the menu, then screens reached by `navigate` from those, and so
on — which makes **screens nothing can open** fall out on their own. A single page is not drawn
(`explain` reads better). Passing a diagram source (a JSON with `rows`) draws that instead, so the
hand-written figures in [`docs/diagrams/`](../docs/diagrams/) and this command share one renderer.

Navigation between layers is drawn **one line per transition** (summarising them into a single
arrow hides whether A or B opens the screen). Lines can only join adjacent rows, so within a layer
the screens that lead to the next layer are placed last. Any transition that still cannot be drawn
(within a layer, a way back, rows too far apart) is **listed in prose** — a transition missing from
the picture would read as "there is no transition". See
[the sales app's flow](../docs/diagrams/sales-app-flow.svg).

**Roles are overlaid too.** A page cannot carry `roles` — only menu items and buttons can (plus
columns, fields and cards) — so "who can see this screen" is only answerable by **following the way
in**. The picture counts that and writes it inside each box, colouring the two things a
screen-by-screen read never surfaces:

* **red border** — anyone can open it, and it can delete or export (on its own the button just looks
  like one without `roles`; what makes it a problem is that *anyone can get there*)
* **dashed** — **nobody can open it**: the ways in disagree about roles. The definition parses, and
  looking at the screen tells you nothing

`--role admin` narrows the picture to **the paths that role can walk** (doors it cannot pass stay,
drawn faintly). An unknown role name is an error — silently accepting a typo would read as "opens
everything". A group's `roles` apply to its children. See
[the roles picture](../docs/diagrams/roles-app-flow.svg) and
[what admin can walk](../docs/diagrams/roles-app-admin.svg).

## Shrinking a definition without changing it

Generated definitions get verbose (a default written out, an empty list left behind).

```bash
npx hatake minimize page.yaml > short.yaml   # what was dropped goes to stderr
```

Only two kinds of specification are candidates: a value **equal to the schema default**,
and an **empty list or object**. Required keys and `dsl_version` are never dropped. Every
single removal is followed by a check that **the parsed model is byte-identical**, and is
undone otherwise — so if a parser default ever disagreed with the schema, the tool stops
dropping rather than changing behaviour. The output is produced by cutting only the
dropped spans out of the original text, so comments, wrapping and line endings survive. A
definition with a typo is never minimized (this must not become a tool that silently
deletes unknown keys).

## Explaining a definition in prose

Strict parsing, the schema and the warnings all look at spelling and structure only.
A condition pointing the wrong way, or the wrong field made required, passes all of
them — so the last check is a human reading it. That is what `explain` prints.

```bash
npx hatake explain page.yaml               # what this screen does (Japanese)
npx hatake explain app.yaml --page <id>    # one page of an app, in detail
npx hatake explain page.yaml --brief       # one line (a table of screens for an app)
npx hatake explain --diff old.yaml new.yaml # what changed, in the screen's own words
```

It describes the screen, **never naming DSL keys** — the reader does not need to know
the DSL. Conditions are rendered with field and option labels, so
`{ field: kind, value: corp }` reads as 「区分 が 法人 のとき」. It also states what the
screen *cannot* do, read off the definition (no delete button, read-only kind, …).

`--brief` is the one-line form, for a README, a PR body or a screen inventory.
`--diff` restates a change the way a reviewer reads it (「枠「請求先」は、区分 が 法人 の
ときだけ出るようになりました」). It compares the two *explanations*, so changes no diff rule
was written for (defaults, the "cannot do" list) come along for free. It makes **no
compatibility judgement** — that is `diff` — so it never changes the exit code.

The output is JA-only, like the warnings: it is prose about a business screen.

## Complete example

An index by task lives in [`examples/README.md`](examples/README.md) (machine
readable: [`examples/index.json`](examples/index.json); from the CLI:
`npx hatake examples <what you want to do>`).

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

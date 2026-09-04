# hatake AI cheat sheet

A compressed reference for writing hatake definitions — **you do not need to read the implementation (`src/`)**. You write a definition (YAML/JSON) and refer to formatters, validators and the like *by name*.

Japanese is the primary language of this project; this sheet is the English condensate. When in doubt, look things up rather than guess:

```bash
npx hatake reference <key>      # type, default, allowed values, where it may be written
npx hatake examples <task>      # nearest example to copy
npx hatake pitfalls <key>       # common mistake → correct form
npx hatake validate page.yaml   # exit code 1 if anything is wrong
npx hatake refs page.yaml --needs-registration   # what the application must register
npx hatake diff old.yaml new.yaml                # what a change breaks / what to confirm
npx hatake explain page.yaml --lang en                       # read the definition back in English
npx hatake diagram app.yaml --format mermaid                 # the screen map, pasteable into a PR (or --format dot)
npx hatake diagram page.yaml --computed                      # which field comes from which (red = declared out of order)
```

After a bulk run, **what is left over can leave the screen**: the notification and the
failed-rows dialog offer "CSV に出す" when an `exportSink` is registered — one file, with a
**reason column** saying per row whether it failed (the handler's reason) or was never run.
Re-selecting only helps while you stay on the screen; this is what you hand to someone or
retry tomorrow.

A bulk action may say **how many rows per call**: `batchSize: 20` (or
`{ default: 20, byRole: { branch: 5 } }` — with several matching roles the **smallest**
wins, the opposite of `maxRows`). The framework then owns the loop, so it shows progress
("12 / 100") and a rounded-up estimate ("about 30 seconds left", withheld until a batch has
finished), and can be **stopped between batches** — stopping only means "do not send the
rest", so what was sent has run and the report counts it separately (`{skipped}`). A
stopped run is not a success, so `onSuccess` does not run, and the **unfinished rows stay
checked** so pressing again continues where it stopped.

An app may say **how screens open**: `app.navigation` (`single`, the default, swaps the
screen; `tabs` opens them side by side). The application may override it
(`HatakeApp(navigation:)`), so one definition can be tabs on a desktop and single on a
tablet. With tabs the same screen is never opened twice (different `params` are a different
screen), the cap is 10 and going over it **says so instead of opening**, the last tab cannot
be closed, closing a screen that takes input asks first, and the URL carries **only the
front tab**. A navigate action opens in a tab of its own only where the definition says
`open: tab` (default `same`).

An action may say **when it can be pressed**: `enabledWhen` (the `visibleWhen` condition
language). Where it sits decides what is judged — a row action judges its row, `scope:
selection` needs **every** checked row to match, a page being filled in (`form` / `wizard`)
judges **the values currently entered** (before saving, computed fields and
`{ mode: create }` included), and a read-only page (`detail`) judges the record it shows. A
button above a list has nothing to judge (`validate` says `enabledwhen-without-record`). A
disabled button stays visible, greyed out, with what it depends on shown — named with that
screen's label.

```bash
npx hatake wire app.yaml --merge lib/wiring.dart --write     # add only the missing registrations (keeps your code)
npx hatake wire app.yaml --merge lib/wiring.dart --write --todo   # ...and hand the added stubs over as a work list
npx hatake refs app.yaml --filled --source lib/             # are those registrations actually filled in? (TODO / missing / cannot tell)
npx hatake probe app.yaml --base http://localhost:8080/api   # does the server answer what the definition declares?
npx hatake attack app.yaml --role staff --base http://localhost:8080/api  # does the API refuse what the screen hides?
npx hatake attack app.yaml --all-roles --accounts accounts.json --base …   # every role + nobody, in one table (one credential per role)
npx hatake attack app.yaml --all-roles --login login.json --base … --since last.json --save last.json --fail-on new   # nightly: only what changed
```

`probe` and `attack` are **read-only** (they never send `POST` / `PUT` / `DELETE`); pass
`--dry-run` to print the requests instead of sending them.

To run them unattended, `--login login.json` fetches the credentials itself (one round trip
per role; secrets come from `${ENVIRONMENT_VARIABLES}`, never from the file, and the token is
never printed) and `--since last.json` prints **only what changed** since the previous run
(`--save` writes the run for next time; `--fail-on new` fails only on what is new). If a role
that was probed before was **not** probed this time (expired credentials), its holes are
reported as "we did not look" rather than "fixed", and `--fail-on new` still fails.

**Buttons that do nothing when pressed are reported before you press them** — the worst way
to fall in this framework (the definition parses, the button shows, and you only find out by
pressing): `create` on a page with no list (`create-action-unusable`), `export` with no table
(`export-without-rows`), `print` with no `report` (`print-without-report`), `plugin` with no
`plugin:` (`plugin-without-name`), `navigate` whose target is the page itself
(`navigate-to-self`), `edit` / `delete` outside a row (`row-declaration-unused`), and a
built-in row action outside `crud` / `master` (`builtin-rowaction-unsupported`). Each verdict
needs one page only, so it runs in CI.

`refs` lists the names the definition expects from outside (repositories, plugins, custom
formatters). Pass that list to `validate --registry <file>` and a mismatched name is
reported instead of failing silently at runtime.

- Full spec: [DSL specification](../spec/dsl-spec.md) · machine-checkable: [JSON Schema](../spec/hatake-page.schema.json)
- Machine-readable index of every key: [`spec/reference.json`](../spec/reference.json)
- Examples by task: [`spec/examples/`](../spec/examples/README.md) · common mistakes: [`spec/pitfalls.json`](../spec/pitfalls.json)
- For agents: an [MCP server](guide/mcp.ja.md) exposes all of the above as tools (guide is in Japanese; tool descriptions are too).

## The smallest thing that works

```yaml
dsl_version: "1.0"
page:
  type: crud                 # crud | search | master | detail | form | wizard | dashboard | report
  id: customer_master
  title: Customers
  repository: customerRepository   # resolved to the Repository *you* implement
  key: id
  search:
    filters:
      - { field: name, label: Name, type: text, operator: contains }
  table:
    rowActions: [edit, delete]
    columns:
      - { field: code, label: Code, sortable: true }
      - { field: amount, label: Amount, format: currency, config: { symbol: "¥" } }
  form:
    sections:
      - title: Basics
        fields:
          - { field: code, label: Code, type: text, required: true,
              normalize: [toHankaku, trim], validators: [ { type: maxLength, value: 20 } ] }
          - { field: name, label: Name, type: text, required: true }
  actions:
    - { id: create, type: create, label: New }
```

**Unknown keys are dropped silently** by default, so a misspelled optional key (`readonly`, `pagesize`, `visible_when`) does nothing at all. Always parse in strict mode while authoring and in CI — it reports every unknown key at once, with the nearest known key.

```dart
parsePageYaml(source, strict: true);              // Dart
```
```ts
parsePageYaml(source, { strict: true });          // TypeScript
```
```java
DefinitionParser.parsePageYaml(source, true);     // Java
```

## Page kinds (`page.type`)

| type | What it is | Form |
|---|---|---|
| `crud` | search + list + create/update/delete | yes |
| `search` | read-only list (照会) | no |
| `master` | master maintenance (same shape as crud) | yes |
| `detail` | one record, read-only | display only |
| `form` | standalone create/edit | yes |
| `wizard` | stepped input (`steps`; validated per step, persisted once) | yes |
| `dashboard` | grid of cards (`items`; each is a small read query + how to show it) | no |
| `report` | the printable counterpart of a list (`report` adds paper, groups, totals) | no |

A page addresses one repository. Several pages are bundled into an application by using `app:` instead of `page:` at the root.
On the web the URL follows the current screen (`/<pageId>?<params>`, on by default), so a screen can be linked, reloaded and
reached with the browser's back button; pass `HatakeApp(syncUrl: false)` when an outer router owns the address bar. URL params
come back as **strings** (a URL has no types, and `0012` is a customer code, not 12), and a page id this app does not have is
left alone rather than opening a blank screen.

```yaml
app:
  id: sales_admin
  title: Sales
  home: customers                        # initial route (a menu item id)
  menu:
    - { id: customers, label: Customers, icon: people, page: customer_master }
    - group: Masters                     # a node with `items` is a group
      roles: [admin]
      items: [ { label: Products, page: product_master } ]
  pages: [ { type: crud, id: customer_master, ... } ]
```

Navigation is an action: `{ type: navigate, page: <id>, params: { id: "$row.id" } }` (`$row.id` / `$record.id` interpolate the current row / record).

### Look and feel (`app.theme`)

Brand colour, brightness, density and shape, declared once. The renderer maps it to its own equivalent (a `ThemeData` for Material). **Nothing about behaviour changes.**

```yaml
app:
  theme:
    primaryColor: "#1B5E20"     # #RRGGBB / #AARRGGBB — the palette is derived from it
    secondaryColor: "#FF6F00"   # derived from the primary when omitted
    brightness: light           # follow the device with `system`
    density: compact            # business screens usually want compact
    fontFamily: Noto Sans JP
    radius: 8                   # corner radius in logical pixels
    config: { logo: assets/logo.png }   # renderer specific extras
```

A colour that is not a colour, or an unknown `density`, is a **parse error** — silently ignoring it would mean "I wrote it and nothing happened". In Flutter, `materialThemeOf(app.theme!)` gives you the `ThemeData` if you want to apply it to your own `MaterialApp`.

<!-- vocab: theme.brightness -->
`light` `dark` `system`

<!-- vocab: theme.density -->
`comfortable` `standard` `compact`

## Dashboard

The framework **never issues an aggregate query**. The repository returns rows; the definition says how to fold them.

```yaml
page:
  type: dashboard
  id: sales_dashboard
  title: Sales
  repository: orderRepository      # default for cards that omit one
  layout: { columns: 4 }
  search: { filters: [ { field: orderDate, label: Date, type: date, operator: between } ] }
  items:
    - { id: orderCount, title: Orders }                                     # no value = count
    - { id: total, title: Amount, value: { aggregate: sum, field: amount }, format: currency }
    - { id: pending, title: Unshipped, filters: { status: unshipped } }      # card-specific filter
    - { id: byCustomer, type: chart, title: By customer, span: 2,
        chart: { kind: bar, labelField: customer, valueField: amount, aggregate: sum } }
```

Omitting `chart.aggregate` makes **one row = one point** (for a pre-aggregated endpoint). `count` uses the repository's total count.

## Report

Grouping is a **control break** over consecutive rows, so the rows must arrive in the print order — declare it in `sort` (sorting is the database's job).

```yaml
page:
  type: report
  id: sales_report
  title: Sales detail
  repository: orderRepository
  table:
    columns:
      - { field: customer, label: Customer }
      - { field: amount, label: Amount, type: number, format: currency }
  report:
    paper: { size: A4, orientation: portrait }
    rowsPerPage: 30            # headings and total lines count as lines
    sort: { field: customer }  # groupBy depends on this order
    groupBy: [ { field: customer, label: Customer, pageBreak: true } ]
    totals: [ { field: amount, aggregate: sum } ]
  actions:
    - { id: csv, type: export, label: CSV, config: { filename: sales, bom: true } }
```

**CSV export (`type: export`)** builds the text from that page's columns and rows (columns hidden by role are not exported). `config` takes `filename` / `header` / `delimiter` / `newline` (crlf|lf) / `bom` / `raw` / `limit` / `charset`. A list exports the **whole result set**, not the page on screen. Writing the file is the application's job — the framework hands the text to the export sink you registered.

**Charset (`charset`, default `utf-8`)** for receivers that only accept Shift_JIS. **The sink converts**; the definition only declares the name (it arrives as `req.charset`). `cp932` is Windows/Excel's Shift_JIS — what "please send Shift_JIS" almost always means, and the only one where `①` `㈱` `髙` `～` fit; `shift_jis` is strict JIS X 0208 (use it to *reject* extended characters); `euc_jp` also ships. **`bom` only applies to UTF-8** (a BOM in a Shift_JIS file is garbage in the first cell). The conversion lives in the opt-in `hatake_encoding` package:

```dart
final encodings = EncodingRegistry();
exportSink: (req) async => save(req.filename, encodings.encode(req.charset, req.text));
```

## Vocabularies

Every one of these is an **open string**: the built-ins below are what ships, and a registry can add more without forking.

### Field types (`field.type`, `filter.type`)
<!-- vocab: field.type -->
`text` `textarea` `number` `select` `multiSelect` `checkbox` `radio` `date` `dateTime` `time` `subTable`

`select` / `radio` / `multiSelect` need `options: [{value,label}]`. `subTable` (child rows) is a field type only — a filter cannot use it.

### Column types (`column.type`)
<!-- vocab: column.type -->
`text` `number` `badge` `boolean` `date` `dateTime`

### Filter operators (`filter.operator`)
<!-- vocab: filter.operator -->
`equals` `notEquals` `contains` `startsWith` `endsWith` `gt` `gte` `lt` `lte` `between` `in`

### Form mode (`visibleWhen`, `enabledWhen`)
<!-- vocab: condition.mode -->
`create` `edit`

`{ mode: create }` / `{ mode: edit }` is a leaf of its own: the record cannot tell
you which state the form is in. False wherever the mode is unknown (a read-only
detail page has none).

```yaml
- { field: code, label: Code, enabledWhen: { mode: create } }   # never changed after creation
```

### Read-only, conditional required, whole sections

```yaml
- { field: memberNo,  label: Member no., readOnlyWhen: { field: kind, value: personal } }
- { field: invoiceNo, label: Reg. no.,   requiredWhen: { field: kind, value: corp } }
sections:
  - title: Billing
    visibleWhen: { field: kind, value: corp }   # the heading goes too
    fields: [ { field: billingCode, label: Billing code, required: true } ]
```

| Key | Effect | Server-side validation |
|---|---|---|
| `visibleWhen` | shown / hidden | **yes** (a hidden field is not validated) |
| `enabledWhen` | enabled / disabled (greyed out) | no |
| `readOnlyWhen` | read-only (looks unchanged) | no |
| `requiredWhen` | required / optional | **yes** |

* A hidden field skips **every** validator, so "required once shown" is `visibleWhen` + `required: true`. `requiredWhen` is for "visible, but required only sometimes".
* A hidden field's leftover value is still saved (validation is skipped, values are not cleared).
* Pass the mode when validating server-side if a condition mentions `{ mode: … }` — without it the leaf is false, so validation errs on the lenient side.

### Condition operators (`visibleWhen`, `enabledWhen`)
<!-- vocab: condition.operator -->
`equals` `notEquals` `gt` `gte` `lt` `lte` `contains` `in` `isEmpty` `isNotEmpty`

Note the difference: `between` / `startsWith` / `endsWith` are search-only, while `isEmpty` / `isNotEmpty` take no value and are condition-only.

### Formatters (`format:`; options come from the same element's `config`)
<!-- vocab: field.format -->
| name | Example | Main options |
|---|---|---|
| `currency` | `1234567 → 1,234,567` / `-1234 → △1,234` | `symbol`, `decimals`, `negative` (`minus`/`triangle`/`blackTriangle`/`paren`) |
| `percent` | `12.34 → 12.34%` | `decimals`, `ratio` (true multiplies by 100) |
| `date` | `2026-07-22 → 2026/07/22` | `pattern` (`yyyy/MM/dd`, `yyyy-MM-dd`, `yyyy年M月d日`, `yyyyMMdd`) |
| `wareki` | `2026-07-22 → 令和8年7月22日` (Japanese era) | `style` (`long` / `short` = `R8/07/22`) |
| `postal` | `1234567 → 123-4567` | — |
| `mask` | `000012341234 → ********1234` | `keep`, `char` |

### Converters (`normalize: [...]`, applied before validation)
<!-- vocab: field.normalize -->
`toHankaku` `toZenkaku` `hiraToKata` `kataToHira` `trim` `collapseSpaces` `parseNumber`

`toHankaku` / `toZenkaku` convert between full-width and half-width characters — a routine requirement for Japanese business input.

### Validators (`validators: [{ type, ...params, message? }]`)
<!-- vocab: validator.type -->
| type | params | Meaning |
|---|---|---|
| `required` | — | not empty (or use `required: true` on the field) |
| `maxLength` | `value` (int) | length ≤ value |
| `minLength` | `value` (int) | length ≥ value |
| `min` | `value` (num) | number ≥ value |
| `max` | `value` (num) | number ≤ value |
| `pattern` | `pattern` (regex) | matches |
| `email` | — | email shape |
| `postalCode` | — | Japanese postal code (`1234567` / `123-4567`) |
| `compare` | `operator` / `field` (+ `aggregate` / `of`) | **Compares with another field** (`{ type: compare, operator: gte, field: startDate }`; `aggregate: sum, of: amount` compares with a child table's sum) |
| `unique` | `of` (a row field) | **No two rows of a `subTable` repeat that value** (`{ type: unique, of: item }`). Written on the subTable field itself, because judging repeats needs the whole set of rows |

**One error per field**, and the order is the field's own shape first, anything that reads another field (`compare`) last; among own-shape rules the written order stands.

`message` overrides the default (Japanese) text for that rule. To change the defaults wholesale, inject a `MessageResolver` (default locale `ja`) into `ValidatorRegistry`.

### Action types (`action.type`)
<!-- vocab: action.type -->
`create` `edit` `delete` `navigate` `plugin` `export` `print`

`scope: selection` (default `page`) runs the action over **the rows the user checked**: the table becomes selectable, the button stays disabled until something is selected (the label says why — nothing checked, or no rows to check — and then shows the count), the handler gets the records in `ctx.records` and is called **once**. The selection is dropped when the rows change and cleared once it ran. Only `type: plugin` can do this, and **there is no bulk delete** (an irreversible action scales its accidents with the row count).

`table.rowActions` is an array of action **ids** (strings), not objects. `edit` and `delete` are built in.

**Row buttons appear in the same place on every page kind** — at the end of the row, in the order listed (`search` / `crud` / `master`); on `crud` / `master` the built-in `edit` / `delete` mix into that same cell. The pressed row arrives as `ctx.record`. **A bulk button cannot be listed there**: it would run on the checked rows rather than the pressed one, so it stays above the list and `validate` reports `selection-as-rowaction`.

### Confirming and reacting (`confirm` / `prompt` / `onSuccess` / `onError`)

"Ask before deleting" and "go back to the list once saved" are declared, not coded.

```yaml
actions:
  - id: delete
    type: delete
    label: Delete
    confirm:                      # asked before it runs
      title: Delete customer
      message: Orders will no longer link back to this customer. Continue?
      okLabel: Delete
      cancelLabel: Keep
      danger: true                # style the confirming button as destructive
    onSuccess:                    # only when it actually succeeded
      message: Customer deleted
      page: customer_list         # optional: move here afterwards
      params: { id: "$row.id" }
    onError:                      # what the user is told when it failed
      message: Orders still reference this customer ({error})
```

* **A `delete` asks even without `confirm`** — it cannot be undone. Declaring `confirm` replaces the wording.
* `onSuccess` never runs on failure (unregistered handler, no export sink, a repository that refuses).
* Without `onError` the raw reason is shown (`RepositoryHttpException: … 500 …`). `onError` has **no `page`**: leaving the screen that failed hides what happened and takes the row to fix out of sight.
* Placeholders fill only when known — `{error}` on failure, `{count}` / `{failed}` / `{total}` only for `scope: selection`. **Those four are the whole set**: a field name such as `{orderNo}` has nothing to fill it. An unfillable one stays as text, and `validate` reports `placeholder-not-filled` before you press anything.
* **Before it runs** (`confirm.title` / `confirm.message` / `prompt.title`) `{count}` is the number of rows picked; nothing else fills there. The button shows the count too, but the confirmation sentence is the last thing read (`advise` reports `bulk-confirm-without-count`).
* **The per-press limit is declarable**: `maxRows: 20`, or `maxRows: { default: 20, byRole: { manager: 50, admin: all } }` to cap per role (several matching roles → the most permissive wins, as with `roles`). The backend reads the same limit: `checkBulkLimit(document, actionId, count, roles)` in TypeScript, `BulkLimits.check(...)` in Java — the screen limit is there to warn early, the server limit to hold. While more rows are picked the button is disabled and its label says the limit; it never truncates the selection. Omit it and the real limit is the page size (every row when paging is off).
* **Bulk is held to a stricter default**: `advise` reports a missing confirmation (a `prompt` counts as one), a confirmation without the count, a missing failure message, a destructive-sounding bulk without `danger: true`, and too many rows in one press (paging turned off means every row). A bulk action without `roles` counts as "anyone can press this dangerous button" whatever its type — in `advise` and in `explain --roles` alike.
* A bulk handler reports counts with `ctx.report(ActionOutcome(succeeded: …, failed: …))`. **A partial result does not run `onSuccess`** — one row left behind keeps the screen where it is.
* To **ask before running**, declare `prompt` ("write the reason, then reject"). Its `fields` are ordinary fields (types, `required`, `validators`, `computed`, `normalize` all apply) and the handler reads `ctx.input`. It **replaces** the confirmation dialog instead of adding one, and only `type: plugin` can receive the values.
* `create` / `edit` only open a form, so `onSuccess` does not apply to them — whether the save worked is not known at that point.

### Aggregates (`value.aggregate`, `chart.aggregate`, report `totals`)
<!-- vocab: dashboardValue.aggregate -->
`count` `sum` `avg` `min` `max`

`count` ignores `field`; everything else needs one. On no rows: `count`/`sum` → 0, others → null.

### Chart kinds (`chart.kind`)
<!-- vocab: chart.kind -->
`bar` `line` `pie`

### Paper sizes (`paper.size`)
<!-- vocab: paper.size -->
`A4` `A3` `B5` `letter`

With `orientation`: `portrait` | `landscape`.

**Printing (PDF / printer)**: the definition does not change. The opt-in
`hatake_print` package puts a report on paper (pure Dart, no UI — a nightly batch
can print too).

```dart
final bytes = reportPdf(page, rows, roles: {'staff'});  // PDF bytes
await Printing.layoutPdf(onLayout: (_) => bytes);       // printer via `printing`
```

**Printing from the definition (`type: print`)**: put
`- { id: printPdf, type: print, label: Print }` on a report and the button
appears. The framework hands over the paper's *contents* — the report, the rows
on screen, the roles, the formatters — and makes no bytes.

```dart
printSink: (req) async => save(req.filename,          // defaults to <title>.pdf
    reportPdf(req.page, req.rows, formatters: req.formatters, roles: req.roles));
```

The framework reads `config.filename` only (adding `.pdf` when it has no
extension); the rest of `config` passes through untouched, because paper trays
and typefaces are the adapter's vocabulary. With no `printSink` registered the
button says so instead of doing nothing quietly, and `print` on a page without a
`report` is a warning (`print-without-report`).

Formats, column widths (`column.width` in points), hidden columns (`roles`) and
the sheet count are the **same as the on-screen report**. Margins, footers and
page numbers live in `PrintStyle` — a print shop's concern, not the business's.
No date is written by default, so the same report yields the same bytes.

## Conditions and computed values (on a `field`)

```yaml
# visibleWhen / enabledWhen: a leaf {field,operator,value} or {all|any:[...]} / {not:{...}}
- { field: corpName, label: Company, type: text,
    visibleWhen: { field: type, operator: equals, value: corporate } }
- { field: memo, label: Memo, type: textarea,
    enabledWhen: { any: [ { field: type, operator: equals, value: vip },
                          { field: age, operator: gte, value: 65 } ] } }
# computed: read-only, recomputed as the record changes
- { field: fullName, label: Name, computed: { op: concat, fields: [last, first], separator: " " } }
- { field: total, label: Total, computed: { op: sum, fields: [price, tax] } }
```

Computed `op`:
<!-- vocab: field.computed.op -->
`concat` `sum` `subtract` `product` `count` `avg` `min` `max` `join`

Row folds also take `sort: { field, ascending }` and `limit` — 「the three largest amounts」 —
applied as `where` → `sort` → `limit`; `join` appends 「ほか N 件」 when `limit` cut rows
(`overflow` rewords it, `overflow: ""` drops it) and `limit` works for the numeric folds too.
`unique` (`{ type: unique, of: item }`) is the cross-row validator: it belongs on the
subTable field, because judging repeats needs the whole set of rows.

Two modes: `fields: [a, b]` folds values of the **same record** (`concat` / `sum` /
`subtract` / `product`), while `field: <subTable field>` + `of: <row field>` folds the
**rows of a subTable** (`count` / `sum` / `avg` / `min` / `max` — the same aggregate
vocabulary as dashboard cards — plus `join`, which lists the rows as one string).

```yaml
- { field: subtotal, label: Subtotal, computed: { op: sum, field: lines, of: amount } }
- { field: itemNames, label: Items, computed: { op: join, field: lines, of: item } }
- { field: total, label: Total, computed: { op: sum, fields: [subtotal, tax] } }
# fold only some rows (the same condition language as visibleWhen)
- { field: subtotal, label: Subtotal,
    computed: { op: sum, field: lines, of: amount,
                where: { field: cancelled, operator: notEquals, value: true } } }
```

`of` is required except for `count`; `separator` sets what `join` puts between values
(default `", "`). With no rows, `sum` / `count` are 0, `avg` / `min` / `max` are empty and
`join` is an empty string. `where` filters **rows** (evaluated against one row), so
`{ mode: … }` is never true there. The same `where` works on the `compare` validator
(`aggregate` + `of` + `where`) — if the subtotal skips cancelled rows, the check that
compares against it must skip them too, or the two never agree. Only rows saved with the parent can be folded — a
subTable with `source` is paged, so its rows are not all here (`validate` says so).
Computed fields are derived once, in declaration order — writing a field before the one it
uses leaves it empty, and `validate` says so. Extensible via `ComputedRegistry`.

## Linked options (the parent narrows the child)

```yaml
# 1. in the definition
- { field: prefecture, label: Prefecture, type: select,
    options: [{ value: tokyo, label: Tokyo }, { value: osaka, label: Osaka }] }
- field: city
  label: City
  type: select
  optionsFrom: prefecture                            # the parent field
  options:
    - { value: shibuya, label: Shibuya, when: tokyo } # offered for this parent value
    - { value: other,   label: Other }                # no `when` = always offered

# 2. from a repository
- field: city
  label: City
  type: select
  optionsFrom: prefecture
  optionsSource: { repository: cityRepository, value: code, label: name, parentKey: prefecture }
```

* While the parent is empty, options with a `when` are not offered (and form 2 fetches nothing).
* **A child value that is no longer offered is cleared** — losing it beats saving Shibuya under Osaka.
* Values compare the loose way conditions do (`'1'` equals `1`).
* Do not write both `options` and `optionsSource` (the fetched one wins; `validate` warns).
* **Search filters (`search.filters`) take the same keys** with the same meaning (shared code). A range filter (`between`) holds two values, so it cannot be a parent.

## Roles (display gating only)

Put `roles: [...]` on a `field`, `column` or `action` (empty or absent = everyone). In Flutter the current user's roles come from `HatakeScope(roles: {'admin'})`.

```yaml
- { field: salary, label: Salary, roles: [hr, manager] }
```

This is **display gating only**. Real access control belongs in the backend — hatake has no authentication or authorization.

## Master-detail (`type: subTable`)

Child rows are one field of the parent record. Either embed them, or fetch them from their own repository with `source`:

```yaml
- field: lines
  label: Lines
  type: subTable
  columns:
    - { field: productName, label: Product }
    - { field: qty, label: Qty, type: number }
  # optional: fetch + page the rows from their own repository instead of embedding
  source: { repository: orderLineRepository, parentKey: orderId, pageSize: 20 }
```

Embedded rows are saved together with the parent. With `source`, each row is saved on its own and the parent must already have a key.

## Using it from code

The same names and outputs exist in all three editions — Dart (`hatake_core`), TypeScript (`@hatake/core`), Java (`io.github.asil-e-hatake:hatake-core`) — and are pinned to identical results by the [conformance suite](../spec/conformance/).

```ts
new FormatterRegistry().format("currency", 1234567, { symbol: "¥" }); // "¥1,234,567"
new ConverterRegistry().convert("toHankaku", "１２３");                // "123"
new FormValidator().validate(form, record);                          // ValidationResult
buildQuery(page.search, params);                                     // framework-neutral QuerySpec
deriveDto(page);                                                     // → JSON Schema / OpenAPI / native types
```

Japanese business rules ship as utilities in all three: consumption tax (`computeTax`, `computeInvoice` per-rate rounding), Japanese eras (`eraOf`), fiscal year and quarter (`fiscalYear`), age and tenure (`ageAt`, `tenure`), business days with injected holidays (`nextBusinessDay`).

Talking to a REST API is an opt-in adapter: [`hatake_http`](../flutter/packages/hatake_http/) implements `Repository` against
exactly the API `hatake openapi` declares (`{items, totalCount}` for a list, `<collection>/{key}` for one record, 404 → null).
It carries no transport dependency — you hand it one `HttpSend` function — and types its failures (401/403, a 400 with
per-field validation errors, anything else, and *a shape that is not the declared one*, which it refuses to read as "0 rows").

The frontend (Flutter) renders definitions; backends (Java / TypeScript) use the *same* definitions for server-side validation, query building and API shape generation. That is the point: one definition, so the front and the back cannot disagree.

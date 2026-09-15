// 画面の試験の**下書き**を定義から起こす（`run --widget-draft`）。
//
// シナリオ（`run --draft` / `--cover --draft`）は**値の話**しかできない。押せるか・出て
// いるか・保存に行ったかは、画面を出さないと分からない。その道具（`hatake_test`）は
// 配ったが、**最初の1本を書くのは今も人**だった ── 押す相手は規約から決まるので、
// そこは機械が書ける。
//
// 出すのは Dart の試験コード。**キーの規約は書かない**（`HatakeFind.*` を呼ぶ）＝
// 規約の字が2か所に散ると、規約を変えた瞬間に下書きが黙って壊れる。
//
// 期待に書くのは**枠組みが必ずそうする所**だけ:
//   ・偽の Repository が何を聞かれたか（`calls` に `search` / `update(1)` が入る）
//   ・必須を空で保存したら保存に行かない（文言は組み込み）
//   ・登録した処理が呼ばれた
// **業務として正しいか**（保存後にどの画面へ行くか・その値でいいのか）は書かない。
// 書けないことを書くと、下書きを写した人が「確かめた」と思ってしまう。
//
// 見えないものも決まっている: プラグインの中身・遷移した先の画面・Repository の実装。

import {
  ActionScopes,
  ActionTypes,
  FieldTypes,
  formFields,
  type ActionDefinition,
  type FieldDefinition,
  type FormDefinition,
  type PageDefinition,
} from "./definition.js";
import { plausible } from "./fieldValues.js";
import { formOf } from "./scenario.js";

/** 起こした試験1本。 */
export interface WidgetCase {
  /** 試験の名前（`testWidgets` の第1引数）。 */
  name: string;
  /** その1本の Dart（行で持つ＝出す側が字下げを決める）。 */
  body: string[];
  /** 何から起こしたか（人が読む）。 */
  from: string;
}

export interface WidgetDraft {
  /** そのまま置ける Dart の1枚。 */
  source: string;
  cases: WidgetCase[];
  /** 起こさなかったもの（黙って落とさない）。 */
  skipped: { what: string; why: string }[];
  /** 人がやること。 */
  todo: string[];
}

const dart = (value: unknown): string => {
  if (typeof value === "string") return `'${value.replace(/'/g, "\\'")}'`;
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `'${String(value)}'`;
};

/** 手で入れる項目（計算項目と、別テーブルに持つ明細は入れない）。 */
const typedIn = (form: FormDefinition): FieldDefinition[] =>
  formFields(form).filter(
    (field) =>
      field.computed === undefined &&
      !(field.type === FieldTypes.subTable && field.source !== undefined),
  );

/** 一覧に出す1行（キーの値は 1 にする＝`HatakeFind.edit(1)` と揃える）。 */
function sampleRow(page: PageDefinition, form: FormDefinition | undefined): string {
  const parts: string[] = [`'${keyOf(page)}': 1`];
  const columns = "table" in page && page.table !== undefined ? page.table.columns : [];
  const seen = new Set<string>([keyOf(page)]);
  for (const column of columns) {
    if (seen.has(column.field)) continue;
    seen.add(column.field);
    const field = form?.sections
      .flatMap((one) => one.fields)
      .find((one) => one.field === column.field);
    parts.push(`'${column.field}': ${dart(field === undefined ? "X" : plausible(field))}`);
  }
  return `{${parts.join(", ")}}`;
}

const keyOf = (page: PageDefinition): string =>
  "key" in page && typeof page.key === "string" ? page.key : "id";

/** 押しても外に出ないボタン（プラグイン）。呼ばれたことしか見ない。 */
const pluginActions = (page: PageDefinition): ActionDefinition[] =>
  ("actions" in page ? page.actions : []).filter(
    (one) =>
      one.type === ActionTypes.plugin &&
      one.plugin !== undefined &&
      one.scope !== ActionScopes.selection,
  );

/**
 * 画面の試験の下書きを起こす。
 *
 * `from` は定義の読み込み元（試験の中に書く道）。渡さなければ定義を文字列で埋め込む
 * ＝どちらでも回るが、**道を渡したほうが定義と試験がずれない**（1つの正を見る）。
 */
export function draftWidgetTest(
  page: PageDefinition,
  options: { from?: string; source?: string } = {},
): WidgetDraft {
  const form = formOf(page);
  const cases: WidgetCase[] = [];
  const skipped: WidgetDraft["skipped"] = [];
  const todo: string[] = [];
  const hasTable = "table" in page && page.table !== undefined;
  const row = sampleRow(page, form);

  if (hasTable) {
    cases.push({
      name: "一覧が出て、Repository に問い合わせている",
      from: "table.columns",
      body: [
        `final page = await pumpPage(tester, definition, rows: [${row}]);`,
        "",
        "// 一覧を出すには問い合わせが要る＝偽物に聞きに行っている。",
        "expect(page.repository.calls, contains('search'));",
        `expect(page.definition.id, '${page.id}');`,
      ],
    });
  } else {
    skipped.push({
      what: "一覧が出る試験",
      why: "この画面は一覧（table）を持っていません",
    });
  }

  const rowActions = hasTable ? (page.table?.rowActions ?? []) : [];
  const editable = form !== undefined && rowActions.includes("edit");
  if (editable) {
    const first = typedIn(form).find((one) => one.type !== FieldTypes.subTable);
    if (first === undefined) {
      skipped.push({ what: "行から編集して保存する試験", why: "入れる項目がありません" });
    } else {
      cases.push({
        name: "行から編集を開いて保存できる",
        from: "table.rowActions（edit）＋ form",
        body: [
          `final page = await pumpPage(tester, definition, rows: [${row}]);`,
          "",
          "await tester.tap(HatakeFind.edit(1));",
          "await tester.pumpAndSettle();",
          `await tester.enterText(HatakeFind.field('${first.field}'), ${dart(
            plausible(first),
          )});`,
          "await tester.tap(HatakeFind.formSave);",
          "await tester.pumpAndSettle();",
          "",
          "// 保存に行ったこと（何をどう保存するかは Repository の担当）。",
          "expect(page.repository.calls, contains('update(1)'));",
        ],
      });
    }
  }

  const required = form === undefined ? [] : typedIn(form).filter((one) => one.required);
  if (required.length > 0) {
    cases.push({
      name: "必須を空で保存すると、保存に行かない",
      from: `form の必須（${required.map((one) => one.label).join(" / ")}）`,
      body: [
        "final page = await pumpPage(tester, definition, rows: const []);",
        "",
        hasTable
          ? "await tester.tap(HatakeFind.action('create'));\n    await tester.pumpAndSettle();"
          : "",
        "await tester.tap(HatakeFind.formSave);",
        "await tester.pumpAndSettle();",
        "",
        "// 文言は組み込み（業務の言い方にするなら定義の側で変える）。",
        "expect(find.text('必須項目です'), findsWidgets);",
        "expect(page.repository.calls, isNot(contains('create')));",
      ].filter((one) => one !== ""),
    });
  }

  const filter =
    "search" in page && page.search !== undefined
      ? page.search.filters.find((one) => one.type === FieldTypes.text)
      : undefined;
  if (filter !== undefined) {
    cases.push({
      name: "絞り込みが Repository に渡る",
      from: `search.filters（${filter.label}）`,
      body: [
        `final page = await pumpPage(tester, definition, rows: [${row}]);`,
        "",
        `await tester.enterText(HatakeFind.filter('${filter.field}'), 'X');`,
        "await tester.tap(HatakeFind.search);",
        "await tester.pumpAndSettle();",
        "",
        `expect(page.repository.queries.last.filters['${filter.field}'], 'X');`,
      ],
    });
  }

  for (const action of pluginActions(page).slice(0, 2)) {
    cases.push({
      name: `「${action.label}」が押せて、登録した処理に届く`,
      from: `actions（${action.id}）`,
      body: [
        "var called = 0;",
        "await pumpPage(",
        "  tester,",
        "  definition,",
        "  rows: const [],",
        `  actions: {'${action.plugin}': (context) async => called++},`,
        ");",
        "",
        `await tester.tap(HatakeFind.action('${action.id}'));`,
        "await tester.pumpAndSettle();",
        "",
        "// 呼ばれたことまで。**中身は枠組みの外**なので、ここでは見ない。",
        "expect(called, 1);",
      ],
    });
  }

  const subTable =
    form === undefined
      ? undefined
      : typedIn(form).find(
          (one) => one.type === FieldTypes.subTable && one.source === undefined,
        );
  if (subTable !== undefined) {
    const rowField = subTable.rowFields.find((one) => one.computed === undefined);
    if (rowField !== undefined) {
      cases.push({
        name: `明細「${subTable.label}」の行を足せる`,
        from: `form の明細（${subTable.field}）`,
        body: [
          "await pumpPage(tester, definition, rows: const []);",
          "",
          hasTable
            ? "await tester.tap(HatakeFind.action('create'));\n    await tester.pumpAndSettle();"
            : "",
          `await tester.tap(HatakeFind.subTableAdd('${subTable.field}'));`,
          "await tester.pumpAndSettle();",
          `await tester.enterText(HatakeFind.field('${rowField.field}'), ${dart(
            plausible(rowField),
          )});`,
          `await tester.tap(HatakeFind.subTableRowSave('${subTable.field}'));`,
          "await tester.pumpAndSettle();",
          "",
          `expect(find.text(${dart(plausible(rowField))}), findsWidgets);`,
        ].filter((one) => one !== ""),
      });
    }
  }

  cases.push({
    name: "Repository が落ちたら、画面がそう言う",
    from: "枠組みが必ずそうする所（定義に依らない）",
    body: [
      "await pumpPage(",
      "  tester,",
      "  definition,",
      "  rows: const [],",
      "  failWith: Exception('つながりません'),",
      ");",
      "",
      "expect(HatakeFind.error, findsOneWidget);",
    ],
  });

  skipped.push(
    {
      what: "押した先の画面",
      why: "遷移した先で何が出るかは、その画面の試験の話です（1本に混ぜると、落ちたときにどちらが悪いか分からなくなります）",
    },
    {
      what: "プラグインの中身",
      why: "押したときの処理は枠組みの外なので、呼ばれたことまでしか見られません",
    },
  );
  todo.push(
    "期待に書いてあるのは**枠組みが必ずそうする所**だけです" +
      "（問い合わせに行った・保存に行かなかった・登録した処理が呼ばれた）。" +
      "**業務として正しいか**（その値でいいのか・保存後にどこへ行くのか）は人が足してください。",
  );

  return {
    source: render(page, cases, options),
    cases,
    skipped,
    todo,
  };
}

/** Dart の1枚にする。 */
function render(
  page: PageDefinition,
  cases: WidgetCase[],
  options: { from?: string; source?: string },
): string {
  const out: string[] = [];
  const from = options.from;
  if (from !== undefined) out.push("import 'dart:io';", "");
  out.push(
    "import 'package:flutter_test/flutter_test.dart';",
    "import 'package:hatake_test/hatake_test.dart';",
    "",
    `/// ${page.title}（${page.id}）の画面の試験 — **hatake run --widget-draft が起こした`,
    "/// 下書き**。",
    "///",
    "/// 期待に書いてあるのは**枠組みが必ずそうする所**だけ（問い合わせに行った・保存に",
    "/// 行かなかった・登録した処理が呼ばれた）。**業務として正しいか**は人が足す。",
    "///",
    "/// 見ていないもの: プラグインの中身・遷移した先の画面・Repository の実装。",
    "void main() {",
  );
  if (from !== undefined) {
    out.push(`  final definition = File('${from}').readAsStringSync();`);
  } else {
    out.push("  const definition = r'''");
    out.push((options.source ?? "").trimEnd());
    out.push("''';");
  }
  for (const one of cases) {
    out.push("");
    out.push(`  // ${one.from} から。`);
    out.push(`  testWidgets('${one.name.replace(/'/g, "\\'")}', (tester) async {`);
    for (const line of one.body) {
      out.push(line === "" ? "" : `    ${line}`);
    }
    out.push("  });");
  }
  out.push("}");
  return `${out.join("\n")}\n`;
}

/** 人が読む形（起こした一覧と、起こさなかったもの）。 */
export function widgetDraftLines(draft: WidgetDraft): string[] {
  const out = [`画面の試験を ${draft.cases.length} 本起こしました:`];
  for (const one of draft.cases) out.push(`  ・${one.name}  ← ${one.from}`);
  out.push("");
  out.push("見ていないもの:");
  for (const one of draft.skipped) out.push(`  ・${one.what} … ${one.why}`);
  out.push("");
  for (const one of draft.todo) out.push(`・${one}`);
  out.push("");
  out.push(WIDGET_DRAFT_NOTE);
  return out;
}

/** この下書きが何で、何でないかを毎回書く。 */
export const WIDGET_DRAFT_NOTE =
  "※ 押す相手は**公開された規約**（`HatakeFind`）で書いてあるので、キーの字は1つも" +
  "書いていません（規約を変えたら下書きも一緒に動きます）。値は定義の制約から作った" +
  "もので、**業務としてあり得る値かは人が見てください**。";

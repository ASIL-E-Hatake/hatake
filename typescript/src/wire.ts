// 定義から「アプリ側の配線」の下書きを作る。
//
// 定義を書き終えた人が次に詰まるのはここ。画面は定義から出るのに、**繋ぐコード**は
// 毎回手書きで、しかも「何を登録すればいいか」は定義の中に全部書いてある
// （[collectRefs] が出せる）。機械的に決まる所を機械に書かせる。
//
// 決めごと2つ。
//
// 1. **決められない所は空けて TODO と書く。** 何をするか（業務）とどう繋ぐか（環境）は
//    定義に無い。それらしいコードで埋めると、動かないものが動くように見える。
// 2. **必ずコンパイルが通る形で出す。** TODO の中身は `throw UnimplementedError` に
//    しておく＝貼った瞬間に型が合い、埋め忘れは実行時に大声で落ちる（黙って何も
//    しないより良い）。
//
// 生成物は `flutter analyze` に通ることを CI が確かめている（この生成器が壊れたら、
// 生成したものが解析で落ちる）。

import { collectRefs, refsNeedingRegistration } from "./refs.js";
import { mapLiteral } from "./wireMap.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export interface WireOptions {
  /** 生成する Widget のクラス名。既定は定義の id から作る。 */
  className?: string;
  /** 定義を読む場所（Flutter の assets のパス）。 */
  assets?: string;
  /**
   * REST の基点（`/api`）。渡すと `hatake_http` で Repository を組む＝そこは TODO に
   * ならない。渡さなければ Repository は自分で書く形（stub）で出す。
   */
  baseUrl?: string;
  /** 生成元のファイル名（見出しのコメントに書く）。 */
  source?: string;
}

/** `sales_admin` → `SalesAdminApp`、`customer_master` → `CustomerMasterPage`。 */
function className(id: string, isApp: boolean): string {
  const pascal = id
    .split(/[_\-\s]+/)
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  const base = pascal.length > 0 ? pascal : "Hatake";
  const suffix = isApp ? "App" : "Page";
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

/**
 * `orderRepository` → `orders`。
 *
 * REST の集合は複数形が慣習なので**推測して埋める**。当たっていなくても、直す場所が
 * 1箇所にまとまっているほうが速い（空欄より速い）。推測だと見出しに書く。
 */
function collectionOf(repository: string): string {
  const stem = repository.replace(/Repository$/, "");
  const name = stem.length > 0 ? stem : repository;
  if (/[sxz]$|[cs]h$/.test(name)) return `${name}es`;
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

/**
 * 定義から Flutter の配線を組み立てる。
 *
 * 返すのは1ファイル分の Dart。`main()` も入れる（貼って動かせる形のほうが、断片より
 * 確かめやすい。要らなければ消す）。
 */
export function wireApp(document: Dict, options: WireOptions = {}): string {
  const app = isDict(document.app) ? document.app : undefined;
  const page = isDict(document.page) ? document.page : undefined;
  const isApp = app !== undefined;
  const id = str(app?.id) ?? str(page?.id) ?? "hatake";
  const name = options.className ?? className(id, isApp);
  const assets = options.assets ?? `assets/${options.source ?? `${id}.yaml`}`;
  const needs = refsNeedingRegistration(collectRefs(document));
  const rest = options.baseUrl !== undefined;

  const repositories = needs.repositories ?? [];
  const plugins = needs.plugins ?? [];
  const sinks = needs.sinks ?? [];
  const validators = needs.validators ?? [];
  const converters = needs.converters ?? [];
  const formatters = needs.formatters ?? [];
  const computedOps = needs.computedOps ?? [];
  const aggregates = needs.aggregates ?? [];
  const fieldTypes = needs.fieldTypes ?? [];
  const cardTypes = needs.dashboardItemTypes ?? [];
  const chartKinds = needs.chartKinds ?? [];

  const out: string[] = [];
  const push = (...lines: string[]): void => {
    out.push(...lines);
  };

  push(
    "// hatake wire が定義から作った配線の下書き。**手で直す前提**のもの。",
    "//",
    "// 定義から機械的に決まるのは「何を登録すればいいか」まで。**中身は決められない**",
    "// ので、TODO の所は空けてある（何をするかは業務、どう繋ぐかは環境）。埋めるまでは",
    "// UnimplementedError で落ちる＝黙って何もしない、にはしていない。",
    "//",
    `// 生成元: ${options.source ?? "(標準入力)"}`,
    "// 再生成すると手で書いた分は消える。通ったら自分のコードに取り込むこと。",
  );
  if (rest) {
    push(
      "//",
      "// Repository は hatake_http（`hatake openapi` が宣言する API と1対1）で組んで",
      "// ある。collection の名前は**複数形を推測して**埋めてあるので、API に合わせて",
      "// 直すこと。",
    );
  }
  push("");

  push("import 'package:flutter/material.dart';");
  push("import 'package:flutter/services.dart' show rootBundle;");
  if (rest) push("import 'package:hatake_http/hatake_http.dart';");
  push("import 'package:hatake_material/hatake_material.dart';");
  push("import 'package:hatake_yaml/hatake_yaml.dart';");
  push("");

  // main()
  push("Future<void> main() async {");
  push("  WidgetsFlutterBinding.ensureInitialized();");
  push("  // strict: 知らないキーがあれば起動時に落ちる（黙って無視されない）。");
  push(
    `  final definition = ${isApp ? "parseAppYaml" : "parsePageYaml"}(`,
    `    await rootBundle.loadString('${assets}'),`,
    "    strict: true,",
    "  );",
  );
  push(`  runApp(${name}(definition: definition));`);
  push("}");
  push("");

  // Widget
  const type = isApp ? "AppDefinition" : "PageDefinition";
  push(`/// 定義1つを描くところ。画面のコードはここには無い（定義から出る）。`);
  push(`class ${name} extends StatelessWidget {`);
  push(`  final ${type} definition;`);
  push("");
  push(`  const ${name}({super.key, required this.definition});`);
  push("");
  push("  @override");
  push("  Widget build(BuildContext context) {");
  push("    return MaterialApp(");
  push(`      title: '${str(app?.title) ?? str(page?.title) ?? id}',`);
  push("      home: HatakeScope(");

  // repositories
  if (rest) {
    push("        // 定義が名前を挙げた Repository。REST の口は hatake_http が持つ。");
    push("        repositories: RepositoryRegistry(restRepositories(");
    push(`          baseUrl: '${options.baseUrl}',`);
    push("          send: _send,");
    push(
      "          // TODO: ログインしているなら、ここでトークンを渡す（毎回呼ばれる）。",
    );
    push("          collections: {");
    for (const repository of repositories) {
      push(`            '${repository}': '${collectionOf(repository)}',`);
    }
    push("          },");
    push("        )),");
  } else {
    push("        // 定義が名前を挙げた Repository。中身はアプリが書く（5メソッド）。");
    // 中身が全部 const なので map ごと const にする（そうしないと解析が
    // prefer_const_constructors を言う＝生成物が「直すべきコード」に見える）。
    push(
      `        repositories: const RepositoryRegistry(${mapLiteral(
        repositories.map((r) => [r, `_UnwiredRepository('${r}')`] as [string, string]),
        "        ",
      )}),`,
    );
  }

  if (plugins.length > 0) {
    push("        // `type: plugin` のボタンの中身＝業務。定義には書けない所。");
    push(
      `        actions: ActionRegistry(${mapLiteral(
        plugins.map(
          (p) =>
            [
              p,
              `(ctx) async => throw UnimplementedError('${p}: 何をするか')`,
            ] as [string, string],
        ),
        "        ",
      )}),`,
    );
  }
  if (validators.length > 0) {
    push("        // 組み込みに無い検証。null を返せば OK、文字列を返せばそれがエラー。");
    push(
      `        validators: ValidatorRegistry(${mapLiteral(
        validators.map(
          (v) =>
            [
              v,
              `(value, definition) => throw UnimplementedError('${v}: 検証の中身')`,
            ] as [string, string],
        ),
        "        ",
      )}),`,
    );
  }
  if (converters.length > 0) {
    push("        // 組み込みに無い正規化（保存の前に値を直す）。");
    push(
      `        converters: ConverterRegistry(${mapLiteral(
        converters.map(
          (c) =>
            [
              c,
              `(value, options) => throw UnimplementedError('${c}: 正規化の中身')`,
            ] as [string, string],
        ),
        "        ",
      )}),`,
    );
  }
  if (aggregates.length > 0) {
    push("        // 組み込みに無い集約（ダッシュボードと帳票の合計欄）。");
    push(
      `        aggregates: AggregateRegistry(${mapLiteral(
        aggregates.map(
          (a) =>
            [
              a,
              `(rows, field) => throw UnimplementedError('${a}: 集約の中身')`,
            ] as [string, string],
        ),
        "        ",
      )}),`,
    );
  }
  if (computedOps.length > 0) {
    push("        // 組み込みに無い計算（入力から自動で埋める項目）。");
    push(
      `        computeds: ComputedRegistry(${mapLiteral(
        computedOps.map(
          (op) =>
            [
              op,
              `(computed, record) => throw UnimplementedError('${op}: 計算の中身')`,
            ] as [string, string],
        ),
        "        ",
      )}),`,
    );
  }

  // renderer（フォーマッタ・独自の項目型・独自のカード）
  const rendererArgs: string[] = [];
  if (formatters.length > 0) {
    rendererArgs.push(
      `          formatters: FormatterRegistry(${mapLiteral(
        formatters.map(
          (f) =>
            [
              f,
              `(value, options) => throw UnimplementedError('${f}: 見せ方')`,
            ] as [string, string],
        ),
        "          ",
      )}),`,
    );
  }
  if (fieldTypes.length > 0) {
    rendererArgs.push(
      `          fieldBuilders: ${mapLiteral(
        fieldTypes.map(
          (t) =>
            [
              t,
              `(ctx) => throw UnimplementedError('${t}: 入力の見た目')`,
            ] as [string, string],
        ),
        "          ",
      )},`,
    );
  }
  if (cardTypes.length > 0) {
    rendererArgs.push(
      `          dashboardItemBuilders: ${mapLiteral(
        cardTypes.map(
          (t) =>
            [
              t,
              `(ctx) => throw UnimplementedError('${t}: カードの中身')`,
            ] as [string, string],
        ),
        "          ",
      )},`,
    );
  }
  if (rendererArgs.length === 0) {
    push("        renderer: const MaterialRenderer(),");
  } else {
    push("        renderer: MaterialRenderer(");
    push(...rendererArgs);
    push("        ),");
  }

  for (const sink of sinks) {
    if (sink === "exportSink") {
      push("        // CSV は Framework が文字列まで作る。書くのはアプリ（web なら");
      push("        // ダウンロード、デスクトップなら保存ダイアログ）。");
      push("        exportSink: (request) async =>");
      push("            throw UnimplementedError('${request.filename} を書き出す'),");
    }
    if (sink === "printSink") {
      push("        // 紙の中身までが Framework。PDF にするのは opt-in の hatake_print、");
      push("        // 送るのはアプリ。");
      push("        printSink: (request) async =>");
      push("            throw UnimplementedError('${request.filename} を刷る'),");
    }
  }

  push("        // ログインした人の役割。**画面の出し分けだけ**で、遮断は API 側の仕事。");
  push("        // 空のままだと `roles` を書いた列・項目・ボタンは出てこない。");
  push("        roles: const {}, // TODO: ログインから取る");
  push(
    `        child: ${
      isApp ? "HatakeApp(app: definition)" : "HatakePageView(definition: definition)"
    },`,
  );
  push("      ),");
  push("    );");
  push("  }");
  push("}");

  if (rest) {
    push("");
    push("/// 実際に通信する所。**このパッケージが依存を持たない**ための穴で、");
    push("/// package:http でも dio でも社内のインターセプタでも差せる。");
    push("Future<HttpResponse> _send(HttpRequest request) async {");
    push("  throw UnimplementedError('HTTP クライアントを繋ぐ: ${request.method} '");
    push("      '${request.url}');");
    push("}");
  } else if (repositories.length > 0) {
    push("");
    push("/// まだ繋いでいない Repository。**5つのメソッドだけ**が Framework との契約。");
    push("///");
    push("/// REST なら `hatake wire --base /api` で hatake_http を使う形が出る。");
    push("class _UnwiredRepository implements Repository {");
    push("  final String name;");
    push("");
    push("  const _UnwiredRepository(this.name);");
    push("");
    push("  Never get _todo => throw UnimplementedError('$name を繋ぐ');");
    push("");
    push("  @override");
    push("  Future<PageResult> search(RepositoryQuery query) async => _todo;");
    push("  @override");
    push("  Future<DataRecord?> findByKey(Object key) async => _todo;");
    push("  @override");
    push("  Future<DataRecord> create(DataRecord data) async => _todo;");
    push("  @override");
    push("  Future<DataRecord> update(Object key, DataRecord data) async => _todo;");
    push("  @override");
    push("  Future<void> delete(Object key) async => _todo;");
    push("}");
  }

  if (chartKinds.length > 0) {
    push("");
    push("// 登録する口がまだ無いもの:");
    push(
      `//   グラフの種類 ${chartKinds.join(" / ")}（Renderer が知っている種類だけが描ける）`,
    );
  }

  return `${out.join("\n")}\n`;
}

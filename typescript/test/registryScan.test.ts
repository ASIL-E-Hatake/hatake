import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RefKinds,
  scanRegistrations,
  type SourceFile,
  stripComments,
} from "../src/index.js";

const scan = (source: string, path = "lib/main.dart") =>
  scanRegistrations([{ path, source }]);

describe("実装から登録済みのものを読む", () => {
  it("Dart の map リテラルからキーを読む", () => {
    const result = scan(`
void main() {
  runApp(HatakeApp(
    repositories: RepositoryRegistry({
      'customerRepository': CustomerRepository.seeded(),
      "orderRepository": OrderRepository.seeded(),
    }),
  ));
}
`);
    expect(result.registry.repositories).toEqual([
      "customerRepository",
      "orderRepository",
    ]);
    expect(result.unreadable).toEqual([]);
    expect(result.sites[0]).toMatchObject({ file: "lib/main.dart", line: 4 });
  });

  it("種類ごとに違う登録を、それぞれの種類として読む", () => {
    const result = scan(`
final scope = HatakeScope(
  actions: ActionRegistry({'csvExport': (ctx) async {}}),
  validators: ValidatorRegistry({'even': (v, d) => null}),
  converters: ConverterRegistry({'toKansai': (v) => v}),
  renderer: MaterialRenderer(
    fieldBuilders: {'color': (ctx) => ColorField(ctx)},
    dashboardItemBuilders: {'gauge': (ctx) => Gauge(ctx)},
  ),
);
`);
    expect(result.registry).toEqual({
      plugins: ["csvExport"],
      validators: ["even"],
      converters: ["toKansai"],
      fieldTypes: ["color"],
      dashboardItemTypes: ["gauge"],
    });
  });

  it("TypeScript / Java の書き方も読む", () => {
    const ts = scan(
      `const registry = new ValidatorRegistry({ corporateNo: v => null, "myRule": v => null });`,
      "src/app.ts",
    );
    // キーが文字列リテラルでない要素があるので、その登録は丸ごと読めない。
    expect(ts.registry.validators).toBeUndefined();
    expect(ts.unreadable[0].reason).toContain("キーが文字列リテラル");

    const java = scan(
      `var r = new ValidatorRegistry(Map.of("corporateNo", v -> null, "myRule", v -> null));`,
      "Main.java",
    );
    expect(java.registry.validators).toEqual(["corporateNo", "myRule"]);

    const entries = scan(
      `var r = new FormatterRegistry(Map.ofEntries(Map.entry("yen", f), Map.entry("era", g)));`,
      "Main.java",
    );
    expect(entries.registry.formatters).toEqual(["era", "yen"]);
  });

  it("Java は型を明示した Map.<K, V>of(…) の形もよく出る", () => {
    // 型推論が効かない位置ではこう書く。実際のコードに合わせて読めるようにしてある。
    const result = scan(
      `ValidatorRegistry r = new ValidatorRegistry(
         Map.<String, ValidatorRegistry.Validator>of("even", (value, def) -> null));`,
      "Main.java",
    );
    expect(result.registry.validators).toEqual(["even"]);
    expect(result.unreadable).toEqual([]);
  });

  it("独自のものは無い、と明示した null も「空」ではなく「何も言っていない」", () => {
    const result = scan(
      `var r = new ValidatorRegistry(null, messages);`,
      "Main.java",
    );
    expect(result.unreadable).toEqual([]);
    expect(result.registry).toEqual({});
  });

  it("引数なしの登録は、その種類を「空」と断定しない", () => {
    // `ValidatorRegistry()` は「ここでは何も足していない」だけ。別の場所で登録して
    // いるかもしれないので、種類ごと突き合わせの対象から外す（嘘の警告を出さない）。
    const result = scan(`final v = ValidatorRegistry();`);
    expect(result.unreadable).toEqual([]);
    expect(result.sites).toEqual([]);
    expect(result.registry).toEqual({});
  });
});

describe("読めないものを黙って落とさない", () => {
  it("変数や関数から作った登録は、読めなかったものとして出す", () => {
    const result = scan(`
final scope = HatakeScope(
  repositories: RepositoryRegistry(buildRepositories()),
);
`);
    expect(result.registry.repositories).toBeUndefined();
    expect(result.unreadable).toEqual([
      {
        kind: "repositories",
        file: "lib/main.dart",
        line: 3,
        reason: "引数が map リテラルではありません（変数や関数の戻り値は読めません）",
      },
    ]);
  });

  it("他の map を展開している登録も読めない", () => {
    const result = scan(
      `final r = RepositoryRegistry({...common, 'orderRepository': o});`,
    );
    expect(result.registry.repositories).toBeUndefined();
    expect(result.unreadable[0].reason).toContain("展開");
  });

  it("その場に書いていないキー（定数）も読めない", () => {
    const result = scan(`final r = RepositoryRegistry({kCustomer: c});`);
    expect(result.unreadable[0].reason).toContain("キーが文字列リテラル");
  });

  it("読めた登録と読めない登録が混ざっても、読めた方は失わない", () => {
    const result = scan(`
final a = RepositoryRegistry({'orderRepository': o});
final b = ActionRegistry(handlers);
`);
    expect(result.registry.repositories).toEqual(["orderRepository"]);
    expect(result.unreadable).toHaveLength(1);
    expect(result.unreadable[0].kind).toBe("plugins");
  });
});

describe("読み間違えないための細かい話", () => {
  it("コメントアウトした登録は数えない（数えると一覧が嘘になる）", () => {
    const result = scan(`
// final old = RepositoryRegistry({'goneRepository': g});
/* final older = RepositoryRegistry({'ancientRepository': a}); */
final now = RepositoryRegistry({'orderRepository': o});
`);
    expect(result.registry.repositories).toEqual(["orderRepository"]);
    expect(result.unreadable).toEqual([]);
  });

  it("文字列の中の // はコメントではない", () => {
    const stripped = stripComments(`final url = 'https://example.com'; // 消す`);
    expect(stripped).toContain("'https://example.com'");
    expect(stripped).not.toContain("消す");
    // 位置を保つため、消した分は空白で埋める（行番号と桁がずれない）。
    expect(stripped).toHaveLength(`final url = 'https://example.com'; // 消す`.length);
  });

  it("コメントを消しても行番号はずれない", () => {
    const result = scan(`
/*
 まとまったコメント
*/
final now = RepositoryRegistry({'orderRepository': o});
`);
    expect(result.sites[0].line).toBe(5);
  });

  it("素通しの名前付き引数は登録ではない（Renderer の中でよく出る）", () => {
    const result = scan(`
Widget build(BuildContext context) => _Form(
      fieldBuilders: fieldBuilders,
      dashboardItemBuilders: widget.dashboardItemBuilders,
    );
`);
    expect(result.sites).toEqual([]);
    expect(result.unreadable).toEqual([]);
  });

  it("コンストラクタの宣言は登録ではない（フレームワーク自身を走査しても静か）", () => {
    const result = scan(`
class RepositoryRegistry {
  const RepositoryRegistry(this._repositories);
}
class ConverterRegistry {
  ConverterRegistry([Map<String, Converter>? custom]) : _c = {...builtin, ...?custom};
}
public final class ValidatorRegistry {
  public ValidatorRegistry(Map<String, Validator> custom) { }
}
`);
    expect(result.sites).toEqual([]);
    expect(result.unreadable).toEqual([]);
  });

  it("似た名前は拾わない", () => {
    const result = scan(`
final a = RepositoryRegistry.empty();
final b = MyRepositoryRegistry({'nope': x});
final c = _wrap(myFieldBuilders: {'nope': x});
`);
    expect(result.sites).toEqual([]);
    expect(result.unreadable).toEqual([]);
  });

  it("値の中の比較や矢印で切る位置がずれない", () => {
    const result = scan(`
final v = ValidatorRegistry({
  'even': (value, def) {
    final n = value as num;
    return n < 2 || n > 100 ? '範囲外' : null;
  },
  'odd': (value, def) => null,
});
`);
    expect(result.registry.validators).toEqual(["even", "odd"]);
  });

  it("同じ種類を複数の場所で登録していたら、まとめる", () => {
    const files: SourceFile[] = [
      { path: "a.dart", source: `final a = ActionRegistry({'one': x});` },
      { path: "b.dart", source: `final b = ActionRegistry({'two': y});` },
    ];
    const result = scanRegistrations(files);
    expect(result.registry.plugins).toEqual(["one", "two"]);
    expect(result.sites.map((s) => s.file)).toEqual(["a.dart", "b.dart"]);
  });
});

describe("実行時に申告する側との辻褄", () => {
  // 一覧の作り方は2つある（ソースを読む / 動いているアプリに聞く）。同じ語彙・同じ形
  // でなければ、片方で作った一覧をもう片方の道具に渡せない。
  const fixture = JSON.parse(
    readFileSync("../spec/conformance/registry_snapshot.json", "utf8"),
  ) as {
    kinds: string[];
    runtimeKinds: string[];
    sample: { expected: Record<string, string[]> };
  };

  it("種類の名前は spec と一致する（Dart の RegistryKinds も同じものを見る）", () => {
    expect(Object.values(RefKinds).sort()).toEqual([...fixture.kinds].sort());
  });

  it("実行時に出る種類は、突き合わせに使える種類の一部", () => {
    for (const kind of fixture.runtimeKinds) {
      expect(fixture.kinds, kind).toContain(kind);
    }
  });

  it("実行時に出る形は、そのまま登録済み一覧として渡せる", () => {
    // 値は名前の配列、キーは種類名。validate --registry が読む形と同じ。
    for (const [kind, names] of Object.entries(fixture.sample.expected)) {
      expect(fixture.kinds).toContain(kind);
      expect(Array.isArray(names)).toBe(true);
      expect([...names].sort()).toEqual(names);
    }
  });
});

describe("デモアプリとの辻褄", () => {
  const ASSETS = "../flutter/packages/hatake_example/assets";
  const MAIN = `${ASSETS}/../lib/main.dart`;

  it("同梱の一覧は、実装から生成したものと一致する（＝古くなったら落ちる）", () => {
    const scan = scanRegistrations([
      { path: MAIN, source: readFileSync(MAIN, "utf8") },
    ]);
    expect(scan.unreadable).toEqual([]);
    const committed = JSON.parse(
      readFileSync(`${ASSETS}/hatake-registry.json`, "utf8"),
    ) as Record<string, unknown>;
    const { $comment, ...lists } = committed;
    expect($comment).toBeTypeOf("string");
    expect(lists).toEqual(scan.registry);
  });
});

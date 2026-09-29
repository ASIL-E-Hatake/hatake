import type {
  AggregateRegistry,
  ComputedRegistry,
  ConverterRegistry,
  FormatterRegistry,
  ValidatorRegistry,
} from "@hatake-fw/api";

import type { ActionRegistry } from "./action.js";
import type { RepositoryRegistry } from "./repository.js";
import type { ExportSink, PrintSink } from "./sinks.js";

/**
 * アプリが登録したもの一式。**枠組みは何も作らない**ので、ここに入っているものが
 * その案件で「繋がっている」もののすべて。
 *
 * Vue と React がどちらもこの形を受け取る（**登録の書き方を変えずに Renderer を
 * 差し替えられる**）。Flutter 側の `HatakeScope` に当たる。
 */
export interface HatakeRegistries {
  readonly repositories: RepositoryRegistry;
  readonly actions?: ActionRegistry;
  readonly exportSink?: ExportSink;
  readonly printSink?: PrintSink;
  readonly validators?: ValidatorRegistry;
  readonly formatters?: FormatterRegistry;
  readonly converters?: ConverterRegistry;
  readonly computeds?: ComputedRegistry;
  readonly aggregates?: AggregateRegistry;
  /**
   * このアプリが**配りうる**役割の語彙。
   *
   * いま見ている人の役割（画面に渡すほう）ではない。申告に出すのはこちらで、
   * 今の人の役割を出すと「その人で動かしたときの紙」になり、突き合わせた側が
   * 「manager はアプリに無い」と言い出す＝**道具が嘘をつく**。
   */
  readonly knownRoles?: readonly string[];
}

/**
 * 「登録済みのもの」の種類。`hatake-registry.json` のキーで、`hatake refs` /
 * `hatake validate --registry` と同じ語彙。
 *
 * 一致していることは `spec/conformance/registry_snapshot.json` が3版から確かめる。
 */
export const RegistryKinds = {
  repositories: "repositories",
  plugins: "plugins",
  /** 出力先（`exportSink` / `printSink`）。**在るか無いか**なので、名前そのもの。 */
  sinks: "sinks",
  validators: "validators",
  formatters: "formatters",
  converters: "converters",
  computedOps: "computedOps",
  aggregates: "aggregates",
  fieldTypes: "fieldTypes",
  dashboardItemTypes: "dashboardItemTypes",
  /** このアプリが配りうる役割。ほかと違って**名前だけの語彙**。 */
  roles: "roles",
} as const;

/** 自分が持っている登録を名乗れる、という印（Renderer やプラグインが実装する）。 */
export interface RegistryReporter {
  readonly registeredNames: Readonly<Record<string, readonly string[]>>;
}

const reports = (one: unknown): one is RegistryReporter =>
  one !== null && typeof one === "object" && "registeredNames" in one;

/**
 * いま動いているアプリが**実際に登録しているもの**を、種類ごとに返す。
 *
 * 静的な走査（`hatake registry`）は、登録している所にその場で書いてある字しか
 * 読めない。変数や関数から組み立てている登録は原理的に読めないので、**動いている
 * アプリに聞く**ための口がこれ。
 *
 * 出すのは**アプリが足したものだけ**（組み込みは突き合わせ側が知っている）。
 * **空の種類は出さない**＝「その種類は何も無い」ではなく「言うことが無い」。
 */
export function registrySnapshot(
  registries: HatakeRegistries,
  renderer?: unknown,
): Record<string, string[]> {
  const fromRenderer = reports(renderer) ? renderer.registeredNames : {};

  const all: Record<string, readonly string[]> = {
    [RegistryKinds.repositories]: registries.repositories.customKeys,
    [RegistryKinds.plugins]: registries.actions?.customKeys ?? [],
    // 出す口は「渡したか」だけが問題（中身は関数なので名前が無い）。
    [RegistryKinds.sinks]: [
      ...(registries.exportSink === undefined ? [] : ["exportSink"]),
      ...(registries.printSink === undefined ? [] : ["printSink"]),
    ],
    [RegistryKinds.validators]: registries.validators?.customKeys ?? [],
    [RegistryKinds.formatters]: registries.formatters?.customKeys ?? [],
    [RegistryKinds.converters]: registries.converters?.customKeys ?? [],
    // 計算と集約も申告する。ここが抜けていると、プラグインの計算を登録している
    // アプリでも `hatake validate --registry` は「その op は登録が要る」と言い続ける
    // ＝**登録してあるのに無いと言われる**（道具が嘘をつく側に倒れる）。
    [RegistryKinds.computedOps]: registries.computeds?.customKeys ?? [],
    [RegistryKinds.aggregates]: registries.aggregates?.customKeys ?? [],
    [RegistryKinds.roles]: registries.knownRoles ?? [],
    ...fromRenderer,
  };

  const out: Record<string, string[]> = {};
  for (const [kind, names] of Object.entries(all)) {
    if (names.length > 0) out[kind] = [...names].sort();
  }
  return out;
}

/**
 * 申告であることの印。`hatake registry --from-app` はこの字が無い紙を受け取らない。
 *
 * 手で書いた一覧は「登録していない」と「書き忘れた」の区別が付かないので、申告として
 * 扱うと**無い種類について道具が断定する**ようになる（「出す口が1つも無い」など）。
 */
export const registrySnapshotSource = "registrySnapshot";

/** [[registrySnapshot]] を `hatake-registry.json` としてそのまま書ける字にする。 */
export function registrySnapshotJson(registries: HatakeRegistries, renderer?: unknown): string {
  return JSON.stringify(
    {
      $comment:
        "動いているアプリが申告した「登録済みのもの」の一覧（registrySnapshot）。" +
        "hatake validate --registry にそのまま渡せる。",
      $source: registrySnapshotSource,
      ...registrySnapshot(registries, renderer),
    },
    null,
    2,
  );
}

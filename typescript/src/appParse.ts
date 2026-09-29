import { parse as parseYamlText } from "yaml";
import {
  AppNavigations,
  Brightnesses,
  Densities,
  type AppDefinition,
  type MenuItem,
  type PageDefinition,
  type PageRef,
  type ThemeDefinition,
} from "./definition.js";
import {
  acceptDslVersion,
  DefinitionParseError,
  UnknownKeysError,
  type ParseOptions,
} from "./parse.js";
import { parsePageMap } from "./parse.js";
import { findUnknownKeys } from "./strictKeys.js";
import { expandVocabularies } from "./vocabularies.js";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function reqString(m: Dict, key: string, at: string): string {
  const v = m[key];
  if (typeof v === "string" && v.length > 0) return v;
  throw new DefinitionParseError(`Missing or empty required string "${key}"`, at);
}

const optString = (m: Dict, key: string): string | undefined =>
  typeof m[key] === "string" ? (m[key] as string) : undefined;

const optDict = (m: Dict, key: string): Dict | undefined =>
  isDict(m[key]) ? (m[key] as Dict) : undefined;

const optList = (m: Dict, key: string): unknown[] =>
  Array.isArray(m[key]) ? (m[key] as unknown[]) : [];

function asDict(v: unknown, at: string): Dict {
  if (isDict(v)) return v;
  throw new DefinitionParseError("Expected a mapping", at);
}

/** Parse a YAML app document into an AppDefinition. */
export function parseAppYaml(
  source: string,
  options?: ParseOptions,
): AppDefinition {
  let decoded: unknown;
  try {
    decoded = parseYamlText(source);
  } catch (e) {
    throw new DefinitionParseError(`Invalid YAML: ${(e as Error).message}`);
  }
  return fromDecoded(decoded, "YAML", options);
}

/** Parse a JSON app document into an AppDefinition. */
export function parseAppJson(
  source: string,
  options?: ParseOptions,
): AppDefinition {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch (e) {
    throw new DefinitionParseError(`Invalid JSON: ${(e as Error).message}`);
  }
  return fromDecoded(decoded, "JSON", options);
}

function fromDecoded(
  decoded: unknown,
  format: string,
  options?: ParseOptions,
): AppDefinition {
  if (!isDict(decoded)) {
    throw new DefinitionParseError(`Top-level ${format} must be a mapping/object`);
  }
  // Parse first: a missing `id` is the more fundamental problem.
  const app = parseAppMap(decoded);
  if (options?.strict === true) {
    const unknown = findUnknownKeys(decoded);
    if (unknown.length > 0) throw new UnknownKeysError(unknown);
  }
  return app;
}

/**
 * The single convergence point shared by the YAML and JSON entry points. The
 * map may be the whole document (`{dsl_version, app: {...}}`) or the app map
 * directly.
 */
export function parseAppMap(rawRoot: Dict): AppDefinition {
  // **語彙をいちばん先に展開する。** `optionsOf: <名前>` を実体の並びに置き換えて
  // から解析するので、この先（説明・図・API の形）は語彙を知らなくてよい。
  // Dart / Java 版と同じ順番（3版で同じ定義から同じものが出る）。
  const root = expandVocabularies(rawRoot);
  const dslVersion = acceptDslVersion(optString(root, "dsl_version"));
  const app = optDict(root, "app") ?? root;
  return {
    id: reqString(app, "id", "app.id"),
    title: reqString(app, "title", "app.title"),
    dslVersion,
    home: optString(app, "home"),
    navigation: optString(app, "navigation") ?? AppNavigations.single,
    // 配りうる役割の**語彙**。空で書いても「書いた」＝語彙が空だと言える
    // （書いていない＝語彙は分からない、とは別）。
    roles: optList(app, "roles").map((one) => String(one)),
    theme: parseTheme(optDict(app, "theme")),
    menu: optList(app, "menu").map((m, i) =>
      parseMenu(asDict(m, `app.menu[${i}]`)),
    ),
    pages: optList(app, "pages").map((p, i) =>
      parsePageRef(asDict(p, `app.pages[${i}]`)),
    ),
  };
}

/**
 * Reads `app.theme`. Colours and the two closed vocabularies are checked here:
 * one that is silently ignored is the worst outcome, because the definition
 * looks right and nothing changes. Same errors as the Dart edition.
 */
function parseTheme(m: Dict | undefined): ThemeDefinition | undefined {
  if (m === undefined) return undefined;
  return {
    primaryColor: colorOf(m, "primaryColor"),
    secondaryColor: colorOf(m, "secondaryColor"),
    brightness: oneOf(m, "brightness", Brightnesses, Brightnesses.light),
    density: oneOf(m, "density", Densities, Densities.standard),
    fontFamily: optString(m, "fontFamily"),
    radius: typeof m["radius"] === "number" ? (m["radius"] as number) : undefined,
    config: optDict(m, "config") ?? {},
  };
}

/** `#RRGGBB` / `#AARRGGBB` (`#` optional) as a 32-bit ARGB value, else null. */
export function argbOf(color: string | undefined): number | null {
  if (color === undefined) return null;
  const hex = color.startsWith("#") ? color.slice(1) : color;
  if (!/^[0-9a-fA-F]+$/.test(hex) || (hex.length !== 6 && hex.length !== 8)) {
    return null;
  }
  const value = Number.parseInt(hex, 16);
  // `>>> 0` で符号なしに戻す。JS のビット演算は符号付き32bitなので、これを忘れると
  // 不透明色が負の数になり Dart 版と食い違う。
  return hex.length === 6 ? (0xff000000 | value) >>> 0 : value;
}

function colorOf(m: Dict, key: string): string | undefined {
  const value = optString(m, key);
  if (value === undefined) return undefined;
  if (argbOf(value) === null) {
    throw new DefinitionParseError(
      `Expected a colour like #RRGGBB, got "${value}"`,
      `app.theme.${key}`,
    );
  }
  return value;
}

function oneOf(
  m: Dict,
  key: string,
  allowed: Record<string, string>,
  orElse: string,
): string {
  const value = optString(m, key);
  if (value === undefined) return orElse;
  if (!Object.values(allowed).includes(value)) {
    throw new DefinitionParseError(
      `Expected one of ${Object.values(allowed).join(" / ")}, got "${value}"`,
      `app.theme.${key}`,
    );
  }
  return value;
}

/** A node with `group`/`items` is a group; otherwise a leaf opening a page. */
function parseMenu(m: Dict): MenuItem {
  const items = optList(m, "items");
  const roles = optList(m, "roles").map(String);
  if (items.length > 0 || m["group"] != null) {
    return {
      label: optString(m, "group") ?? optString(m, "label") ?? "",
      children: items.map((it, i) => parseMenu(asDict(it, `menu.items[${i}]`))),
      roles,
    };
  }
  return {
    id: optString(m, "id") ?? optString(m, "page"),
    label: reqString(m, "label", "menu.label"),
    icon: optString(m, "icon"),
    page: optString(m, "page"),
    children: [],
    roles,
  };
}

/** Shallow page inventory entry; full page models are not parsed here. */
function parsePageRef(m: Dict): PageRef {
  const type = reqString(m, "type", "app.pages[].type");
  return {
    id: reqString(m, "id", "app.pages[].id"),
    type,
    title: reqString(m, "title", "app.pages[].title"),
    // A dashboard reads per card, so its page-level repository is optional.
    repository:
      type === "dashboard"
        ? optString(m, "repository")
        : reqString(m, "repository", "app.pages[].repository"),
  };
}

/**
 * app 定義の画面を**中身まで**読む（画面 id → 画面）。
 *
 * [[parseAppYaml]] が返すのは [[PageRef]]（id と種別と題だけ）なので、検証を回すにも
 * 画面を描くにも足りない。**画面と同じ定義でサーバでも検証する**、がこの枠組みの
 * 主張なので、中身が読めないと主張が通らない。Web の Renderer も1枚ずつの定義が要る。
 *
 * Dart 版は `AppDefinition.pages` が最初から画面の定義そのものなので、この口は
 * TypeScript と Java にだけ在る（3版で同じものが取れる、という所は変わらない）。
 *
 * 並びは**定義に書いた順**のまま。
 */
export function parseAppPagesYaml(
  source: string,
  options?: ParseOptions,
): Record<string, PageDefinition> {
  let decoded: unknown;
  try {
    decoded = parseYamlText(source);
  } catch (error) {
    throw new DefinitionParseError(`YAML として読めません: ${String(error)}`, "app");
  }
  return parseAppPagesMap(asDict(decoded, "app"), options);
}

/** JSON から。中身は [[parseAppPagesYaml]] と同じ。 */
export function parseAppPagesJson(
  source: string,
  options?: ParseOptions,
): Record<string, PageDefinition> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch (error) {
    throw new DefinitionParseError(`JSON として読めません: ${String(error)}`, "app");
  }
  return parseAppPagesMap(asDict(decoded, "app"), options);
}

/** 既に読み込んである地図から。 */
export function parseAppPagesMap(
  rawRoot: Dict,
  options?: ParseOptions,
): Record<string, PageDefinition> {
  // **画面を読む前に app として1回通す。** `dsl_version` の門番と strict の門番は
  // 1か所でよく、「隣の画面が壊れている app」の1枚だけを読むと壊れに気づけない。
  // **渡すのは生のほう**＝strict は人が書いたものに当てる（展開後を渡すと、
  // 機械が足した列の `options` を機械が弾く）。
  fromDecoded(rawRoot, "map", options);

  // 語彙をいちばん先に展開する（`optionsOf` を実体の並びにしてから読む）。
  const root = expandVocabularies(rawRoot);
  const app = optDict(root, "app") ?? root;
  const out: Record<string, PageDefinition> = {};
  for (const [at, one] of optList(app, "pages").entries()) {
    const page = asDict(one, `app.pages[${at}]`);
    out[reqString(page, "id", `app.pages[${at}].id`)] = parsePageMap(page);
  }
  return out;
}

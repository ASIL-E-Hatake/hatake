import { parse as parseYamlText } from "yaml";
import {
  Brightnesses,
  Densities,
  kDslVersion,
  type AppDefinition,
  type MenuItem,
  type PageRef,
  type ThemeDefinition,
} from "./definition.js";
import {
  DefinitionParseError,
  UnknownKeysError,
  type ParseOptions,
} from "./parse.js";
import { findUnknownKeys } from "./strictKeys.js";

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
export function parseAppMap(root: Dict): AppDefinition {
  const dslVersion = optString(root, "dsl_version") ?? kDslVersion;
  const app = optDict(root, "app") ?? root;
  return {
    id: reqString(app, "id", "app.id"),
    title: reqString(app, "title", "app.title"),
    dslVersion,
    home: optString(app, "home"),
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

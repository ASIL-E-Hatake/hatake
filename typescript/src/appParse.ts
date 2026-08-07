import { parse as parseYamlText } from "yaml";
import { kDslVersion, type AppDefinition, type MenuItem, type PageRef } from "./definition.js";
import { DefinitionParseError } from "./parse.js";

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
export function parseAppYaml(source: string): AppDefinition {
  let decoded: unknown;
  try {
    decoded = parseYamlText(source);
  } catch (e) {
    throw new DefinitionParseError(`Invalid YAML: ${(e as Error).message}`);
  }
  return fromDecoded(decoded, "YAML");
}

/** Parse a JSON app document into an AppDefinition. */
export function parseAppJson(source: string): AppDefinition {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch (e) {
    throw new DefinitionParseError(`Invalid JSON: ${(e as Error).message}`);
  }
  return fromDecoded(decoded, "JSON");
}

function fromDecoded(decoded: unknown, format: string): AppDefinition {
  if (!isDict(decoded)) {
    throw new DefinitionParseError(`Top-level ${format} must be a mapping/object`);
  }
  return parseAppMap(decoded);
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
    menu: optList(app, "menu").map((m, i) =>
      parseMenu(asDict(m, `app.menu[${i}]`)),
    ),
    pages: optList(app, "pages").map((p, i) =>
      parsePageRef(asDict(p, `app.pages[${i}]`)),
    ),
  };
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

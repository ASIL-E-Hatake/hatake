import type { DtoMember, DtoShape, DtoSpec } from "./dto.js";

/**
 * Emits native type declarations from a [DtoSpec] — TypeScript `interface`s or
 * Java `record`s.
 *
 * Both targets are available from both editions on purpose: the output is plain
 * text, and generating it from either side lets the conformance suite check that
 * the two editions emit byte-identical source (see
 * `spec/conformance/dto_native_types.json`).
 *
 * Constraints ride in doc comments rather than validation annotations. The point
 * of native types is editor completion and compile-time safety; runtime checking
 * is already covered by `FormValidator` and the Phase 2 JSON Schema, and
 * annotations would drag `jakarta.validation` / Zod into generated code.
 */

/** What a role means to a reader of the generated code. */
const ROLE_DOC: Record<string, string> = {
  request: "サーバが受け取る形",
  response: "サーバが返す形",
  row: "一覧の1行",
  listResponse: "一覧のレスポンス",
  queryParams: "検索クエリ",
  pathParams: "パスパラメータ",
  child: "明細の1行",
};

/** Reads better than the raw key when a member has no label. */
function title(member: DtoMember): string {
  return member.label.length > 0 ? member.label : member.name;
}

function num(value: unknown): string {
  return String(value);
}

/**
 * The notes appended after the label, e.g. `必須、6文字以内`. Shared by both
 * targets so the two languages phrase things identically.
 */
function notes(member: DtoMember): string[] {
  const out: string[] = [];
  if (!member.optional) out.push("必須");

  const c = member.constraints;
  if (c.maxLength !== undefined) out.push(`${num(c.maxLength)}文字以内`);
  if (c.minLength !== undefined) out.push(`${num(c.minLength)}文字以上`);

  const min = c.minimum;
  const max = c.maximum;
  if (min !== undefined && max !== undefined) {
    out.push(`${num(min)}〜${num(max)}`);
  } else if (min !== undefined) {
    out.push(`${num(min)}以上`);
  } else if (max !== undefined) {
    out.push(`${num(max)}以下`);
  }

  switch (c.format) {
    case "date":
      out.push("date (yyyy-MM-dd)");
      break;
    case "date-time":
      out.push("date-time");
      break;
    case "time":
      out.push("time");
      break;
    case "email":
      out.push("email 形式");
      break;
    default:
      break;
  }
  if (c.pattern !== undefined) out.push(`形式: ${String(c.pattern)}`);

  if (member.readOnly) out.push("readOnly（送ってもサーバは無視）");
  if (member.computed) out.push("computed（Renderer が導出）");
  return out;
}

/** `コード — 必須、6文字以内` */
function memberDoc(member: DtoMember): string {
  const rest = notes(member);
  return rest.length === 0 ? title(member) : `${title(member)} — ${rest.join("、")}`;
}

function shapeDoc(spec: DtoSpec, shape: DtoShape): string {
  const role = ROLE_DOC[shape.role] ?? shape.role;
  return `${spec.page} — ${role}`;
}

// --------------------------------------------------------------- TypeScript

function tsType(member: DtoMember): string {
  if (member.type === "array") {
    if (member.itemType === "object" && member.shape) return `${member.shape}[]`;
    return `${member.itemType ?? "string"}[]`;
  }
  if (member.type === "object" && member.shape) return member.shape;
  return member.type;
}

/** Emits every shape as an exported `interface`. */
export function toTypeScript(spec: DtoSpec): string {
  const lines: string[] = [
    `// Generated from the hatake definition "${spec.page}". Do not edit by hand.`,
  ];
  for (const shape of spec.shapes) {
    lines.push("");
    lines.push(`/** ${shapeDoc(spec, shape)} */`);
    lines.push(`export interface ${shape.name} {`);
    for (const member of shape.members) {
      lines.push(`  /** ${memberDoc(member)} */`);
      lines.push(`  ${member.name}${member.optional ? "?" : ""}: ${tsType(member)};`);
    }
    lines.push("}");
  }
  return `${lines.join("\n")}\n`;
}

// --------------------------------------------------------------------- Java

export interface JavaOptions {
  /**
   * Package the records are declared in. Omit it to emit no `package`
   * statement — like `basePath` for OpenAPI, this is not something the DSL can
   * know.
   */
  packageName?: string;
}

function javaScalar(member: DtoMember): string {
  switch (member.type) {
    case "number":
      // BigDecimal, not Double: the DSL does not distinguish integers from
      // decimals and these are business amounts, so rounding error is the worse
      // failure. It also pairs with computeTax / computeInvoice.
      return "BigDecimal";
    case "boolean":
      return "Boolean";
    default:
      // Dates stay strings: JSON has no date type, so this is what actually
      // arrives. The format lives in the doc comment and in the JSON Schema.
      return "String";
  }
}

function javaType(member: DtoMember): string {
  if (member.type === "array") {
    if (member.itemType === "object" && member.shape) {
      return `List<${member.shape}>`;
    }
    const item: DtoMember = { ...member, type: member.itemType ?? "string" };
    return `List<${javaScalar(item)}>`;
  }
  if (member.type === "object" && member.shape) return member.shape;
  return javaScalar(member);
}

/**
 * Emits every shape as a `record`, **one file per record** keyed by file name.
 *
 * Java allows only one public top-level type per file, so a single blob would not
 * compile. Each file carries its own package statement and only the imports it
 * actually needs.
 */
export function toJavaRecords(
  spec: DtoSpec,
  options: JavaOptions = {},
): Record<string, string> {
  const files: Record<string, string> = {};

  for (const shape of spec.shapes) {
    const types = shape.members.map((m) => javaType(m));
    const needsList = types.some((t) => t.startsWith("List<"));
    const needsBigDecimal = types.some((t) => t.includes("BigDecimal"));

    const lines: string[] = [];
    if (options.packageName !== undefined) {
      lines.push(`package ${options.packageName};`);
      lines.push("");
    }
    if (needsBigDecimal) lines.push("import java.math.BigDecimal;");
    if (needsList) lines.push("import java.util.List;");
    if (needsBigDecimal || needsList) lines.push("");
    lines.push(
      `// Generated from the hatake definition "${spec.page}". Do not edit by hand.`,
    );
    lines.push(`/** ${shapeDoc(spec, shape)}。 */`);
    lines.push(`public record ${shape.name}(`);
    shape.members.forEach((member, index) => {
      const last = index === shape.members.length - 1;
      lines.push(`        /** ${memberDoc(member)} */`);
      lines.push(
        `        ${javaType(member)} ${member.name}${last ? ") {" : ","}`,
      );
    });
    if (shape.members.length === 0) lines.push(") {");
    lines.push("}");

    files[`${shape.name}.java`] = `${lines.join("\n")}\n`;
  }
  return files;
}

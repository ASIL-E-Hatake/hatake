import type { FormatterRegistry } from "@hatake-fw/api";
import type { PageDefinition } from "@hatake-fw/api";
import type { ReactNode } from "react";

import { HatakeDetailPage, HatakeFormPage, HatakeWizardPage } from "./pages/form.js";
import { HatakeCrudPage, HatakeSearchPage } from "./pages/list.js";
import { HatakeDashboardPage, HatakeReportPage } from "./pages/panel.js";

/**
 * 画面1枚。**定義の `kind` で出し分けるだけ**で、ここに業務の判断は無い。
 *
 * ```tsx
 * <HatakeScope registries={registries}>
 *   <HatakePage definition={definition} />
 * </HatakeScope>
 * ```
 *
 * 知らない `kind` は**黙って何も出さずに終わらせない**。プラグインで足した画面が
 * 描かれていないとき、白い画面だけを見せられても原因に辿り着けない。
 */
export function HatakePage(props: {
  definition: PageDefinition;
  /** 1件を指す鍵（`detail` / `form` / `wizard` を開くとき）。 */
  recordKey?: unknown;
  /** いま見ている人の役割（列の出し分けに使う）。 */
  roles?: readonly string[];
  formatters?: FormatterRegistry;
}): ReactNode {
  const one = props.definition;
  const shared = { roles: props.roles, formatters: props.formatters };

  switch (one.kind) {
    case "search":
      return <HatakeSearchPage definition={one} {...shared} />;
    case "crud":
    case "master":
      return <HatakeCrudPage definition={one} {...shared} />;
    case "detail":
      return <HatakeDetailPage definition={one} recordKey={props.recordKey} formatters={props.formatters} />;
    case "form":
      return <HatakeFormPage definition={one} recordKey={props.recordKey} />;
    case "wizard":
      return <HatakeWizardPage definition={one} recordKey={props.recordKey} />;
    case "dashboard":
      return <HatakeDashboardPage definition={one} formatters={props.formatters} />;
    case "report":
      return <HatakeReportPage definition={one} formatters={props.formatters} />;
    default:
      return (
        <p className="hatake-field-message" role="alert" data-hatake="page:unknown">
          描き方を知らない画面です: kind = {String((one as { kind: string }).kind)}
        </p>
      );
  }
}

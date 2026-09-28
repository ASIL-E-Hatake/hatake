import { FormatterRegistry } from "@hatake-fw/api";
import type { PageDefinition } from "@hatake-fw/api";
import { defineComponent, h, type PropType } from "vue";

import { HatakeDetailPage, HatakeFormPage, HatakeWizardPage } from "./pages/form.js";
import { HatakeCrudPage, HatakeSearchPage } from "./pages/list.js";
import { HatakeDashboardPage, HatakeReportPage } from "./pages/panel.js";

/**
 * 画面1枚。**定義の `kind` で出し分けるだけ**で、ここに業務の判断は無い。
 *
 * ```ts
 * h(HatakeScope, { registries }, () => h(HatakePage, { definition }))
 * ```
 *
 * 知らない `kind` は**黙って何も出さずに終わらせない**。プラグインで足した画面が
 * 描かれていないとき、白い画面だけを見せられても原因に辿り着けない。
 */
export const HatakePage = defineComponent({
  name: "HatakePage",
  props: {
    definition: { type: Object as PropType<PageDefinition>, required: true },
    /** 1件を指す鍵（`detail` / `form` / `wizard` を開くとき）。 */
    recordKey: { type: null as unknown as PropType<unknown>, default: undefined },
    /** いま見ている人の役割（列の出し分けに使う）。 */
    roles: { type: Array as PropType<readonly string[]>, default: () => [] },
    formatters: { type: Object as PropType<FormatterRegistry>, default: () => new FormatterRegistry() },
  },
  setup(props, { emit, attrs }) {
    return () => {
      const one = props.definition;
      const shared = { roles: props.roles, formatters: props.formatters, ...attrs };

      switch (one.kind) {
        case "search":
          return h(HatakeSearchPage, { definition: one, ...shared });
        case "crud":
        case "master":
          return h(HatakeCrudPage, { definition: one, ...shared });
        case "detail":
          return h(HatakeDetailPage, { definition: one, recordKey: props.recordKey, ...shared });
        case "form":
          return h(HatakeFormPage, { definition: one, recordKey: props.recordKey, ...shared });
        case "wizard":
          return h(HatakeWizardPage, { definition: one, recordKey: props.recordKey, ...shared });
        case "dashboard":
          return h(HatakeDashboardPage, { definition: one, ...shared });
        case "report":
          return h(HatakeReportPage, { definition: one, ...shared });
        default:
          return h(
            "p",
            { class: "hatake-field-message", role: "alert", "data-hatake": "page:unknown" },
            `描き方を知らない画面です: kind = ${String((one as { kind: string }).kind)}`,
          );
      }
    };
  },
});

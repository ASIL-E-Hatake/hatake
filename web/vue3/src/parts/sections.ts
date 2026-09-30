import type { FieldDefinition } from "@hatake-fw/api/internal";
import type { VisibleSection } from "@hatake-fw/runtime";
import { h, type VNode } from "vue";

/**
 * 区画ごとに並べる（題と、その人に見せる項目）。**どれを出すかは土台**
 * （`visibleSections`）が決めていて、ここは題を置いて項目を並べるだけ。
 */
export function sectionNodes(
  sections: readonly VisibleSection[],
  render: (field: FieldDefinition) => VNode | null,
): VNode[] {
  return sections.map((section, at) =>
    h("div", { key: at, class: "hatake-section" }, [
      section.title === undefined ? null : h("h3", { class: "hatake-section-title" }, section.title),
      ...section.fields.map(render),
    ]),
  );
}

import type { FieldDefinition } from "@hatake-fw/api/internal";
import type { VisibleSection } from "@hatake-fw/runtime";
import { Fragment, type ReactNode } from "react";

/**
 * 区画ごとに並べる（題と、その人に見せる項目）。**どれを出すかは土台**
 * （`visibleSections`）が決めていて、ここは題を置いて項目を並べるだけ。Vue 版と同じ。
 */
export function Sections(props: {
  sections: readonly VisibleSection[];
  render: (field: FieldDefinition) => ReactNode;
}): ReactNode {
  return props.sections.map((section, at) => (
    <div key={at} className="hatake-section">
      {section.title === undefined ? null : <h3 className="hatake-section-title">{section.title}</h3>}
      {section.fields.map((field) => (
        <Fragment key={field.field}>{props.render(field)}</Fragment>
      ))}
    </div>
  ));
}

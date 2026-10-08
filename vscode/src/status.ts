// 状態バーに出す版の話。**物差しは doctor の1つ**（拡張機能で別に数えない）。
//
// 拡張機能は枠組みを同梱しているので、走っている道具の版＝拡張機能の版。案件が固定した版と
// 違えば、ホバーの説明や問題の一覧が案件の版と違うことがある（doctor が言うのと同じ話）。

export interface VersionStatus {
  text: string;
  tooltip: string;
  /** 案件の版と違う（目立たせる）。 */
  differs: boolean;
}

interface DoctorReport {
  tool: { version: string };
  versions: { file: string; what: string; version: string; kind: "pinned" | "installed" }[];
}

export function versionStatus(report: DoctorReport): VersionStatus {
  const tool = report.tool.version;
  const pinned = [...new Set(report.versions.filter((one) => one.kind === "pinned").map((one) => one.version))];
  if (pinned.length === 0) {
    return { text: `hatake ${tool}`, tooltip: `拡張機能に入っている hatake は ${tool}（案件の固定した版は見つかりませんでした）。`, differs: false };
  }
  if (pinned.length === 1 && pinned[0] === tool) {
    return { text: `hatake ${tool}`, tooltip: `拡張機能と案件の版がそろっています（${tool}）。`, differs: false };
  }
  return {
    text: `hatake ${tool} ≠ 案件 ${pinned.join(" / ")}`,
    tooltip:
      `拡張機能に入っている hatake は ${tool}、案件が固定しているのは ${pinned.join(" / ")} です。` +
      "問題の一覧やホバーの説明が、案件の版と違うことがあります（拡張機能を案件の版に合わせてください）。",
    differs: true,
  };
}

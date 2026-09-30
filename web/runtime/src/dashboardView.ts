import { FormatterRegistry } from "@hatake-fw/api";
import type { AggregateBucket, DashboardItemDefinition, DashboardPageDefinition } from "@hatake-fw/api/internal";
import { ChartKinds } from "@hatake-fw/api/internal";

/**
 * ダッシュボードの**見せ方の決めごと**。数字も幅も定義から出るので、Vue と React で
 * 別々に計算すると必ず食い違う ——だから土台に置く。Flutter 版の
 * `dashboard_page.dart` / `dashboard_chart.dart` と同じ規則。
 *
 * Renderer はここが返した数と形をそのまま描くだけ。
 */

/** カードどうしの間（px）。Flutter の `_gap` と同じ。 */
export const DASHBOARD_GAP = 12;

/**
 * カード1枚の最小幅（px）。これが**2枚並ばない幅**になったら1列に畳む。
 * Flutter の `_minCardWidth` と同じ数。
 */
export const MIN_CARD_WIDTH = 260;

/** 並べる列の数（`layout.columns`）。1未満は1。 */
export function dashboardColumns(definition: DashboardPageDefinition): number {
  return definition.columns < 1 ? 1 : definition.columns;
}

/**
 * そのカードが占める列の数（`span`）。**列の数を超えない**（超えた分は折り返す
 * のではなく、1段まるごと使う）。
 */
export function cardSpan(item: DashboardItemDefinition, columns: number): number {
  if (item.span < 1) return 1;
  return item.span > columns ? columns : item.span;
}

/**
 * カードに出す1つの数の字。
 *
 * **カードの `format` を通す**（`currency` と書けば ¥6,480）。書いていなければ素の字。
 * 定まらない（null）ときは `—` —— `0` と出すと、事故と「本当に0件」が混ざる。
 */
export function dashboardValueText(
  formatters: FormatterRegistry,
  item: DashboardItemDefinition,
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  return item.format === undefined ? String(value) : formatters.format(item.format, value, item.config);
}

// ── 図 ─────────────────────────────────────────────────────────

/** 図の大きさ（SVG の viewBox）。Renderer はこれを幅いっぱいに伸ばす。 */
export const CHART_WIDTH = 600;
export const CHART_HEIGHT = 220;

/** 値の字を置く高さ・ラベルを置く高さ。Flutter の painter と同じ。 */
const VALUE_HEIGHT = 14;
const LABEL_HEIGHT = 16;

/** 棒1本。色は**番号**で返す（何色にするかは CSS の `--hatake-chart-N`）。 */
export interface ChartBar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly center: number;
  readonly label: string;
  readonly valueText: string;
  readonly colorIndex: number;
}

/** 折れ線の点1つ。 */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly valueText: string;
}

/** 円の切れ1つ（SVG の path）。 */
export interface ChartSlice {
  readonly path: string;
  readonly label: string;
  readonly valueText: string;
  readonly colorIndex: number;
}

/** 描くものぜんぶ。**知らない種類は `unsupported`**（黙って空にしない）。 */
export type ChartShape =
  | { readonly kind: "bar"; readonly baseline: number; readonly labelY: number; readonly bars: readonly ChartBar[] }
  | { readonly kind: "line"; readonly baseline: number; readonly labelY: number; readonly points: readonly ChartPoint[] }
  | { readonly kind: "pie"; readonly slices: readonly ChartSlice[] }
  | { readonly kind: "empty" }
  | { readonly kind: "unsupported"; readonly name: string };

/** 図に出す色の数（`--hatake-chart-1` 〜 `-6` を回す）。 */
export const CHART_COLORS = 6;

/**
 * 棒・折れ線が共有する値の幅。**必ず 0 を含む**＝どの図でも底の線が同じ意味になる
 * （Flutter の `_valueRange` と同じ）。全部 0 でも高さは要るので、そのときは 0〜1。
 */
function valueRange(buckets: readonly AggregateBucket[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const one of buckets) {
    const value = one.value ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) max = min + 1;
  return { min, max };
}

/**
 * 図の形を組む。値の字は `valueText`（カードの `format` を通したもの）で出す。
 *
 * 座標は viewBox（`CHART_WIDTH` × `CHART_HEIGHT`）の中。Renderer は `<svg>` に
 * 置くだけで、ここで決めた以上のことはしない。
 */
export function chartShape(
  kind: string,
  buckets: readonly AggregateBucket[],
  valueText: (value: number | null) => string,
): ChartShape {
  if (buckets.length === 0) return { kind: "empty" };

  if (kind === ChartKinds.pie) {
    const total = buckets.reduce((sum, one) => sum + Math.max(0, one.value ?? 0), 0);
    if (total <= 0) return { kind: "empty" };
    const cx = CHART_HEIGHT / 2;
    const cy = CHART_HEIGHT / 2;
    const r = CHART_HEIGHT / 2 - 8;
    let angle = -Math.PI / 2; // 12時から回す
    const slices = buckets.map((one, at) => {
      const share = Math.max(0, one.value ?? 0) / total;
      const start = angle;
      const end = angle + share * Math.PI * 2;
      angle = end;
      // 1つで全部なら円そのもの（弧で描くと始点と終点が重なって消える）。
      const path =
        share >= 0.9999
          ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
          : `M ${cx} ${cy} L ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)} ` +
            `A ${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)} Z`;
      return { path, label: one.label, valueText: valueText(one.value), colorIndex: at % CHART_COLORS };
    });
    return { kind: "pie", slices };
  }

  if (kind !== ChartKinds.bar && kind !== ChartKinds.line) return { kind: "unsupported", name: kind };

  const range = valueRange(buckets);
  const plotTop = VALUE_HEIGHT;
  const plotBottom = CHART_HEIGHT - LABEL_HEIGHT;
  const scale = (plotBottom - plotTop) / (range.max - range.min);
  const baseline = plotBottom - (0 - range.min) * scale;
  const labelY = CHART_HEIGHT - 3;
  const slot = CHART_WIDTH / buckets.length;

  if (kind === ChartKinds.line) {
    const points = buckets.map((one, at) => ({
      x: slot * at + slot / 2,
      y: plotBottom - ((one.value ?? 0) - range.min) * scale,
      label: one.label,
      valueText: valueText(one.value),
    }));
    return { kind: "line", baseline, labelY, points };
  }

  const width = slot * 0.6;
  const bars = buckets.map((one, at) => {
    const y = plotBottom - ((one.value ?? 0) - range.min) * scale;
    const center = slot * at + slot / 2;
    return {
      x: center - width / 2,
      // 負の値は底の線より下に伸ばす。
      y: Math.min(y, baseline),
      width,
      height: Math.abs(baseline - y),
      center,
      label: one.label,
      valueText: valueText(one.value),
      colorIndex: at % CHART_COLORS,
    };
  });
  return { kind: "bar", baseline, labelY, bars };
}

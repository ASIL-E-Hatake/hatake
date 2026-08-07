package io.hatake.core;

/**
 * 帳票のコントロールブレイク: {@code field} の値が変わったら新しいグループ。
 *
 * <p>グループは「<b>連続する</b>同値」なので、行は先に並んでいる必要がある
 * （並べ替えは Repository の責務）。同じ値が離れて2回出れば2グループになる。
 *
 * @param field グループを切る項目名
 * @param label 見出しに出すラベル
 * @param pageBreak このグループが変わるたびに改ページするか
 */
public record ReportGroup(String field, String label, boolean pageBreak) {
}

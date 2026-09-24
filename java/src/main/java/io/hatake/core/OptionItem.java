package io.hatake.core;

/**
 * 選択肢1つ（コードと、人に見せる名前）。
 *
 * <p><b>なぜサーバ側にも要るのか。</b>業務のマスタはコードで持って名前で見せます
 * （{@code shipped} → 出荷済）。画面はそれを {@code options} から引いて出しますが、
 * CSV の書き出しは「3版で同じ文字列になること」を conformance で約束しているので、
 * <b>サーバ側も同じ語彙を知っていないと同じ字にできません</b>。実際、0.9.2 で
 * 「コードではなく名前を出す」を入れたとき Java 版にはこの型が無く、画面には
 * 「出荷済」、同じ画面から落とした CSV には {@code shipped} が並んでいました。
 *
 * @param value 保存されている値（コード）。YAML の {@code 10} と REST の {@code "10"}
 *     を同じものとして比べるので、型は固定しない
 * @param label 人に見せる名前
 */
public record OptionItem(Object value, String label) {
}

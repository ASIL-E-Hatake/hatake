package io.hatake.core;

import java.util.regex.Pattern;

/**
 * DSL の版（{@code dsl_version}）の受け取り方。<b>3版で同じ</b>
 * （{@code spec/conformance/dsl_version.json} が正）。
 *
 * <p>ここは<b>公開すると直せなくなる</b>決めごとなので、公開の前に決める。いちばん怖いのは
 * 「知らない版を黙って今の版として読む」ことで、将来 2.0 を出したとき、世に出た 1.x の
 * 道具が 2.0 の定義を<b>画面は出るのに意味が違う</b>形で読む。しかも読めてしまうので、
 * 誰も気づけない。だから知らない major は<b>落とす</b>（警告にしない＝警告は読まれない）。
 *
 * <p>決めごと4つ:
 * <ul>
 *   <li><b>知らない major は落とす。</b> 通すと黙って別の意味で読む</li>
 *   <li><b>同じ major の新しい minor は読む。</b> minor は「足すだけ」と決めているので、
 *       読める所までは読める。読めないキーは strict の担当（二重に言わない）</li>
 *   <li><b>形が違うものは推し量らない。</b> {@code 1} を {@code 1.0} と読むと、次に
 *       {@code 1} の意味を決められなくなる。前後の空白も削らない</li>
 *   <li><b>書いていないのは通す。</b> 既定は現在の版</li>
 * </ul>
 */
public final class DslVersion {

    /** この実装が読める版。 */
    public static final String CURRENT = "1.0";

    private static final Pattern FORM = Pattern.compile("^[0-9]+\\.[0-9]+$");

    private DslVersion() {}

    /** 判定の印。文面は版ごとの言葉でよいが、<b>印は3版で一致する</b>。 */
    public enum Kind {
        DEFAULT("default"),
        SAME("same"),
        OLDER_MINOR("older-minor"),
        NEWER_MINOR("newer-minor"),
        UNKNOWN_MAJOR("unknown-major"),
        MALFORMED("malformed");

        private final String wireName;

        Kind(String wireName) {
            this.wireName = wireName;
        }

        /** 共有フィクスチャに書いてある印の字。 */
        public String wireName() {
            return wireName;
        }
    }

    /** 判定1つ。{@code version} は落とすときも、書いてあった字をそのまま持つ。 */
    public record Verdict(String version, Kind kind) {
        /** 解析を落とすか。 */
        public boolean fatal() {
            return kind == Kind.UNKNOWN_MAJOR || kind == Kind.MALFORMED;
        }

        /** 通すが1件言うか（{@code dsl-version-newer}）。 */
        public boolean warn() {
            return kind == Kind.NEWER_MINOR;
        }
    }

    private static int major(String v) {
        return Integer.parseInt(v.substring(0, v.indexOf('.')));
    }

    private static int minor(String v) {
        return Integer.parseInt(v.substring(v.indexOf('.') + 1));
    }

    /**
     * {@code dsl_version} に書いてあった字（無ければ {@code null}）を判定する。
     *
     * <p><b>落とすかどうかは呼び出し側が決める</b>（解析は例外、検証は警告、という形が
     * 違うだけで判定は1つ）。
     */
    public static Verdict check(String raw) {
        if (raw == null) {
            return new Verdict(CURRENT, Kind.DEFAULT);
        }
        if (!FORM.matcher(raw).matches()) {
            return new Verdict(raw, Kind.MALFORMED);
        }
        if (major(raw) != major(CURRENT)) {
            return new Verdict(raw, Kind.UNKNOWN_MAJOR);
        }
        if (minor(raw) > minor(CURRENT)) {
            return new Verdict(raw, Kind.NEWER_MINOR);
        }
        return new Verdict(raw, minor(raw) == minor(CURRENT) ? Kind.SAME : Kind.OLDER_MINOR);
    }

    /** 落とすときの文（3版で同じことを言う）。 */
    public static String message(Verdict verdict) {
        if (verdict.kind() == Kind.UNKNOWN_MAJOR) {
            return "dsl_version \"" + verdict.version() + "\" はこの版では読めません"
                    + "（読めるのは " + major(CURRENT) + ".x）。"
                    + "別の版の定義を今の版として読むと、画面は出るのに意味が変わります。";
        }
        return "dsl_version \"" + verdict.version() + "\" の書き方が違います"
                + "（\"" + CURRENT + "\" のように <major>.<minor> で書いてください）。";
    }

    /** 読める版だけを返す（読めない版は落とす）。 */
    public static String accept(Object raw) {
        Verdict verdict = check(raw instanceof String s ? s : null);
        if (verdict.fatal()) {
            throw new IllegalArgumentException(message(verdict));
        }
        return verdict.version();
    }
}

package io.hatake.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 定義を<b>動かして</b>答えを見る（シナリオ）。サーバ側で回す版。
 *
 * <p>{@code hatake run} / Dart の {@code ScenarioRunner} と同じもの。同じシナリオの
 * ファイルを画面の試験・道具・サーバの試験で回せる＝<b>案件のシナリオで3つが同じ答えを
 * 出すこと</b>を確かめられる。組み込みの検証・計算が3版で一致することは収束テストで
 * 縛ってあるが、案件ごとの定義とデータで確かめる道はこれしかない。
 *
 * <p>答えの作り方は画面と同じ順（ここがズレると、道具の答えが嘘になる）:
 *
 * <ol>
 *   <li>{@code normalize} を当てる（保存前に整える）</li>
 *   <li>{@code computed} を<b>宣言順に1回</b>当てる（明細の行の中が先、次に親の項目）</li>
 *   <li>状態を見る（隠れている項目・いま必須の項目）</li>
 *   <li>検証する（隠れている項目は検証しない＝画面と同じ規則）</li>
 * </ol>
 *
 * <p><b>押せるボタンは答えない。</b> サーバ側の {@link PageDefinition} は
 * {@code actions} を読まない（押したときの処理は画面の側にしかない）。聞かれたら
 * {@link Answer#cannot()} でそう言う＝値を作らない。
 *
 * <p>TypeScript / Dart 版と同じ答えになることは
 * {@code spec/conformance/scenario.json} で固定している。
 */
public final class ScenarioRunner {

    /** 確かめたいこと。<b>書いた欄だけ</b>見る（全部書かなくていい）。 */
    public record Expectation(
            List<FormValidator.ValidationError> errors,
            Map<String, Object> computed,
            Map<String, Boolean> enabled,
            List<String> hidden,
            List<String> required) {

        /** シナリオのファイル（JSON）から読む。書いていない欄は null。 */
        @SuppressWarnings("unchecked")
        public static Expectation fromMap(Map<String, Object> map) {
            if (map == null) {
                return null;
            }
            List<FormValidator.ValidationError> errors = null;
            if (map.get("errors") instanceof List<?> raw) {
                errors = new ArrayList<>();
                for (Object one : raw) {
                    Map<String, Object> e = (Map<String, Object>) one;
                    errors.add(new FormValidator.ValidationError(
                            String.valueOf(e.get("field")),
                            String.valueOf(e.get("message"))));
                }
            }
            return new Expectation(
                    errors,
                    (Map<String, Object>) map.get("computed"),
                    (Map<String, Boolean>) map.get("enabled"),
                    (List<String>) map.get("hidden"),
                    (List<String>) map.get("required"));
        }
    }

    /** シナリオ1件（「この値を入れたら、こうなる」）。 */
    public record Case(
            String name, Map<String, Object> record, String mode, Expectation expect) {

        @SuppressWarnings("unchecked")
        public static Case fromMap(Map<String, Object> map) {
            Map<String, Object> record = map.get("record") instanceof Map<?, ?> m
                    ? (Map<String, Object>) m
                    : Map.of();
            return new Case(
                    String.valueOf(map.get("name")),
                    record,
                    (String) map.get("mode"),
                    Expectation.fromMap((Map<String, Object>) map.get("expect")));
        }
    }

    /** 1件を動かした答え。 */
    public record Answer(
            Map<String, Object> record,
            Map<String, Object> computed,
            List<FormValidator.ValidationError> errors,
            List<String> hidden,
            List<String> required,
            List<String> cannot) {
    }

    /** 期待と答えの食い違い1つ。 */
    public record Mismatch(String at, Object expected, Object actual) {

        @Override
        public String toString() {
            return at + ": 期待 " + expected + " / 実際 " + actual;
        }
    }

    /** 1件の結果（{@link #mismatches} が空なら通った）。 */
    public record Result(String name, Answer answer, List<Mismatch> mismatches) {

        public boolean passed() {
            return mismatches.isEmpty();
        }
    }

    private final ValidatorRegistry validators;
    private final Computed computeds;
    private final ConverterRegistry converters;

    public ScenarioRunner() {
        this(new ValidatorRegistry(), new Computed(), new ConverterRegistry());
    }

    public ScenarioRunner(
            ValidatorRegistry validators, Computed computeds, ConverterRegistry converters) {
        this.validators = validators == null ? new ValidatorRegistry() : validators;
        this.computeds = computeds == null ? new Computed() : computeds;
        this.converters = converters == null ? new ConverterRegistry() : converters;
    }

    /** シナリオを全件動かす。 */
    public List<Result> run(PageDefinition page, List<Case> cases) {
        List<Result> results = new ArrayList<>();
        for (Case one : cases) {
            Answer answer = runCase(page, one);
            results.add(new Result(one.name(), answer, compare(one.expect(), answer)));
        }
        return results;
    }

    /** 1件を動かして答えを作る。 */
    public Answer runCase(PageDefinition page, Case one) {
        List<String> cannot = new ArrayList<>();
        if (one.expect() != null && one.expect().enabled() != null) {
            cannot.add("押せるボタンは、サーバ側では答えません"
                    + "（押したときの処理は画面の側にしかないので、定義の actions を読みません）。");
        }
        FormDefinition form = page.form();
        if (form == null) {
            cannot.add(page.type() + " の画面には入力の枠（form）がないので、入れる値がありません。");
            return new Answer(new LinkedHashMap<>(one.record()), Map.of(), List.of(),
                    List.of(), List.of(), cannot);
        }

        Map<String, Object> normalized =
                new FormNormalizer(converters).normalize(form, one.record());
        Map<String, Object> computedValues = new LinkedHashMap<>();
        Map<String, Object> record = applyComputed(form, normalized, computedValues, cannot);
        Set<String> hidden = hidden(form, record, one.mode());
        List<String> required = required(form, record, one.mode(), hidden);

        for (FieldDefinition field : form.fields()) {
            for (ValidatorDefinition rule : field.validators()) {
                if (!validators.has(rule.type())) {
                    cannot.add("「" + field.label() + "」の検証（type: " + rule.type()
                            + "）は登録がありません。その規則は回していません。");
                }
            }
        }

        List<FormValidator.ValidationError> errors =
                new FormValidator(validators).validate(form, record, one.mode()).errors();
        return new Answer(record, computedValues, errors,
                new ArrayList<>(hidden), required, cannot);
    }

    /**
     * 計算を<b>宣言順に1回</b>当てた写し。明細の行の中を先に当てる（親が行を畳むので）。
     *
     * <p>登録が無い {@code op} は<b>当てない</b>＝値を作らない（作ると「計算した結果が
     * 空」と読めてしまう）。
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> applyComputed(
            FormDefinition form,
            Map<String, Object> source,
            Map<String, Object> computedValues,
            List<String> cannot) {
        Map<String, Object> out = new LinkedHashMap<>(source);

        for (FieldDefinition field : form.fields()) {
            if (!field.isSubTable() || field.hasSubTableSource()) {
                continue;
            }
            if (!(out.get(field.field()) instanceof List<?> rows)) {
                continue;
            }
            List<Object> next = new ArrayList<>();
            for (Object raw : rows) {
                if (!(raw instanceof Map<?, ?> row)) {
                    next.add(raw);
                    continue;
                }
                Map<String, Object> copy = new LinkedHashMap<>((Map<String, Object>) row);
                for (FieldDefinition rowField : field.rowFields()) {
                    if (rowField.computed() == null || !known(rowField, cannot)) {
                        continue;
                    }
                    copy.put(rowField.field(), computeds.compute(rowField.computed(), copy));
                }
                next.add(copy);
            }
            out.put(field.field(), next);
        }

        for (FieldDefinition field : form.fields()) {
            if (field.computed() == null) {
                continue;
            }
            if (field.isSubTable() && field.hasSubTableSource()) {
                cannot.add("「" + field.label() + "」は別のテーブルに持つ明細（source つき）"
                        + "なので、行はここにありません（畳めません）。");
                continue;
            }
            if (!known(field, cannot)) {
                continue;
            }
            Object value = computeds.compute(field.computed(), out);
            out.put(field.field(), value);
            computedValues.put(field.field(), value);
        }
        return out;
    }

    /** その計算の {@code op} が登録されているか。無ければ理由を残して当てない。 */
    private boolean known(FieldDefinition field, List<String> cannot) {
        Object op = field.computed().get("op");
        if (!(op instanceof String name)) {
            return false;
        }
        if (computeds.has(name)) {
            return true;
        }
        cannot.add("「" + field.label() + "」の計算（op: " + name
                + "）は登録がありません。値は出しません。");
        return false;
    }

    /** 隠れている項目（項目の {@code visibleWhen} ／その枠の {@code visibleWhen}）。 */
    private static Set<String> hidden(
            FormDefinition form, Map<String, Object> record, String mode) {
        Set<String> hidden = new LinkedHashSet<>();
        for (SectionDefinition section : form.sections()) {
            boolean sectionShown = matches(section.visibleWhen(), record, mode);
            for (FieldDefinition field : section.fields()) {
                if (!sectionShown || !matches(field.visibleWhen(), record, mode)) {
                    hidden.add(field.field());
                }
            }
        }
        return hidden;
    }

    /** いま必須の項目（<b>隠れている項目は数えない</b>＝検証と同じ規則）。 */
    private static List<String> required(
            FormDefinition form, Map<String, Object> record, String mode, Set<String> hidden) {
        List<String> required = new ArrayList<>();
        for (FieldDefinition field : form.fields()) {
            if (hidden.contains(field.field())) {
                continue;
            }
            boolean byCondition = field.requiredWhen() != null
                    && ConditionEvaluator.evaluate(field.requiredWhen(), record, mode);
            if (field.required() || byCondition) {
                required.add(field.field());
            }
        }
        return required;
    }

    private static boolean matches(
            Map<String, Object> condition, Map<String, Object> record, String mode) {
        return condition == null || ConditionEvaluator.evaluate(condition, record, mode);
    }

    /**
     * 期待と答えを比べる。<b>書いた欄だけ</b>見る。
     *
     * <ul>
     *   <li>{@code errors} … 順不同で<b>完全一致</b>（「これだけ出る」が意味を持つ）</li>
     *   <li>{@code computed} … 書いた<b>キーだけ</b></li>
     *   <li>{@code hidden} / {@code required} … 書いたものが<b>入っていること</b></li>
     *   <li>{@code enabled} … <b>見ない</b>（サーバ側は答えないので、答えの無いものを
     *       食い違いにすると全件落ちる。答えないことは {@link Answer#cannot()} で言う）</li>
     * </ul>
     */
    public static List<Mismatch> compare(Expectation expect, Answer answer) {
        List<Mismatch> found = new ArrayList<>();
        if (expect == null) {
            return found;
        }
        if (expect.errors() != null) {
            Set<String> wanted = new HashSet<>();
            for (FormValidator.ValidationError e : expect.errors()) {
                wanted.add(e.field() + "=" + e.message());
            }
            Set<String> actual = new HashSet<>();
            for (FormValidator.ValidationError e : answer.errors()) {
                actual.add(e.field() + "=" + e.message());
            }
            if (!wanted.equals(actual)) {
                found.add(new Mismatch("errors", sorted(wanted), sorted(actual)));
            }
        }
        if (expect.computed() != null) {
            for (Map.Entry<String, Object> entry : expect.computed().entrySet()) {
                Object actual = answer.computed().get(entry.getKey());
                if (!same(entry.getValue(), actual)) {
                    found.add(new Mismatch(
                            "computed." + entry.getKey(), entry.getValue(), actual));
                }
            }
        }
        for (String name : expect.hidden() == null ? List.<String>of() : expect.hidden()) {
            if (!answer.hidden().contains(name)) {
                found.add(new Mismatch("hidden." + name, true, false));
            }
        }
        for (String name : expect.required() == null ? List.<String>of() : expect.required()) {
            if (!answer.required().contains(name)) {
                found.add(new Mismatch("required." + name, true, false));
            }
        }
        return found;
    }

    private static List<String> sorted(Set<String> values) {
        List<String> out = new ArrayList<>(values);
        Collections.sort(out);
        return out;
    }

    /**
     * 同じ値か。数は型の違いを見ない（JSON から読んだ {@code 1150} と、計算した
     * {@code 1150.0} を別物にしない）。
     */
    private static boolean same(Object a, Object b) {
        if (a instanceof Number x && b instanceof Number y) {
            return x.doubleValue() == y.doubleValue();
        }
        return a == null ? b == null : a.equals(b);
    }
}

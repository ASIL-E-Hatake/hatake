package io.hatake.core;

import java.util.List;
import java.util.Map;

/**
 * フォームの1区画。
 *
 * <p>{@code visibleWhen} があると区画ごと出し分ける（「法人のときだけ請求先の枠を出す」）。
 * 隠れている区画の項目は {@link FormValidator} も検証しない＝入力できないものは求めない。
 */
public record SectionDefinition(
        String title,
        List<FieldDefinition> fields,
        Map<String, Object> visibleWhen) {

    /** 条件を持たない普通の区画。 */
    public SectionDefinition(String title, List<FieldDefinition> fields) {
        this(title, fields, null);
    }
}

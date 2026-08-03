package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FormatTest {

    final FormatterRegistry fmt = new FormatterRegistry();
    final ConverterRegistry conv = new ConverterRegistry();

    @Test
    void currency() {
        assertEquals("1,234,567", fmt.format("currency", 1234567));
        assertEquals("¥1,234.00", fmt.format("currency", 1234, Map.of("symbol", "¥", "decimals", 2)));
        assertEquals("△1,234", fmt.format("currency", -1234, Map.of("negative", "triangle")));
        assertEquals("▲1,234", fmt.format("currency", -1234, Map.of("negative", "blackTriangle")));
        assertEquals("(1,234)", fmt.format("currency", -1234, Map.of("negative", "paren")));
        assertEquals("-1,234", fmt.format("currency", -1234));
    }

    @Test
    void percent() {
        assertEquals("12.34%", fmt.format("percent", 12.34));
        assertEquals("12%", fmt.format("percent", 12, Map.of("decimals", 0)));
        assertEquals("12.34%", fmt.format("percent", 0.1234, Map.of("ratio", true, "decimals", 2)));
    }

    @Test
    void date() {
        Object d = LocalDate.of(2026, 7, 22);
        assertEquals("2026/07/22", fmt.format("date", d));
        assertEquals("2026-07-22", fmt.format("date", d, Map.of("pattern", "yyyy-MM-dd")));
        assertEquals("2026年7月22日", fmt.format("date", d, Map.of("pattern", "yyyy年M月d日")));
        assertEquals("20260722", fmt.format("date", "2026-07-22", Map.of("pattern", "yyyyMMdd")));
    }

    @Test
    void wareki() {
        assertEquals("令和8年7月22日", fmt.format("wareki", LocalDate.of(2026, 7, 22)));
        assertEquals("R8/07/22", fmt.format("wareki", LocalDate.of(2026, 7, 22), Map.of("style", "short")));
        assertEquals("令和元年5月1日", fmt.format("wareki", LocalDate.of(2019, 5, 1)));
        assertEquals("平成31年4月30日", fmt.format("wareki", LocalDate.of(2019, 4, 30)));
    }

    @Test
    void postalAndMask() {
        assertEquals("123-4567", fmt.format("postal", "1234567"));
        assertEquals("********1234", fmt.format("mask", "000012341234"));
    }

    @Test
    void converters() {
        assertEquals("123AB ", conv.convert("toHankaku", "１２３ＡＢ　"));
        assertEquals("１２　", conv.convert("toZenkaku", "12 "));
        assertEquals("アイウ", conv.convert("hiraToKata", "あいう"));
        assertEquals("あいう", conv.convert("kataToHira", "アイウ"));
        assertEquals("x", conv.convert("trim", "　 x 　"));
        assertEquals("a b c", conv.convert("collapseSpaces", "a　　b  c"));
        assertEquals(1234L, conv.convert("parseNumber", "１，２３４"));
        assertEquals("AB", conv.convertAll(List.of("toHankaku", "trim"), "　ＡＢ　"));
    }

    @Test
    void postalCodeValidator() {
        FormDefinition form = new FormDefinition(List.of(new SectionDefinition(null,
                List.of(new FieldDefinition("zip", "郵便番号", "text", false, false,
                        List.of(new ValidatorDefinition("postalCode", Map.of(), null)),
                        null, List.of(), null, null, null)))));
        FormValidator v = new FormValidator();
        assertEquals(true, v.validate(form, Map.of("zip", "123-4567")).valid());
        assertEquals(true, v.validate(form, Map.of("zip", "1234567")).valid());
        assertEquals("郵便番号の形式が正しくありません",
                v.validate(form, Map.of("zip", "abc")).errors().get(0).message());
    }
}

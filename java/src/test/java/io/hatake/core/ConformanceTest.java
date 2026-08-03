package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * Runs the shared conformance fixtures (spec/conformance) against the Java
 * implementation. The same fixtures drive the Dart and TypeScript editions.
 */
class ConformanceTest {

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> load(String file) throws IOException {
        String content = Files.readString(Path.of("../spec/conformance", file));
        return (List<Map<String, Object>>) new Yaml().load(content);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> opts(Map<String, Object> c) {
        return c.get("options") instanceof Map ? (Map<String, Object>) c.get("options") : Map.of();
    }

    @TestFactory
    Stream<DynamicTest> formatters() throws IOException {
        FormatterRegistry fmt = new FormatterRegistry();
        return load("formatters.json").stream().map(c -> DynamicTest.dynamicTest(
                c.get("name") + " " + c.get("value") + " " + c.get("options"),
                () -> assertEquals(
                        c.get("expected"),
                        fmt.format((String) c.get("name"), c.get("value"), opts(c)))));
    }

    @TestFactory
    Stream<DynamicTest> converters() throws IOException {
        ConverterRegistry conv = new ConverterRegistry();
        return load("converters.json").stream().map(c -> DynamicTest.dynamicTest(
                c.get("name") + " " + c.get("value"),
                () -> assertEquals(
                        String.valueOf(c.get("expected")),
                        String.valueOf(conv.convert((String) c.get("name"), c.get("value"))))));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> queries() throws IOException {
        return load("queries.json").stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("params")),
                () -> {
                    List<Map<String, Object>> filtersRaw = (List<Map<String, Object>>) c.get("filters");
                    List<FilterDefinition> filters = filtersRaw.stream()
                            .map(f -> new FilterDefinition(
                                    (String) f.get("field"), (String) f.get("field"),
                                    (String) f.get("type"), (String) f.get("operator")))
                            .toList();
                    Map<String, Object> params = (Map<String, Object>) c.get("params");
                    QuerySpec q = QueryBuilder.build(new SearchDefinition(filters), params);

                    Map<String, Object> e = (Map<String, Object>) c.get("expected");
                    List<Map<String, Object>> ec = (List<Map<String, Object>>) e.get("conditions");
                    assertEquals(ec.size(), q.conditions().size());
                    for (int i = 0; i < ec.size(); i++) {
                        assertEquals(ec.get(i).get("field"), q.conditions().get(i).field());
                        assertEquals(ec.get(i).get("operator"), q.conditions().get(i).operator());
                        assertEquals(String.valueOf(ec.get(i).get("value")),
                                String.valueOf(q.conditions().get(i).value()));
                    }
                    assertEquals(e.get("sortField"), q.sortField());
                    assertEquals(e.get("sortAscending"), q.sortAscending());
                    assertEquals(((Number) e.get("page")).intValue(), q.page());
                    assertEquals(((Number) e.get("pageSize")).intValue(), q.pageSize());
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> tax() throws IOException {
        return load("tax.json").stream().map(c -> DynamicTest.dynamicTest(
                c.get("amount") + "@" + c.get("rate"),
                () -> {
                    double amount = ((Number) c.get("amount")).doubleValue();
                    double rate = ((Number) c.get("rate")).doubleValue();
                    boolean included = Boolean.TRUE.equals(c.get("included"));
                    String rounding = c.get("rounding") instanceof String s ? s : "floor";
                    Tax.TaxBreakdown r = Tax.compute(amount, rate, included, rounding);
                    Map<String, Object> e = (Map<String, Object>) c.get("expected");
                    assertEquals(((Number) e.get("net")).longValue(), r.net());
                    assertEquals(((Number) e.get("tax")).longValue(), r.tax());
                    assertEquals(((Number) e.get("gross")).longValue(), r.gross());
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> fiscal() throws IOException {
        return load("fiscal.json").stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("date")),
                () -> {
                    String date = (String) c.get("date");
                    int sm = c.get("startMonth") instanceof Number n ? n.intValue() : 4;
                    Map<String, Object> e = (Map<String, Object>) c.get("expected");
                    assertEquals(((Number) e.get("year")).intValue(), Fiscal.fiscalYear(date, sm));
                    assertEquals(((Number) e.get("quarter")).intValue(), Fiscal.fiscalQuarter(date, sm));
                    assertEquals(((Number) e.get("half")).intValue(), Fiscal.fiscalHalf(date, sm));
                }));
    }

    @TestFactory
    Stream<DynamicTest> ageTenure() throws IOException {
        return load("age.json").stream().map(c -> DynamicTest.dynamicTest(
                c.get("from") + "->" + c.get("to"),
                () -> {
                    String from = (String) c.get("from");
                    String to = (String) c.get("to");
                    int years = ((Number) c.get("years")).intValue();
                    int months = ((Number) c.get("months")).intValue();
                    Age.Tenure t = Age.tenure(from, to);
                    assertEquals(years, t.years());
                    assertEquals(months, t.months());
                    assertEquals(years, Age.ageAt(from, to));
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> businessDay() throws IOException {
        return load("businessday.json").stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("date")),
                () -> {
                    String date = (String) c.get("date");
                    Set<String> holidays = new HashSet<>((List<String>) c.get("holidays"));
                    Map<String, Object> e = (Map<String, Object>) c.get("expected");
                    assertEquals(e.get("isBusinessDay"), BusinessDay.isBusinessDay(date, holidays));
                    assertEquals(e.get("next"), BusinessDay.nextBusinessDay(date, holidays));
                    assertEquals(e.get("prev"), BusinessDay.prevBusinessDay(date, holidays));
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> era() throws IOException {
        return load("era.json").stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("date")),
                () -> {
                    Era.EraDate ed = Era.eraOf((String) c.get("date"));
                    Map<String, Object> e = (Map<String, Object>) c.get("expected");
                    assertEquals(e.get("name"), ed.name());
                    assertEquals(e.get("abbr"), ed.abbr());
                    assertEquals(((Number) e.get("year")).intValue(), ed.year());
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> invoice() throws IOException {
        return load("invoice.json").stream().map(c -> DynamicTest.dynamicTest(
                ((List<?>) c.get("lines")).size() + " lines",
                () -> {
                    List<Map<String, Object>> rawLines = (List<Map<String, Object>>) c.get("lines");
                    List<Tax.InvoiceLine> lines = rawLines.stream()
                            .map(l -> new Tax.InvoiceLine(
                                    ((Number) l.get("amount")).doubleValue(),
                                    ((Number) l.get("rate")).doubleValue()))
                            .toList();
                    boolean included = Boolean.TRUE.equals(c.get("included"));
                    String rounding = c.get("rounding") instanceof String s ? s : "floor";
                    Tax.TaxInvoice inv = Tax.computeInvoice(lines, included, rounding);

                    Map<String, Object> e = (Map<String, Object>) c.get("expected");
                    List<Map<String, Object>> eByRate = (List<Map<String, Object>>) e.get("byRate");
                    assertEquals(eByRate.size(), inv.byRate().size());
                    for (int i = 0; i < eByRate.size(); i++) {
                        Map<String, Object> er = eByRate.get(i);
                        Tax.TaxRateSubtotal ar = inv.byRate().get(i);
                        assertEquals(String.valueOf(((Number) er.get("rate")).doubleValue()),
                                String.valueOf(ar.rate()));
                        assertEquals(((Number) er.get("net")).longValue(), ar.net());
                        assertEquals(((Number) er.get("tax")).longValue(), ar.tax());
                        assertEquals(((Number) er.get("gross")).longValue(), ar.gross());
                    }
                    Map<String, Object> et = (Map<String, Object>) e.get("total");
                    assertEquals(((Number) et.get("net")).longValue(), inv.total().net());
                    assertEquals(((Number) et.get("tax")).longValue(), inv.total().tax());
                    assertEquals(((Number) et.get("gross")).longValue(), inv.total().gross());
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> conditions() throws IOException {
        return load("conditions.json").stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("condition")),
                () -> {
                    Map<String, Object> condition = (Map<String, Object>) c.get("condition");
                    Map<String, Object> record = (Map<String, Object>) c.get("record");
                    assertEquals(c.get("expected"), ConditionEvaluator.evaluate(condition, record));
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> computed() throws IOException {
        Computed reg = new Computed();
        return load("computed.json").stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("computed")),
                () -> {
                    Map<String, Object> computed = (Map<String, Object>) c.get("computed");
                    Map<String, Object> record = (Map<String, Object>) c.get("record");
                    Object result = reg.compute(computed, record);
                    Object expected = c.get("expected");
                    if (expected instanceof Number en) {
                        assertEquals(en.doubleValue(), ((Number) result).doubleValue());
                    } else {
                        assertEquals(expected, result);
                    }
                }));
    }

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> access() throws IOException {
        return load("access.json").stream().map(c -> DynamicTest.dynamicTest(
                c.get("roles") + " / " + c.get("userRoles"),
                () -> {
                    List<String> roles = (List<String>) c.get("roles");
                    Set<String> userRoles = new HashSet<>((List<String>) c.get("userRoles"));
                    assertEquals(c.get("expected"), Access.isAllowed(roles, userRoles));
                }));
    }

    @TestFactory
    Stream<DynamicTest> validators() throws IOException {
        ValidatorRegistry registry = new ValidatorRegistry();
        return load("validators.json").stream().map(c -> DynamicTest.dynamicTest(
                c.get("type") + " " + c.get("value"),
                () -> {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> params = c.get("params") instanceof Map
                            ? (Map<String, Object>) c.get("params") : Map.of();
                    String result = registry.run(c.get("value"),
                            new ValidatorDefinition((String) c.get("type"), params, null));
                    assertEquals(c.get("valid"), result == null);
                    if (c.get("message") != null) {
                        assertEquals(c.get("message"), result);
                    }
                }));
    }
}

package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * サーバ側の「登録済みのもの」の申告。形は Dart 版の {@code registrySnapshot} と同じで、
 * そのまま {@code hatake registry --compare} に渡せる。
 *
 * <p>種類の名前は {@code spec/conformance/registry_snapshot.json} の {@code serverKinds}
 * と一致すること（違うと、突き合わせる道具が「サーバには無い」と言い出す）。
 */
class RegistrySnapshotTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fixture() throws IOException {
        String content =
                Files.readString(Path.of("../spec/conformance/registry_snapshot.json"));
        return (Map<String, Object>) new Yaml().load(content);
    }

    @Test
    @SuppressWarnings("unchecked")
    void kindsMatchSpec() throws IOException {
        List<String> expected = (List<String>) fixture().get("serverKinds");
        assertEquals(expected, RegistrySnapshot.KINDS);
    }

    @Test
    void reportsOnlyWhatWasAdded() {
        ValidatorRegistry validators = new ValidatorRegistry(
                Map.<String, ValidatorRegistry.Validator>of(
                        "memberCode", (value, def) -> null,
                        // 組み込みと同じ名前で上書きしても、一覧には出さない
                        // （突き合わせる側は組み込みを知っているので、出すと二重に数える）。
                        "maxLength", (value, def) -> null));
        Computed computeds = new Computed(
                Map.<String, Computed.ComputedFn>of("consumptionTax", (c, r) -> 0));
        Aggregates aggregates = new Aggregates(
                Map.<String, Aggregates.AggregateFn>of("median", (rows, field) -> 0.0));

        assertEquals(
                Map.of(
                        "validators", List.of("memberCode"),
                        "computedOps", List.of("consumptionTax"),
                        "aggregates", List.of("median")),
                RegistrySnapshot.of(
                        validators, new ConverterRegistry(), computeds, aggregates,
                        new FormatterRegistry()));
    }

    @Test
    void saysNothingWhenNothingWasAdded() {
        // 「その種類は空」ではなく「言うことが無い」。空を主張すると、突き合わせた側が
        // 「画面にしか無い登録がある」と読んで嘘の食い違いを出す。
        assertEquals(
                Map.of(),
                RegistrySnapshot.of(
                        new ValidatorRegistry(), new ConverterRegistry(), new Computed(),
                        new Aggregates(), new FormatterRegistry()));
    }

    @Test
    @SuppressWarnings("unchecked")
    void writesTheSameFileShape() {
        Map<String, List<String>> snapshot = RegistrySnapshot.of(
                new ValidatorRegistry(Map.<String, ValidatorRegistry.Validator>of(
                        "memberCode", (value, def) -> null)),
                new ConverterRegistry(),
                new Computed(Map.<String, Computed.ComputedFn>of(
                        "consumptionTax", (c, r) -> 0)),
                new Aggregates(),
                new FormatterRegistry());

        Map<String, Object> written =
                (Map<String, Object>) new Yaml().load(RegistrySnapshot.toJson(snapshot));
        assertTrue(written.get("$comment") instanceof String);
        assertEquals(List.of("memberCode"), written.get("validators"));
        assertEquals(List.of("consumptionTax"), written.get("computedOps"));
    }
}

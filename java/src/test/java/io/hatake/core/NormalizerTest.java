package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class NormalizerTest {

    @Test
    void appliesConverterChainsPerField() {
        FormDefinition form = new FormDefinition(List.of(new SectionDefinition(null, List.of(
                new FieldDefinition("code", "コード", "text", false, false, List.of(), null,
                        List.of("toHankaku", "trim"), null, null, null, List.of(),
                        List.of(), List.of()),
                new FieldDefinition("name", "名前", "text", false, false, List.of(), null,
                        List.of(), null, null, null, List.of(),
                        List.of(), List.of())))));

        Map<String, Object> out = new FormNormalizer()
                .normalize(form, Map.of("code", "　ＡＢ１２　", "name", "　x　"));

        assertEquals("AB12", out.get("code"));
        assertEquals("　x　", out.get("name"));
    }
}

package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * ページ種別の言い方は {@code spec/vocabulary.json} に1つだけ在り、各エディションはそれを
 * 転記する。この試験があるから手で写してよい＝語を足したらここで落ち、言い方を変えてもここで
 * 落ちる。放っておくと、CLI と画面で同じ画面の呼び方が変わる。
 */
class PageKindWordsTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> pageKinds() throws IOException {
        String content = Files.readString(Path.of("../spec/vocabulary.json"));
        Map<String, Object> vocabulary = (Map<String, Object>) new Yaml().load(content);
        return (Map<String, Object>) vocabulary.get("pageKinds");
    }

    @SuppressWarnings("unchecked")
    @Test
    void matchesTheSpecWordForWord() throws IOException {
        Map<String, Object> spec = pageKinds();
        assertEquals(spec.keySet(), PageKindWords.ALL.keySet());
        for (Map.Entry<String, Object> entry : spec.entrySet()) {
            Map<String, Object> one = (Map<String, Object>) entry.getValue();
            PageKindWords mine = PageKindWords.ALL.get(entry.getKey());
            assertEquals(
                    ((Map<String, Object>) one.get("what")).get("ja"),
                    mine.what(),
                    entry.getKey() + ".what");
            assertEquals(
                    ((Map<String, Object>) one.get("short")).get("ja"),
                    mine.shortWord(),
                    entry.getKey() + ".short");
        }
    }

    @Test
    void coversEveryBuiltInPageKind() throws IOException {
        assertEquals(pageKinds().keySet(), Set.copyOf(PageKindWords.KINDS));
        for (String kind : PageKindWords.KINDS) {
            assertFalse(PageKindWords.shortOf(kind).isEmpty(), kind);
            assertFalse(PageKindWords.whatOf(kind).isEmpty(), kind);
        }
    }

    /** プラグインが足した種別に文を作ると嘘になるので、種別名そのものを返す。 */
    @Test
    void anUnknownKindFallsBackToTheKindItself() {
        assertEquals("kanban", PageKindWords.shortOf("kanban"));
        assertTrue(PageKindWords.whatOf("kanban").isEmpty());
    }
}

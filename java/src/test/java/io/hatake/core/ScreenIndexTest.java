package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * 画面の索引（Java 版）。同梱の例（spec/examples）をそのまま索引にして、TypeScript 版・Dart 版と
 * 同じ答えになることを見る＝<b>同じ定義の山を、どのエディションから引いても同じ枚数</b>。
 *
 * <p>この版はボタン（actions）を持たないので、要約に「ボタン n」は出ない。索引の語にも
 * ボタン名は入らない（持っていないものは索引できない、という素直な差）。
 */
class ScreenIndexTest {

    private static ScreenIndex.Source file(String name) throws IOException {
        return new ScreenIndex.Source(
                name, Files.readString(Path.of("../spec/examples/" + name)));
    }

    private static ScreenIndex shippedExamples() throws IOException {
        return ScreenIndex.build(List.of(
                file("sales_app.yaml"),
                file("customer_master.yaml"),
                file("order_entry.yaml"),
                file("sales_report.yaml")));
    }

    @Test
    void countsEveryScreenOfAnApp() throws IOException {
        ScreenIndex index = shippedExamples();
        assertTrue(index.unreadable().isEmpty(), index.unreadable().toString());
        // app の 8 枚 + 単票 3 枚。
        assertEquals(11, index.screens().size());
        assertEquals(
                8,
                index.screens().stream()
                        .filter(one -> one.file().equals("sales_app.yaml"))
                        .count());
    }

    /**
     * エディションが揃っていることの一番強い確かめ: 同じ定義の山なら<b>同じ枚数</b>になる。
     * TypeScript 版は CI で「画面 22 枚」を、Dart 版も試験で 22 枚を見ている。
     */
    @Test
    void theShippedExamplesComeOutAs18Screens() throws IOException {
        List<ScreenIndex.Source> sources = new ArrayList<>();
        try (Stream<Path> files = Files.list(Path.of("../spec/examples"))) {
            for (Path path : files.toList()) {
                String name = path.getFileName().toString();
                if (name.endsWith(".yaml") || name.endsWith(".yml") || name.endsWith(".json")) {
                    sources.add(new ScreenIndex.Source(name, Files.readString(path)));
                }
            }
        }
        ScreenIndex index = ScreenIndex.build(sources);
        assertTrue(index.unreadable().isEmpty(), index.unreadable().toString());
        assertEquals(22, index.screens().size());
        // index.json（例のカタログ）は定義ではないので飛ばされる。
        assertTrue(index.ignored() > 0);
    }

    @Test
    void carriesTheOneLineSummary() throws IOException {
        ScreenEntry entry = shippedExamples().search("order_search").get(0);
        assertEquals("search", entry.kind());
        assertEquals("照会（読み取り専用）", entry.what());
        assertTrue(entry.brief().contains("受注照会（order_search）"), entry.brief());
        assertTrue(entry.brief().contains("条件 4"), entry.brief());
        assertTrue(entry.brief().contains("orderRepository から"), entry.brief());
    }

    @Test
    void findsAScreenTheWayTheShopFloorWouldAskForIt() throws IOException {
        ScreenIndex index = shippedExamples();
        // 同じ画面が app の中と単票の両方に在るので2件（どのファイルの話かで見分ける）。
        assertEquals(
                List.of("customer_master", "customer_master"),
                index.search("顧客 マスタ").stream().map(ScreenEntry::id).toList());
        assertEquals(
                List.of("customer_master.yaml", "sales_app.yaml"),
                index.search("顧客 マスタ").stream().map(ScreenEntry::file).toList());
        // 語の AND なので、片方しか当たらなければ出ない。
        assertTrue(index.search("顧客 帳票").isEmpty());
    }

    @Test
    void findsAScreenByALabelOrAFieldName() throws IOException {
        ScreenIndex index = shippedExamples();
        assertTrue(index.search("受注番号").size() >= 2);
        assertTrue(
                index.search("orderNo").stream().anyMatch(one -> one.id().equals("order_search")));
    }

    @Test
    void ignoresCase() throws IOException {
        assertFalse(shippedExamples().search("ORDERREPOSITORY").isEmpty());
    }

    @Test
    void noWordsMeansEveryScreen() throws IOException {
        ScreenIndex index = shippedExamples();
        assertEquals(index.screens().size(), index.search(null).size());
        assertEquals(index.screens().size(), index.search("  ").size());
    }

    @Test
    void isSortedSoTheSameInputGivesTheSameIndex() throws IOException {
        List<String> files = shippedExamples().screens().stream().map(ScreenEntry::file).toList();
        assertEquals(files.stream().sorted().toList(), files);
    }

    @Test
    void biggestScreensFirst() throws IOException {
        List<ScreenEntry> bySize = shippedExamples().bySize();
        assertTrue(bySize.get(0).size() >= bySize.get(bySize.size() - 1).size());
    }

    @Test
    void skipsFilesThatAreNotDefinitions() {
        ScreenIndex index = ScreenIndex.build(List.of(
                new ScreenIndex.Source("README.md", "# これは定義ではない\n"),
                new ScreenIndex.Source("page.yaml", MASTER)));
        assertEquals(1, index.ignored());
        assertEquals(1, index.screens().size());
    }

    /** 綴り間違いのある定義も索引に載せる（消すと余計に探せない）。 */
    @Test
    void aDefinitionWithAnUnknownKeyStillGetsIndexed() {
        String typo = MASTER.replace("sortable: true", "sortble: true");
        ScreenIndex index =
                ScreenIndex.build(List.of(new ScreenIndex.Source("page.yaml", typo)));
        assertEquals(1, index.screens().size());
        assertTrue(index.unreadable().isEmpty());
    }

    /** 黙って落とすことはしない（索引が不完全だと言えるように）。 */
    @Test
    void aBrokenDefinitionIsReportedRatherThanDropped() {
        ScreenIndex index = ScreenIndex.build(List.of(
                new ScreenIndex.Source("broken.yaml", "page:\n  id: x\n"),
                new ScreenIndex.Source("page.yaml", MASTER)));
        assertEquals(1, index.screens().size());
        assertEquals(1, index.unreadable().size());
        assertEquals("broken.yaml", index.unreadable().get(0).file());
        assertFalse(index.unreadable().get(0).reason().isEmpty());
    }

    @Test
    void readsJsonTheSameWay() {
        String json = "{ \"page\": { \"type\": \"detail\", \"id\": \"order_detail\", "
                + "\"title\": \"受注詳細\", \"repository\": \"orderRepository\", \"key\": \"orderNo\", "
                + "\"form\": { \"sections\": [ { \"fields\": "
                + "[ { \"field\": \"orderNo\", \"label\": \"受注番号\" } ] } ] } } }";
        ScreenIndex index =
                ScreenIndex.build(List.of(new ScreenIndex.Source("order_detail.json", json)));
        assertEquals("order_detail", index.screens().get(0).id());
        assertEquals("1件の照会", index.screens().get(0).what());
    }

    @Test
    void rendersAsATable() throws IOException {
        ScreenIndex index = shippedExamples();
        String text = ScreenIndex.render(index.screens(), true, false);
        assertTrue(text.startsWith("画面 11 枚:"), text);
        assertTrue(text.contains("sales_app.yaml"));
        assertFalse(ScreenIndex.render(index.screens(), false, false).contains("sales_app.yaml"));
        assertTrue(
                ScreenIndex.render(index.bySize(), true, true).contains("規模の大きい順"));
    }

    @Test
    void saysSoWhenNothingMatches() throws IOException {
        assertTrue(ScreenIndex.render(shippedExamples().search("存在しない画面"), true, false)
                .contains("当てはまる画面はありません"));
    }

    @Test
    void indexesPagesAlreadyParsed() {
        PageDefinition page = DefinitionParser.parsePageYaml(MASTER);
        ScreenIndex index = ScreenIndex.of(List.of(page), "");
        assertEquals("dept_master", index.screens().get(0).id());
        assertEquals("マスタ保守", index.screens().get(0).what());
        // ファイルを持たない行は、表にもファイル欄が出ない。
        assertFalse(ScreenIndex.render(index.screens(), true, false).contains("  yaml"));
    }

    @Test
    void requiredFieldsDoNotInflateTheSize() {
        ScreenEntry entry = ScreenEntry.of(DefinitionParser.parsePageYaml(MASTER));
        // 列 1 + 枠 1 + 項目 2 = 4（必須の 1 は項目に含まれているので数えない）。
        assertEquals(4, entry.size());
        assertEquals(1, entry.counts().get("required"));
    }

    private static final String MASTER = """
            page:
              type: master
              id: dept_master
              title: 部門マスタ
              repository: deptRepository
              table:
                columns:
                  - { field: code, label: コード, sortable: true }
              form:
                sections:
                  - fields:
                      - { field: code, label: コード, required: true }
                      - { field: name, label: 部門名 }
            """;
}

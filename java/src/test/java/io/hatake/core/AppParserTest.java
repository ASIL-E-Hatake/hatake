package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Parses the shipped example (spec/examples/sales_app.yaml) and asserts the
 * navigation structure + shallow page inventory. The same example drives the
 * Dart and TypeScript editions.
 */
class AppParserTest {

    private static AppDefinition shippedExample() throws IOException {
        String content = Files.readString(Path.of("../spec/examples/sales_app.yaml"));
        return AppParser.parseAppYaml(content);
    }

    @Test
    void readsAppMetadata() throws IOException {
        AppDefinition app = shippedExample();
        assertEquals("sales_admin", app.id());
        assertEquals("販売管理", app.title());
        assertEquals("1.0", app.dslVersion());
        assertEquals("customers", app.home());
    }

    @Test
    void parsesMenuAsLeafGroupLeaf() throws IOException {
        List<MenuItem> menu = shippedExample().menu();
        assertEquals(4, menu.size());

        MenuItem customers = menu.get(0);
        assertFalse(customers.isGroup());
        assertEquals("customers", customers.id());
        assertEquals("customer_master", customers.page());
        assertEquals("people", customers.icon());

        MenuItem master = menu.get(1);
        assertTrue(master.isGroup());
        assertEquals("マスタ", master.label());
        assertEquals(1, master.children().size());
        assertEquals("商品", master.children().get(0).label());
        assertEquals("product_master", master.children().get(0).page());

        MenuItem orders = menu.get(2);
        assertFalse(orders.isGroup());
        assertEquals("orders", orders.id());
        assertEquals("order_search", orders.page());

        // 親子・明細の入力画面もメニューから開ける。
        MenuItem orderEntry = menu.get(3);
        assertFalse(orderEntry.isGroup());
        assertEquals("orderEntry", orderEntry.id());
        assertEquals("order_entry", orderEntry.page());
    }

    @Test
    void parsesShallowPageInventory() throws IOException {
        List<PageRef> pages = shippedExample().pages();
        assertEquals(5, pages.size());
        assertEquals(
                List.of("customer_master", "product_master", "order_search", "order_detail",
                        "order_entry"),
                pages.stream().map(PageRef::id).toList());
        assertEquals(
                List.of("master", "master", "search", "detail", "form"),
                pages.stream().map(PageRef::type).toList());
        assertEquals("顧客マスタ", pages.get(0).title());
        assertEquals("customerRepository", pages.get(0).repository());
    }
}

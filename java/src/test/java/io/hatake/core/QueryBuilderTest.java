package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class QueryBuilderTest {

    static final String YAML = """
            page:
              type: search
              id: product_search
              title: 商品照会
              repository: productRepository
              search:
                filters:
                  - { field: name,  label: 商品名, type: text,   operator: contains }
                  - { field: price, label: 価格,   type: number, operator: gte }
            """;

    private static SearchDefinition search() {
        return DefinitionParser.parsePageYaml(YAML).search();
    }

    @Test
    void buildsConditionsWithWhitelistAndCoercion() {
        QuerySpec q = QueryBuilder.build(search(),
                Map.of("name", "りんご", "price", "100", "secret", "x"));

        assertEquals(List.of("name", "price"),
                q.conditions().stream().map(QuerySpec.Condition::field).toList());

        QuerySpec.Condition price = q.conditions().stream()
                .filter(c -> c.field().equals("price")).findFirst().orElseThrow();
        assertEquals("gte", price.operator());
        assertEquals(100L, price.value()); // coerced from string to number
    }

    @Test
    void ignoresUnknownParams() {
        QuerySpec q = QueryBuilder.build(search(), Map.of("name", "x", "evil", 1));
        assertEquals(List.of("name"),
                q.conditions().stream().map(QuerySpec.Condition::field).toList());
    }

    @Test
    void readsPaginationAndValidatesSort() {
        QuerySpec q = QueryBuilder.build(search(),
                Map.of("page", "2", "pageSize", "20", "sortField", "price"));
        assertEquals(2, q.page());
        assertEquals(20, q.pageSize());
        assertEquals("price", q.sortField());

        QuerySpec bad = QueryBuilder.build(search(), Map.of("sortField", "evil"));
        assertNull(bad.sortField());
    }
}

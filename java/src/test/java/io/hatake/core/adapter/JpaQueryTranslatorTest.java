package io.hatake.core.adapter;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.hatake.core.QuerySpec;
import java.util.List;
import org.junit.jupiter.api.Test;

class JpaQueryTranslatorTest {

    @Test
    void translatesConditionsSortAndPaging() {
        QuerySpec spec = new QuerySpec(
                List.of(
                        new QuerySpec.Condition("name", "contains", "りんご"),
                        new QuerySpec.Condition("price", "gte", 100L),
                        new QuerySpec.Condition("status", "equals", "active")),
                "name", true, 2, 20);

        JpaQueryTranslator.JpaQuery q = JpaQueryTranslator.translate("Customer", spec);

        assertEquals(
                "SELECT e FROM Customer e WHERE e.name LIKE :p0 AND e.price >= :p1 "
                        + "AND e.status = :p2 ORDER BY e.name ASC",
                q.jpql());
        assertEquals("%りんご%", q.parameters().get("p0"));
        assertEquals(100L, q.parameters().get("p1"));
        assertEquals("active", q.parameters().get("p2"));
        assertEquals(40, q.firstResult()); // page 2 * pageSize 20
        assertEquals(20, q.maxResults());
    }

    @Test
    void noConditionsNoSort() {
        QuerySpec spec = new QuerySpec(List.of(), null, true, 0, 50);
        JpaQueryTranslator.JpaQuery q = JpaQueryTranslator.translate("Customer", spec);
        assertEquals("SELECT e FROM Customer e", q.jpql());
        assertEquals(0, q.parameters().size());
        assertEquals(0, q.firstResult());
        assertEquals(50, q.maxResults());
    }

    @Test
    void descSortAndCustomAlias() {
        QuerySpec spec = new QuerySpec(
                List.of(new QuerySpec.Condition("code", "startsWith", "A")),
                "code", false, 0, 10);
        JpaQueryTranslator.JpaQuery q = JpaQueryTranslator.translate("Product", "p", spec);
        assertEquals(
                "SELECT p FROM Product p WHERE p.code LIKE :p0 ORDER BY p.code DESC",
                q.jpql());
        assertEquals("A%", q.parameters().get("p0"));
    }

    @Test
    void inAndBetween() {
        QuerySpec spec = new QuerySpec(
                List.of(
                        new QuerySpec.Condition("status", "in", List.of("a", "b")),
                        new QuerySpec.Condition("price", "between", List.of(100, 200))),
                null, true, 0, 50);
        JpaQueryTranslator.JpaQuery q = JpaQueryTranslator.translate("Order", spec);
        assertEquals(
                "SELECT e FROM Order e WHERE e.status IN (:p0) "
                        + "AND e.price BETWEEN :p1_lo AND :p1_hi",
                q.jpql());
        assertEquals(List.of("a", "b"), q.parameters().get("p0"));
        assertEquals(100, q.parameters().get("p1_lo"));
        assertEquals(200, q.parameters().get("p1_hi"));
    }
}

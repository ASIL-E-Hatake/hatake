package io.hatake.core;

import java.util.List;

/**
 * A framework-neutral description of a query, built from a search definition +
 * request params. Turn this into JPA / MyBatis / SQL in your own adapter;
 * hatake itself stays free of any persistence framework.
 */
public record QuerySpec(
        List<Condition> conditions,
        String sortField,
        boolean sortAscending,
        int page,
        int pageSize) {

    public record Condition(String field, String operator, Object value) {
    }
}

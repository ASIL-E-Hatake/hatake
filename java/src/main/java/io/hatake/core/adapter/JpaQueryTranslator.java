package io.hatake.core.adapter;

import io.hatake.core.QuerySpec;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * フレームワーク中立の {@link QuerySpec} を JPA(JPQL) 向けに翻訳する opt-in アダプタ。
 *
 * <p>hatake 本体は永続化フレームワークに依存しない。このクラスは QuerySpec を
 * 「JPQL 文字列 + バインドパラメータ + ページング指定」へ変換するだけで、JPA への
 * 依存を持たない（＝本体に依存を持ち込まない）。実行は利用者の {@code EntityManager}
 * が行う:
 *
 * <pre>{@code
 * QuerySpec spec = QueryBuilder.build(search, params);
 * JpaQueryTranslator.JpaQuery q = JpaQueryTranslator.translate("Customer", spec);
 * List<Customer> rows = em.createQuery(q.jpql(), Customer.class)
 *     .setFirstResult(q.firstResult())
 *     .setMaxResults(q.maxResults());
 * q.parameters().forEach(query::setParameter);
 * }</pre>
 *
 * <p>フィールド名（条件・ソート）は検索定義由来の識別子で、{@code QueryBuilder} が
 * 許可リストで絞るため任意カラム指定はできない。値は必ずバインドパラメータで渡す
 * ので JPQL インジェクションは起きない。
 */
public final class JpaQueryTranslator {

    private JpaQueryTranslator() {
    }

    /** 翻訳結果。JPQL 本体・バインドパラメータ・ページング（firstResult/maxResults）。 */
    public record JpaQuery(String jpql, Map<String, Object> parameters, int firstResult, int maxResults) {
    }

    /** エイリアス {@code e} で翻訳する簡易版。 */
    public static JpaQuery translate(String entity, QuerySpec spec) {
        return translate(entity, "e", spec);
    }

    public static JpaQuery translate(String entity, String alias, QuerySpec spec) {
        StringBuilder jpql = new StringBuilder("SELECT ").append(alias)
                .append(" FROM ").append(entity).append(' ').append(alias);
        Map<String, Object> params = new LinkedHashMap<>();

        List<QuerySpec.Condition> conditions = spec.conditions();
        for (int i = 0; i < conditions.size(); i++) {
            QuerySpec.Condition c = conditions.get(i);
            String p = "p" + i;
            String col = alias + "." + c.field();
            jpql.append(i == 0 ? " WHERE " : " AND ");
            switch (c.operator()) {
                case "equals" -> {
                    jpql.append(col).append(" = :").append(p);
                    params.put(p, c.value());
                }
                case "notEquals" -> {
                    jpql.append(col).append(" <> :").append(p);
                    params.put(p, c.value());
                }
                case "gt" -> {
                    jpql.append(col).append(" > :").append(p);
                    params.put(p, c.value());
                }
                case "gte" -> {
                    jpql.append(col).append(" >= :").append(p);
                    params.put(p, c.value());
                }
                case "lt" -> {
                    jpql.append(col).append(" < :").append(p);
                    params.put(p, c.value());
                }
                case "lte" -> {
                    jpql.append(col).append(" <= :").append(p);
                    params.put(p, c.value());
                }
                case "contains" -> {
                    jpql.append(col).append(" LIKE :").append(p);
                    params.put(p, "%" + c.value() + "%");
                }
                case "startsWith" -> {
                    jpql.append(col).append(" LIKE :").append(p);
                    params.put(p, c.value() + "%");
                }
                case "endsWith" -> {
                    jpql.append(col).append(" LIKE :").append(p);
                    params.put(p, "%" + c.value());
                }
                case "in" -> {
                    jpql.append(col).append(" IN (:").append(p).append(')');
                    params.put(p, c.value());
                }
                case "between" -> {
                    if (c.value() instanceof List<?> range && range.size() == 2) {
                        jpql.append(col).append(" BETWEEN :").append(p).append("_lo AND :")
                                .append(p).append("_hi");
                        params.put(p + "_lo", range.get(0));
                        params.put(p + "_hi", range.get(1));
                    } else {
                        jpql.append(col).append(" = :").append(p);
                        params.put(p, c.value());
                    }
                }
                default -> {
                    jpql.append(col).append(" = :").append(p);
                    params.put(p, c.value());
                }
            }
        }

        if (spec.sortField() != null) {
            jpql.append(" ORDER BY ").append(alias).append('.').append(spec.sortField())
                    .append(spec.sortAscending() ? " ASC" : " DESC");
        }

        int firstResult = spec.page() * spec.pageSize();
        return new JpaQuery(jpql.toString(), params, firstResult, spec.pageSize());
    }
}

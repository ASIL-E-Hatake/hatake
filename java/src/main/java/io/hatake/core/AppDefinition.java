package io.hatake.core;

import java.util.List;

/**
 * An application (Java edition): a set of pages composed by a navigation
 * {@code menu}. Mirrors the shared DSL spec.
 *
 * <p>Backends read navigation metadata and a shallow page inventory
 * ({@link PageRef}); rendering and routing are a frontend concern.
 */
public record AppDefinition(
        String id,
        String title,
        String dslVersion,
        String home,
        /**
         * 画面をどう開くか（{@code single} / {@code tabs}）。既定は {@code single}。
         *
         * <p>言うのは「その業務システムの既定」で、画面を出す側（Flutter）が上書きできる。
         * サーバ側では使わないが、**3版が同じ語彙を持つ**ために読んでおく（片方だけ知らない
         * キーは strict で弾かれる／黙って落ちるのどちらかになる）。
         */
        String navigation,
        List<MenuItem> menu,
        List<PageRef> pages) {
}

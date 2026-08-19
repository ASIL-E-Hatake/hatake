package io.hatake.core;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.yaml.snakeyaml.Yaml;

/**
 * 「顧客を検索する画面はどれ」に答えるための索引。
 *
 * <p>定義が増えると<b>どこに何があるか</b>が分からなくなる。grep は語を見つけるが「その画面が
 * 何をするか」は出てこない（YAML を開いて読むことになる）。そこで1行の要約（{@link ScreenBrief}）
 * と<b>探すための語</b>を集める。索引のために別の語彙は作らない＝要約と同じものを使う。
 *
 * <p>読み方は strict ではない。綴り間違いのある定義も<b>在る</b>ので、索引から消すと余計に
 * 探せなくなる。ただし黙って落とすことはしない＝読めなかったものは {@link #unreadable()} に
 * 入るので、呼ぶ側は「索引は不完全」と言える。
 *
 * @param screens 行（ファイル → id の順で固定。同じ入力なら同じ索引）
 * @param ignored 定義ではなかったので飛ばした数
 * @param unreadable 読めなかった定義（1件でもあれば索引は不完全）
 */
public record ScreenIndex(
        List<ScreenEntry> screens,
        int ignored,
        List<Unreadable> unreadable) {

    /** 索引に入れる定義1つ。 */
    public record Source(String file, String text) {
    }

    /** 読めなかった定義。 */
    public record Unreadable(String file, String reason) {
    }

    /** 定義かどうか（JSON では行頭に {@code &#123;} が来るので、その後ろのキーも見る）。 */
    private static final Pattern IS_DEFINITION =
            Pattern.compile("(^|[{,])\\s*\"?(page|app)\"?\\s*:", Pattern.MULTILINE);

    private static final Pattern IS_APP =
            Pattern.compile("(^|[{,])\\s*\"?app\"?\\s*:", Pattern.MULTILINE);

    /** 解析済みのページから索引を作る。 */
    public static ScreenIndex of(List<PageDefinition> pages, String file) {
        List<ScreenEntry> screens = new ArrayList<>();
        for (PageDefinition page : pages) {
            screens.add(ScreenEntry.of(page, file));
        }
        return new ScreenIndex(sorted(screens), 0, List.of());
    }

    /**
     * 定義の文字列（YAML でも JSON でも）から索引を作る。
     *
     * <p>{@code app:} の定義は<b>画面1枚ずつ</b>数える。{@link AppParser} は app を浅く
     * （{@link PageRef} の一覧として）読むので、ここでは各ページのマップを
     * {@link DefinitionParser#parsePageMap(Map)} に渡して完全な形で読む＝索引に規模や
     * 項目名が入る。
     */
    @SuppressWarnings("unchecked")
    public static ScreenIndex build(List<Source> sources) {
        List<ScreenEntry> screens = new ArrayList<>();
        List<Unreadable> unreadable = new ArrayList<>();
        int ignored = 0;

        for (Source source : sources) {
            if (!IS_DEFINITION.matcher(source.text()).find()) {
                ignored++;
                continue;
            }
            try {
                if (IS_APP.matcher(source.text()).find()) {
                    Object decoded = new Yaml().load(source.text());
                    for (Map<String, Object> page : appPages(decoded)) {
                        screens.add(ScreenEntry.of(
                                DefinitionParser.parsePageMap(page), source.file()));
                    }
                } else {
                    screens.add(ScreenEntry.of(
                            DefinitionParser.parsePageYaml(source.text()), source.file()));
                }
            } catch (RuntimeException error) {
                unreadable.add(new Unreadable(source.file(), firstLine(error)));
            }
        }
        return new ScreenIndex(sorted(screens), ignored, List.copyOf(unreadable));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> appPages(Object decoded) {
        if (!(decoded instanceof Map)) {
            throw new IllegalArgumentException("Top-level document must be a mapping/object");
        }
        Map<String, Object> root = (Map<String, Object>) decoded;
        Map<String, Object> app = root.get("app") instanceof Map
                ? (Map<String, Object>) root.get("app")
                : root;
        List<Map<String, Object>> pages = new ArrayList<>();
        if (app.get("pages") instanceof List<?> list) {
            for (Object one : list) {
                if (one instanceof Map) {
                    pages.add((Map<String, Object>) one);
                }
            }
        }
        return pages;
    }

    /** 理由は1行だけ（索引はファイル1つに1行なので）。 */
    private static String firstLine(RuntimeException error) {
        String message = error.getMessage();
        if (message == null || message.isEmpty()) {
            return error.getClass().getSimpleName();
        }
        return message.split("\n", 2)[0];
    }

    /** ファイル → id。同じ入力なら同じ索引になるように並びを固定する。 */
    public static List<ScreenEntry> sorted(List<ScreenEntry> screens) {
        List<ScreenEntry> copy = new ArrayList<>(screens);
        copy.sort(Comparator.comparing(ScreenEntry::file).thenComparing(ScreenEntry::id));
        return List.copyOf(copy);
    }

    /**
     * {@code query} の<b>語が全部</b>当たる画面（空白と読点で切る）。
     *
     * <p>文ではなく語で切るのは、日本語は分かち書きしないため（文をそのまま投げると当たらない）。
     * 大文字小文字は無視する。語が1つも無ければ全件。
     */
    public List<ScreenEntry> search(String query) {
        List<String> terms = new ArrayList<>();
        if (query != null) {
            for (String term : query.split("[\\s、,]+")) {
                String trimmed = term.trim().toLowerCase(Locale.ROOT);
                if (!trimmed.isEmpty()) {
                    terms.add(trimmed);
                }
            }
        }
        if (terms.isEmpty()) {
            return screens;
        }
        List<ScreenEntry> found = new ArrayList<>();
        for (ScreenEntry screen : screens) {
            if (screen.matchesAll(terms)) {
                found.add(screen);
            }
        }
        return List.copyOf(found);
    }

    /** 規模の大きい画面から（手間がどこに在るかを見るため）。 */
    public List<ScreenEntry> bySize() {
        List<ScreenEntry> copy = new ArrayList<>(screens);
        copy.sort(Comparator.comparingInt(ScreenEntry::size).reversed());
        return List.copyOf(copy);
    }

    /** 人が読む形（そのまま貼れる表）。 */
    public static String render(List<ScreenEntry> screens, boolean showFile, boolean showSize) {
        if (screens.isEmpty()) {
            return "当てはまる画面はありません。";
        }
        int idWidth = 0;
        int titleWidth = 0;
        int whatWidth = 0;
        for (ScreenEntry screen : screens) {
            idWidth = Math.max(idWidth, width(screen.id()));
            titleWidth = Math.max(titleWidth, width(screen.title()));
            whatWidth = Math.max(whatWidth, width(screen.what()));
        }
        StringBuilder out = new StringBuilder("画面 " + screens.size() + " 枚"
                + (showSize ? "（規模の大きい順）" : "") + ":");
        for (ScreenEntry screen : screens) {
            out.append('\n');
            if (showSize) {
                out.append(String.format("%3d  ", screen.size()));
            }
            out.append(pad(screen.id(), idWidth)).append("  ")
                    .append(pad(screen.title(), titleWidth)).append("  ")
                    .append(pad(screen.what(), whatWidth));
            if (showFile && !screen.file().isEmpty()) {
                out.append("  ").append(screen.file());
            }
        }
        return out.toString();
    }

    /** 表示幅（全角は2）。桁を揃えるためだけの目安。 */
    private static int width(String text) {
        int total = 0;
        for (int at = 0; at < text.length(); at++) {
            total += text.charAt(at) > 0xff ? 2 : 1;
        }
        return total;
    }

    private static String pad(String text, int to) {
        int missing = to - width(text);
        return missing > 0 ? text + " ".repeat(missing) : text;
    }
}

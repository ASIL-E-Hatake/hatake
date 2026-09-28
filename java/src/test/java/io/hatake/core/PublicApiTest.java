package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * <b>Java の公開面が、気づかないうちに広がっていないか。</b>
 *
 * <p><a href="../../../../../../../docs/compat.ja.md">1.0 の約束</a>は3版に掛かっているが、
 * 面を固めて見張る仕掛けは TypeScript にしか無かった（0.9.14）。Java は
 * 「{@code io.hatake.core} の public が約束」と書いてあるだけなので、
 * <b>public な型を1つ足せば約束が1つ増える</b>。しかも誰も気づけない。
 * 分ける前の TypeScript とまったく同じ形（{@code export *} で 8日に 2つ増えていた）。
 *
 * <p>この試験は<b>是非を判定しない</b>（何を約束すべきかは人が決める）。やるのは1つで、
 * <b>約束の面が変わったら必ず目に入る</b>ようにすること。
 *
 * <p>台帳を書き直すとき（名前を足す・消すと決めたとき）:
 *
 * <pre>HATAKE_WRITE_PUBLIC_API=1 gradle test --tests '*PublicApiTest'</pre>
 *
 * <p>見ているのは<b>型の名前</b>で、その中の形（引数・戻り値）ではない。形は
 * conformance が縛る。<b>組んだ結果（.class）を読む</b>ので、字の読み違いが起きない
 * （内部クラスも、public なら相手からは呼べるので数える）。
 */
class PublicApiTest {

  /** 組んだ結果の置き場。ここに .class が無いなら、試験より前に組めていない。 */
  private static final Path CLASSES = Path.of("build", "classes", "java", "main");

  private static final Path LEDGER = Path.of("..", "spec", "public-api.java.json");

  @Test
  void theSurfaceMatchesTheLedger() throws IOException {
    assertTrue(Files.isDirectory(CLASSES), CLASSES + " が在りません（先に組んでください）");

    final List<String> found;
    try (Stream<Path> walk = Files.walk(CLASSES)) {
      found = walk.filter(one -> one.toString().endsWith(".class"))
          .map(one -> CLASSES.relativize(one).toString()
              .replace(java.io.File.separatorChar, '.')
              .replaceAll("\\.class$", ""))
          .filter(PublicApiTest::isPublicType)
          .sorted()
          .collect(Collectors.toList());
    }

    if (System.getenv("HATAKE_WRITE_PUBLIC_API") != null) {
      write(found);
      return;
    }

    assertTrue(Files.exists(LEDGER),
        LEDGER + " が在りません（HATAKE_WRITE_PUBLIC_API=1 で作れます）");
    @SuppressWarnings("unchecked")
    final Map<String, Object> committed =
        new Yaml().load(Files.readString(LEDGER));
    @SuppressWarnings("unchecked")
    final List<String> promised = (List<String>) committed.get("types");

    assertEquals(promised, found,
        "Java の公開面が台帳と違います。足すと決めたなら "
            + "HATAKE_WRITE_PUBLIC_API=1 で台帳を書き直してください");
    assertEquals(committed.get("count"), found.size(), "台帳の count が中身と合っていません");

    // **数えられていること自体**も見る（歩き方を間違えたら、この試験は黙って通る）。
    assertTrue(found.size() > 40, "公開面が " + found.size() + " 件しか見つかっていません");
  }

  /** 相手から呼べる型か（public でないものは約束の対象にならない）。 */
  private static boolean isPublicType(String name) {
    try {
      return Modifier.isPublic(Class.forName(name, false,
          PublicApiTest.class.getClassLoader()).getModifiers());
    } catch (ClassNotFoundException | NoClassDefFoundError e) {
      return false;
    }
  }

  private static void write(List<String> found) throws IOException {
    final List<String> lines = new ArrayList<>();
    lines.add("{");
    lines.add("  \"$comment\": \"**約束する面**（Java）。1.0 のあとは、ここから消さない・"
        + "名前を変えない・形を変えない。数えているのは組んだ結果の中の public な型で、"
        + "作り直し方は java/src/test/java/io/hatake/core/PublicApiTest.java の頭。\",");
    lines.add("  \"count\": " + found.size() + ",");
    lines.add("  \"types\": [");
    for (int i = 0; i < found.size(); i++) {
      lines.add("    \"" + found.get(i) + "\"" + (i == found.size() - 1 ? "" : ","));
    }
    lines.add("  ]");
    lines.add("}");
    Files.writeString(LEDGER, String.join("\n", lines) + "\n");
  }
}

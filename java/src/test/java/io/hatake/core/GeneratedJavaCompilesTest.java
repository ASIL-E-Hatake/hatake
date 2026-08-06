package io.hatake.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import javax.tools.JavaCompiler;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.yaml.snakeyaml.Yaml;

/**
 * 生成した Java レコードが<b>実際に javac を通る</b>ことを確認する。
 *
 * <p>コンフォーマンスは「TS と Java が一致する」ことしか言えず、<b>両方が同じ壊れた
 * ソースを吐いている</b>場合を捕まえられない。実際、当初は全レコードを 1 ファイルに
 * まとめて出していて「public トップレベル型は 1 ファイルに 1 つ」に違反しており、
 * このテストが無ければ気づけなかった。
 */
class GeneratedJavaCompilesTest {

    @TestFactory
    @SuppressWarnings("unchecked")
    Stream<DynamicTest> generatedRecordsCompile() throws IOException {
        String content = Files.readString(Path.of("../spec/conformance/dto_native_types.json"));
        Map<String, Object> fixture = (Map<String, Object>) new Yaml().load(content);

        List<Map<String, Object>> cases = (List<Map<String, Object>>) fixture.get("cases");
        return cases.stream().map(c -> DynamicTest.dynamicTest(
                String.valueOf(c.get("name")),
                () -> {
                    Map<String, Object> options = (Map<String, Object>) c.get("javaOptions");
                    String packageName =
                            options != null && options.get("packageName") instanceof String s
                                    ? s
                                    : null;
                    Map<String, List<String>> files =
                            (Map<String, List<String>>) c.get("java");
                    compile(packageName, files);
                }));
    }

    private static void compile(String packageName, Map<String, List<String>> files)
            throws IOException {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        assertTrue(compiler != null, "a JDK (not just a JRE) is required for this test");

        Path root = Files.createTempDirectory("hatake-generated");
        Path dir = packageName == null
                ? root
                : root.resolve(packageName.replace('.', '/'));
        Files.createDirectories(dir);

        List<Path> sources = new ArrayList<>();
        for (Map.Entry<String, List<String>> e : files.entrySet()) {
            Path file = dir.resolve(e.getKey());
            Files.writeString(file, String.join("\n", e.getValue()), StandardCharsets.UTF_8);
            sources.add(file);
        }

        Path classes = Files.createDirectory(root.resolve("classes"));
        try (StandardJavaFileManager fm = compiler.getStandardFileManager(null, null, null)) {
            var units = fm.getJavaFileObjectsFromPaths(sources);
            boolean ok = compiler.getTask(
                    null, fm, null,
                    List.of("-d", classes.toString(), "-encoding", "UTF-8"),
                    null, units).call();
            assertTrue(ok, "generated records did not compile");
        }

        // Every record really produced a class file.
        assertEquals(files.size(), countClassFiles(classes));
    }

    private static long countClassFiles(Path root) throws IOException {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(p -> p.toString().endsWith(".class")).count();
        }
    }
}

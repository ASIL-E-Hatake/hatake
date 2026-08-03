package io.hatake.core;

import java.util.List;
import java.util.Set;

/**
 * ロールによる表示/非表示の出し分け（宣言的な UI レベルの権限制御）。
 *
 * <p>認証・認可そのものは Framework の対象外。ここは許可ロールと現在ユーザの
 * ロール集合を突き合わせるだけ。Dart / TypeScript 版と同じ判定。
 */
public final class Access {

    private Access() {
    }

    /**
     * requiredRoles が空なら誰でも許可。そうでなければ userRoles のいずれかが
     * requiredRoles に含まれるときだけ許可。
     */
    public static boolean isAllowed(List<String> requiredRoles, Set<String> userRoles) {
        if (requiredRoles == null || requiredRoles.isEmpty()) {
            return true;
        }
        for (String r : requiredRoles) {
            if (userRoles.contains(r)) {
                return true;
            }
        }
        return false;
    }
}

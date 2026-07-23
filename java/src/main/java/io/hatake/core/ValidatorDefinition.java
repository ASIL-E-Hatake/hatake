package io.hatake.core;

import java.util.Map;

/**
 * A validation rule. {@code type} selects the validator; {@code params} carries
 * its arguments (e.g. {@code {"value": 20}} for maxLength). {@code message}
 * optionally overrides the default message.
 */
public record ValidatorDefinition(String type, Map<String, Object> params, String message) {
}

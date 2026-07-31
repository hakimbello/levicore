export const MAX_VARIABLE_CHILDREN = 100;
export const MAX_VARIABLE_DEPTH = 8;
export const MAX_VARIABLE_VALUE_LENGTH = 4096;
export const MAX_INLINE_VALUES = 200;
export const MAX_EVALUATION_CACHE_SIZE = 50;
export const MAX_VARIABLE_TREE_RENDER = 200;

export function truncateValue(value: string, maxLength = MAX_VARIABLE_VALUE_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

export function formatCollectionPreview(type: string | undefined, value: string, namedVariables?: number, indexedVariables?: number): string {
  const lowerType = type?.toLowerCase() ?? "";
  const lengthMatch = value.match(/length\s*[=:]\s*(\d+)/i);
  if (lowerType.includes("array") || lowerType.includes("[]")) {
    const count = indexedVariables ?? namedVariables ?? lengthMatch?.[1];
    return count !== undefined ? `${value} (length: ${count})` : value;
  }
  if (lowerType.includes("map") || lowerType.includes("set")) {
    const count = namedVariables ?? indexedVariables ?? lengthMatch?.[1];
    return count !== undefined ? `${value} (size: ${count})` : value;
  }
  if (namedVariables !== undefined && namedVariables > 0) {
    return `${value} (${namedVariables} properties)`;
  }
  return value;
}

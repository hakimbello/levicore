const UNKNOWN = "UNKNOWN";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const GENERATED_PATH_PATTERN = /(^|\/)(coverage|dist|build|out|generated|\.next)($|\/)|(^|\/).*\.min\.[a-z0-9]+$/i;
const DEPENDENCY_PATH_PATTERN = /(^|\/)(node_modules|vendor)($|\/)/i;
const LEVI_RUNTIME_PATTERN = /(^|\/)\.levi($|\/)/;
const SECRET_PATH_PATTERN = /(^|\/|[._-])(env|secret|credential|private[-_]?key|api[-_]?key|token)($|\/|[._-])/i;
const BINARY_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|exe|dll|so|dylib|bin|wasm)$/i;

function searchStructuralIndex(options) {
  validateOptions(options);

  const structuralIndex = options.structuralIndex;

  if (!isUsableIndex(structuralIndex)) {
    return {
      status: UNKNOWN,
      unknown: UNKNOWN,
      reason: "Structural symbol index is unavailable.",
      filters: normalizeFilters(options.filters || options),
      count: 0,
      results: [],
    };
  }

  const filters = normalizeFilters(options.filters || {});
  const limit = normalizeLimit(options.limit);
  const symbols = uniqueSymbols(structuralIndex.symbols)
    .filter((symbol) => !isExcludedSymbol(symbol))
    .filter((symbol) => matchesFilters(symbol, filters))
    .map((symbol) => ({
      rank: rankSymbol(symbol, filters),
      result: searchResult(symbol),
    }))
    .sort(compareRankedResults)
    .slice(0, limit);

  return {
    status: symbols.length > 0 ? "FOUND" : "EMPTY",
    unknown: symbols.length > 0 ? null : UNKNOWN,
    filters,
    count: symbols.length,
    results: symbols.map((entry) => entry.result),
  };
}

function searchProjectSummary(options) {
  validateOptions(options);

  const summary = options.projectSummary || {};

  return searchStructuralIndex({
    structuralIndex: options.structuralIndex || summary.structuralIndex,
    filters: options.filters || {},
    limit: options.limit,
  });
}

function searchStructuralRelationships(options) {
  validateOptions(options);

  const structuralIndex = options.structuralIndex;

  if (!isUsableRelationshipIndex(structuralIndex)) {
    return {
      status: UNKNOWN,
      unknown: UNKNOWN,
      reason: "Structural relationship index is unavailable.",
      filters: normalizeRelationshipFilters(options.filters || options),
      count: 0,
      results: [],
    };
  }

  const filters = normalizeRelationshipFilters(options.filters || {});
  const limit = normalizeLimit(options.limit);
  const relationships = uniqueRelationships(structuralIndex.relationships)
    .filter((relationship) => !isExcludedRelationship(relationship))
    .filter((relationship) => matchesRelationshipFilters(relationship, filters))
    .map((relationship) => ({
      rank: rankRelationship(relationship, filters),
      result: relationshipResult(relationship),
    }))
    .sort(compareRankedRelationshipResults)
    .slice(0, limit);

  return {
    status: relationships.length > 0 ? "FOUND" : "EMPTY",
    unknown: relationships.length > 0 ? null : UNKNOWN,
    filters,
    count: relationships.length,
    results: relationships.map((entry) => entry.result),
  };
}

function searchProjectSummaryRelationships(options) {
  validateOptions(options);

  const summary = options.projectSummary || {};

  return searchStructuralRelationships({
    structuralIndex: options.structuralIndex || summary.structuralIndex,
    filters: options.filters || {},
    limit: options.limit,
  });
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Structural search options are required.");
  }
}

function isUsableIndex(structuralIndex) {
  return isPlainObject(structuralIndex) && Array.isArray(structuralIndex.symbols);
}

function isUsableRelationshipIndex(structuralIndex) {
  return isPlainObject(structuralIndex) && Array.isArray(structuralIndex.relationships);
}

function normalizeFilters(filters) {
  const normalized = {
    symbolNames: normalizeTextFilter(filters.symbolNames || filters.symbolName || filters.name),
    symbolTypes: normalizeTextFilter(filters.symbolTypes || filters.symbolType || filters.type || filters.kind),
    languages: normalizeTextFilter(filters.languages || filters.language),
    paths: normalizePathFilter(filters.paths || filters.path || filters.repositoryPath),
    exported: normalizeExportedFilter(filters.exported),
    modules: normalizeTextFilter(filters.modules || filters.module || filters.modulePath),
    parents: normalizeTextFilter(filters.parents || filters.parent || filters.parentClass),
    routes: normalizeTextFilter(filters.routes || filters.route),
    apiEndpoints: normalizeTextFilter(filters.apiEndpoints || filters.apiEndpoint),
    reactComponents: normalizeTextFilter(filters.reactComponents || filters.reactComponent),
    hooks: normalizeTextFilter(filters.hooks || filters.hook),
    middleware: normalizeTextFilter(filters.middleware),
    configurationFiles: normalizePathFilter(filters.configurationFiles || filters.configurationFile),
    imports: normalizeTextFilter(filters.imports || filters.importName || filters.import),
    exports: normalizeTextFilter(filters.exports || filters.exportName || filters.export),
    keywords: normalizeTextFilter(filters.keywords || filters.keyword),
  };

  return normalized;
}

function normalizeRelationshipFilters(filters) {
  return {
    relationshipTypes: normalizeTextFilter(filters.relationshipTypes || filters.relationshipType || filters.type),
    sourceNames: normalizeTextFilter(filters.sourceNames || filters.sourceName || filters.sourceSymbol),
    targetNames: normalizeTextFilter(filters.targetNames || filters.targetName || filters.targetSymbol),
    sourcePaths: normalizePathFilter(filters.sourcePaths || filters.sourcePath || filters.path),
    targetPaths: normalizePathFilter(filters.targetPaths || filters.targetPath),
    confidenceStates: normalizeTextFilter(filters.confidenceStates || filters.confidenceState || filters.confidence),
    keywords: normalizeTextFilter(filters.keywords || filters.keyword),
  };
}

function normalizeTextFilter(value) {
  return uniqueSorted(asArray(value).map(stringOrUnknown).filter((entry) => entry !== UNKNOWN));
}

function normalizePathFilter(value) {
  return uniqueSorted(
    asArray(value)
      .map((entry) => stringOrUnknown(entry).replace(/\\/g, "/"))
      .filter((entry) => entry !== UNKNOWN && !isExcludedPath(entry)),
  );
}

function normalizeExportedFilter(value) {
  if (value === undefined || value === null || value === UNKNOWN) {
    return UNKNOWN;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true" || normalized === "exported") {
    return true;
  }

  if (normalized === "false" || normalized === "internal" || normalized === "not-exported") {
    return false;
  }

  return UNKNOWN;
}

function normalizeLimit(limit) {
  if (limit === undefined || limit === null) {
    return DEFAULT_LIMIT;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(limit, MAX_LIMIT);
}

function matchesFilters(symbol, filters) {
  return (
    matchesText(symbol.name, filters.symbolNames) &&
    matchesText(symbol.type, filters.symbolTypes) &&
    matchesText(symbol.language, filters.languages) &&
    matchesPath(symbol.path, filters.paths) &&
    matchesExported(symbol.exported, filters.exported) &&
    matchesModule(symbol, filters.modules) &&
    matchesText(symbol.parent, filters.parents) &&
    matchesTypedName(symbol, "route", filters.routes) &&
    matchesTypedName(symbol, "api-endpoint", filters.apiEndpoints) &&
    matchesTypedName(symbol, "react-component", filters.reactComponents) &&
    matchesTypedName(symbol, "hook", filters.hooks) &&
    matchesTypedName(symbol, "middleware", filters.middleware) &&
    matchesTypedPath(symbol, "configuration", filters.configurationFiles) &&
    matchesTypedName(symbol, "import", filters.imports) &&
    matchesTypedName(symbol, "export", filters.exports) &&
    matchesKeywords(symbol, filters.keywords)
  );
}

function matchesText(value, filters) {
  if (filters.length === 0) {
    return true;
  }

  const normalized = stringOrUnknown(value).toLowerCase();

  return filters.some((filter) => {
    const expected = filter.toLowerCase();
    return normalized === expected || normalized.includes(expected);
  });
}

function matchesPath(value, filters) {
  if (filters.length === 0) {
    return true;
  }

  const normalized = stringOrUnknown(value).replace(/\\/g, "/").toLowerCase();

  return filters.some((filter) => {
    const expected = filter.toLowerCase();
    return normalized === expected || normalized.startsWith(`${expected}/`) || normalized.includes(expected);
  });
}

function matchesExported(value, filter) {
  return filter === UNKNOWN || Boolean(value) === filter;
}

function matchesModule(symbol, filters) {
  if (filters.length === 0) {
    return true;
  }

  return matchesText(symbol.name, filters) || matchesPath(symbol.path, filters) || matchesText(symbol.parent, filters);
}

function matchesTypedName(symbol, type, filters) {
  if (filters.length === 0) {
    return true;
  }

  return symbol.type === type && matchesText(symbol.name, filters);
}

function matchesTypedPath(symbol, type, filters) {
  if (filters.length === 0) {
    return true;
  }

  return symbol.type === type && (matchesPath(symbol.path, filters) || matchesText(symbol.name, filters));
}

function matchesKeywords(symbol, keywords) {
  if (keywords.length === 0) {
    return true;
  }

  const haystack = stableSerialize(symbol).toLowerCase();

  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function searchResult(symbol) {
  return {
    symbolId: stringOrUnknown(symbol.symbolId),
    name: stringOrUnknown(symbol.name),
    type: stringOrUnknown(symbol.type),
    path: stringOrUnknown(symbol.path),
    lineNumber: normalizeLineNumber(symbol.lineNumber),
    language: stringOrUnknown(symbol.language),
    parent: stringOrUnknown(symbol.parent),
    exported: Boolean(symbol.exported),
    evidence: normalizeEvidence(symbol.evidence),
  };
}

function relationshipResult(relationship) {
  return {
    sourceSymbol: normalizeSymbolReference(relationship.sourceSymbol),
    relationshipType: stringOrUnknown(relationship.relationshipType),
    targetSymbol: normalizeSymbolReference(relationship.targetSymbol),
    targetPath: stringOrUnknown(relationship.targetPath),
    sourcePath: stringOrUnknown(relationship.sourcePath),
    lineNumber: normalizeLineNumber(relationship.lineNumber),
    evidence: normalizeEvidence(relationship.evidence),
    confidenceState: stringOrUnknown(relationship.confidenceState),
  };
}

function normalizeSymbolReference(symbol) {
  if (!isPlainObject(symbol)) {
    return UNKNOWN;
  }

  return {
    symbolId: stringOrUnknown(symbol.symbolId),
    name: stringOrUnknown(symbol.name),
    type: stringOrUnknown(symbol.type),
    path: stringOrUnknown(symbol.path),
    lineNumber: normalizeLineNumber(symbol.lineNumber),
    language: stringOrUnknown(symbol.language),
    parent: stringOrUnknown(symbol.parent),
    exported: Boolean(symbol.exported),
    evidence: normalizeEvidence(symbol.evidence),
  };
}

function rankSymbol(symbol, filters) {
  let rank = 0;

  rank += rankText(symbol.name, filters.symbolNames, 50);
  rank += rankText(symbol.type, filters.symbolTypes, 40);
  rank += rankText(symbol.language, filters.languages, 25);
  rank += rankPath(symbol.path, filters.paths, 30);
  rank += rankText(symbol.parent, filters.parents, 20);
  rank += rankText(symbol.name, filters.routes, symbol.type === "route" ? 35 : 0);
  rank += rankText(symbol.name, filters.apiEndpoints, symbol.type === "api-endpoint" ? 35 : 0);
  rank += rankText(symbol.name, filters.reactComponents, symbol.type === "react-component" ? 35 : 0);
  rank += rankText(symbol.name, filters.hooks, symbol.type === "hook" ? 35 : 0);
  rank += rankText(symbol.name, filters.middleware, symbol.type === "middleware" ? 35 : 0);
  rank += rankPath(symbol.path, filters.configurationFiles, symbol.type === "configuration" ? 35 : 0);
  rank += rankText(symbol.name, filters.imports, symbol.type === "import" ? 35 : 0);
  rank += rankText(symbol.name, filters.exports, symbol.type === "export" ? 35 : 0);
  rank += rankKeywords(symbol, filters.keywords);

  if (filters.exported !== UNKNOWN && Boolean(symbol.exported) === filters.exported) {
    rank += 10;
  }

  return rank;
}

function rankRelationship(relationship, filters) {
  let rank = 0;

  rank += rankText(relationship.relationshipType, filters.relationshipTypes, 50);
  rank += rankText(symbolName(relationship.sourceSymbol), filters.sourceNames, 35);
  rank += rankText(symbolName(relationship.targetSymbol), filters.targetNames, 35);
  rank += rankPath(relationship.sourcePath, filters.sourcePaths, 30);
  rank += rankPath(relationship.targetPath, filters.targetPaths, 30);
  rank += rankText(relationship.confidenceState, filters.confidenceStates, 20);
  rank += rankKeywords(relationship, filters.keywords);

  return rank;
}

function matchesRelationshipFilters(relationship, filters) {
  return (
    matchesText(relationship.relationshipType, filters.relationshipTypes) &&
    matchesText(symbolName(relationship.sourceSymbol), filters.sourceNames) &&
    matchesText(symbolName(relationship.targetSymbol), filters.targetNames) &&
    matchesPath(relationship.sourcePath, filters.sourcePaths) &&
    matchesPath(relationship.targetPath, filters.targetPaths) &&
    matchesText(relationship.confidenceState, filters.confidenceStates) &&
    matchesRelationshipKeywords(relationship, filters.keywords)
  );
}

function matchesRelationshipKeywords(relationship, keywords) {
  if (keywords.length === 0) {
    return true;
  }

  const haystack = stableSerialize(relationshipResult(relationship)).toLowerCase();

  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function rankText(value, filters, weight) {
  if (filters.length === 0 || weight === 0) {
    return 0;
  }

  const normalized = stringOrUnknown(value).toLowerCase();

  if (filters.some((filter) => normalized === filter.toLowerCase())) {
    return weight;
  }

  if (filters.some((filter) => normalized.startsWith(filter.toLowerCase()))) {
    return Math.floor(weight * 0.75);
  }

  if (filters.some((filter) => normalized.includes(filter.toLowerCase()))) {
    return Math.floor(weight * 0.5);
  }

  return 0;
}

function rankPath(value, filters, weight) {
  if (filters.length === 0 || weight === 0) {
    return 0;
  }

  const normalized = stringOrUnknown(value).replace(/\\/g, "/").toLowerCase();

  if (filters.some((filter) => normalized === filter.toLowerCase())) {
    return weight;
  }

  if (filters.some((filter) => normalized.startsWith(filter.toLowerCase()))) {
    return Math.floor(weight * 0.75);
  }

  if (filters.some((filter) => normalized.includes(filter.toLowerCase()))) {
    return Math.floor(weight * 0.5);
  }

  return 0;
}

function rankKeywords(symbol, keywords) {
  if (keywords.length === 0) {
    return 0;
  }

  const haystack = stableSerialize(symbol).toLowerCase();
  return keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length * 5;
}

function uniqueSymbols(symbols) {
  const byId = new Map();

  for (const symbol of symbols) {
    if (!isPlainObject(symbol) || isExcludedSymbol(symbol)) {
      continue;
    }

    const id = stringOrUnknown(symbol.symbolId);
    const fingerprint = id === UNKNOWN ? stableSerialize(searchResult(symbol)) : id;

    if (!byId.has(fingerprint)) {
      byId.set(fingerprint, symbol);
      continue;
    }

    const current = byId.get(fingerprint);

    if (compareSymbols(symbol, current) < 0) {
      byId.set(fingerprint, symbol);
    }
  }

  return Array.from(byId.values()).sort(compareSymbols);
}

function uniqueRelationships(relationships) {
  const byFingerprint = new Map();

  for (const relationship of relationships) {
    if (!isPlainObject(relationship) || isExcludedRelationship(relationship)) {
      continue;
    }

    const fingerprint = stableSerialize(relationshipResult(relationship));

    if (!byFingerprint.has(fingerprint)) {
      byFingerprint.set(fingerprint, relationship);
      continue;
    }

    const current = byFingerprint.get(fingerprint);

    if (compareRelationships(relationship, current) < 0) {
      byFingerprint.set(fingerprint, relationship);
    }
  }

  return Array.from(byFingerprint.values()).sort(compareRelationships);
}

function normalizeEvidence(evidence) {
  if (!isPlainObject(evidence)) {
    return {
      source: UNKNOWN,
      signal: UNKNOWN,
    };
  }

  const source = stringOrUnknown(evidence.source).replace(/\\/g, "/");

  return {
    source: isExcludedPath(source) ? UNKNOWN : source,
    signal: stringOrUnknown(evidence.signal),
  };
}

function isExcludedSymbol(symbol) {
  return isExcludedPath(symbol.path) || isExcludedPath(symbol.name) || isExcludedPath(symbol.parent);
}

function isExcludedRelationship(relationship) {
  return (
    isExcludedPath(relationship.sourcePath) ||
    isExcludedPath(relationship.targetPath) ||
    isExcludedSymbol(relationship.sourceSymbol) ||
    isExcludedSymbol(relationship.targetSymbol)
  );
}

function isExcludedPath(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.replace(/\\/g, "/");

  return (
    LEVI_RUNTIME_PATTERN.test(normalized) ||
    GENERATED_PATH_PATTERN.test(normalized) ||
    DEPENDENCY_PATH_PATTERN.test(normalized) ||
    SECRET_PATH_PATTERN.test(normalized) ||
    BINARY_EXTENSION_PATTERN.test(normalized)
  );
}

function compareRankedResults(left, right) {
  const leftResult = left.result;
  const rightResult = right.result;

  return (
    right.rank - left.rank ||
    leftResult.path.localeCompare(rightResult.path) ||
    compareLineNumbers(leftResult.lineNumber, rightResult.lineNumber) ||
    leftResult.type.localeCompare(rightResult.type) ||
    leftResult.name.localeCompare(rightResult.name) ||
    leftResult.symbolId.localeCompare(rightResult.symbolId)
  );
}

function compareRankedRelationshipResults(left, right) {
  const leftResult = left.result;
  const rightResult = right.result;

  return (
    right.rank - left.rank ||
    leftResult.sourcePath.localeCompare(rightResult.sourcePath) ||
    compareLineNumbers(leftResult.lineNumber, rightResult.lineNumber) ||
    leftResult.relationshipType.localeCompare(rightResult.relationshipType) ||
    stableSerialize(leftResult.sourceSymbol).localeCompare(stableSerialize(rightResult.sourceSymbol)) ||
    stableSerialize(leftResult.targetSymbol).localeCompare(stableSerialize(rightResult.targetSymbol)) ||
    leftResult.targetPath.localeCompare(rightResult.targetPath)
  );
}

function compareRelationships(left, right) {
  return (
    stringOrUnknown(left.sourcePath).localeCompare(stringOrUnknown(right.sourcePath)) ||
    compareLineNumbers(left.lineNumber, right.lineNumber) ||
    stringOrUnknown(left.relationshipType).localeCompare(stringOrUnknown(right.relationshipType)) ||
    stableSerialize(left.sourceSymbol).localeCompare(stableSerialize(right.sourceSymbol)) ||
    stableSerialize(left.targetSymbol).localeCompare(stableSerialize(right.targetSymbol)) ||
    stringOrUnknown(left.targetPath).localeCompare(stringOrUnknown(right.targetPath))
  );
}

function compareSymbols(left, right) {
  return (
    stringOrUnknown(left.path).localeCompare(stringOrUnknown(right.path)) ||
    compareLineNumbers(left.lineNumber, right.lineNumber) ||
    stringOrUnknown(left.type).localeCompare(stringOrUnknown(right.type)) ||
    stringOrUnknown(left.name).localeCompare(stringOrUnknown(right.name)) ||
    stringOrUnknown(left.symbolId).localeCompare(stringOrUnknown(right.symbolId))
  );
}

function compareLineNumbers(left, right) {
  const leftNumber = Number.isInteger(left) ? left : Number.MAX_SAFE_INTEGER;
  const rightNumber = Number.isInteger(right) ? right : Number.MAX_SAFE_INTEGER;
  return leftNumber - rightNumber;
}

function normalizeLineNumber(lineNumber) {
  return Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : UNKNOWN;
}

function symbolName(symbol) {
  if (!isPlainObject(symbol)) {
    return UNKNOWN;
  }

  return stringOrUnknown(symbol.name);
}

function asArray(value) {
  if (value === undefined || value === null || value === UNKNOWN) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

function stringOrUnknown(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  const text = String(value).trim();
  return text === "" ? UNKNOWN : text;
}

function stableSerialize(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  if (typeof value === "string") {
    return value.trim() === "" ? UNKNOWN : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(", ")}]`;
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${key}: ${stableSerialize(value[key])}`)
    .join(", ")}}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  UNKNOWN,
  searchProjectSummary,
  searchProjectSummaryRelationships,
  searchStructuralRelationships,
  searchStructuralIndex,
};

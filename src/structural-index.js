const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const UNKNOWN = "UNKNOWN";
const JAVASCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const PYTHON_EXTENSIONS = new Set([".py"]);
const CONFIG_FILE_PATTERNS = [
  /^package\.json$/,
  /^tsconfig\.json$/,
  /^jsconfig\.json$/,
  /^next\.config\.[cm]?js$/,
  /^vite\.config\.[cm]?[jt]s$/,
  /^webpack\.config\.[cm]?js$/,
  /^eslint\.config\.[cm]?js$/,
  /^\.eslintrc(\.[a-z0-9]+)?$/,
  /^\.prettierrc(\.[a-z0-9]+)?$/,
  /^pyproject\.toml$/,
  /^requirements\.txt$/,
  /^pytest\.ini$/,
  /^setup\.py$/,
  /^tox\.ini$/,
  /^docker-compose\.ya?ml$/,
  /^Dockerfile$/,
];
const GENERATED_PATH_PATTERN = /(^|\/)(coverage|dist|build|out|generated|\.next)($|\/)|(^|\/).*\.min\.[a-z0-9]+$/i;
const DEPENDENCY_PATH_PATTERN = /(^|\/)(node_modules|vendor)($|\/)/i;
const LEVI_RUNTIME_PATTERN = /(^|\/)\.levi($|\/)/;
const SECRET_PATH_PATTERN = /(^|\/|[._-])(env|secret|credential|private[-_]?key|api[-_]?key|token)($|\/|[._-])/i;
const BINARY_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|exe|dll|so|dylib|bin|wasm)$/i;
const JS_KEYWORDS = new Set(["catch", "for", "if", "switch", "while"]);
const JS_NON_CALL_IDENTIFIERS = new Set([
  "Array",
  "Boolean",
  "Date",
  "Error",
  "JSON",
  "Math",
  "Number",
  "Object",
  "Promise",
  "RegExp",
  "String",
  "catch",
  "else",
  "for",
  "function",
  "if",
  "new",
  "require",
  "return",
  "switch",
  "throw",
  "while",
]);

function buildStructuralIndex(scanResult) {
  validateScanResult(scanResult);

  const symbolsByFingerprint = new Map();
  const rawRelationships = [];
  const unsupported = [];
  const parseFailures = [];
  const files = safeFiles(scanResult.files);

  for (const file of files) {
    if (isConfigurationFile(file.path)) {
      addSymbol(symbolsByFingerprint, createSymbol({
        name: file.path,
        type: "configuration",
        path: file.path,
        lineNumber: 1,
        language: "Configuration",
        parent: UNKNOWN,
        exported: false,
        signal: "configuration filename",
      }));
      rawRelationships.push(...indexConfigurationRelationships(scanResult.root, file.path));
    }

    const extension = path.extname(file.path).toLowerCase();

    if (JAVASCRIPT_EXTENSIONS.has(extension)) {
      parseSourceFile({
        scanRoot: scanResult.root,
        file,
        parser: indexJavaScript,
        symbolsByFingerprint,
        rawRelationships,
        parseFailures,
      });
      continue;
    }

    if (PYTHON_EXTENSIONS.has(extension)) {
      parseSourceFile({
        scanRoot: scanResult.root,
        file,
        parser: indexPython,
        symbolsByFingerprint,
        rawRelationships,
        parseFailures,
      });
      continue;
    }

    if (isSourceLikeExtension(extension)) {
      unsupported.push({
        path: file.path,
        language: UNKNOWN,
        reason: "Unsupported language for structural symbol indexing.",
      });
    }
  }

  addDetectedEntryPoints(symbolsByFingerprint, scanResult, files);

  const symbols = Array.from(symbolsByFingerprint.values())
    .sort(compareSymbols)
    .map((symbol) => scopeSymbolId(symbol, scanResult.root));
  const relationships = buildRelationships(rawRelationships, symbols, files, scanResult.root);

  return {
    status: symbols.length > 0 ? "INDEXED" : UNKNOWN,
    unknown: symbols.length > 0 ? null : UNKNOWN,
    symbols,
    relationships,
    unsupported: unsupported.sort(comparePathEntries),
    parseFailures: parseFailures.sort(comparePathEntries),
  };
}

function addDetectedEntryPoints(symbolsByFingerprint, scanResult, files) {
  const entries = scanResult.detected && Array.isArray(scanResult.detected.entryPoints) ? scanResult.detected.entryPoints : [];
  const knownFiles = new Set(files.map((file) => file.path));

  for (const entry of entries) {
    if (!entry || typeof entry.name !== "string") {
      continue;
    }

    const entryPath = normalizeRelativePath(entry.name);
    const evidence = Array.isArray(entry.evidence) ? entry.evidence[0] : null;
    const evidencePath = evidence && typeof evidence.source === "string" ? normalizeRelativePath(evidence.source) : UNKNOWN;
    const sourcePath = knownFiles.has(entryPath) ? entryPath : evidencePath;

    if (sourcePath === UNKNOWN || !knownFiles.has(sourcePath)) {
      continue;
    }

    addSymbol(symbolsByFingerprint, createSymbol({
      name: entry.name,
      type: "entry-point",
      path: sourcePath,
      lineNumber: 1,
      language: languageForPath(sourcePath),
      parent: moduleName(sourcePath),
      exported: false,
      signal: evidence && evidence.signal ? evidence.signal : "entry point evidence",
    }));
  }
}

function parseSourceFile(options) {
  let contents;

  try {
    contents = fs.readFileSync(path.join(options.scanRoot, options.file.path), "utf8");
  } catch (error) {
    options.parseFailures.push({
      path: options.file.path,
      reason: "Unreadable source file.",
    });
    return;
  }

  try {
    const parsed = options.parser(options.file.path, contents);
    const parsedSymbols = Array.isArray(parsed) ? parsed : parsed.symbols || [];
    const parsedRelationships = Array.isArray(parsed.relationships) ? parsed.relationships : [];

    for (const symbol of parsedSymbols) {
      addSymbol(options.symbolsByFingerprint, symbol);
    }

    options.rawRelationships.push(...parsedRelationships);
  } catch (error) {
    options.parseFailures.push({
      path: options.file.path,
      reason: "Source structure could not be indexed.",
    });
  }
}

function indexJavaScript(relativePath, contents) {
  const language = path.extname(relativePath).toLowerCase().includes("ts") ? "TypeScript" : "JavaScript";
  const lines = contents.split(/\r?\n/);
  const symbols = [
    createSymbol({
      name: moduleName(relativePath),
      type: "module",
      path: relativePath,
      lineNumber: 1,
      language,
      parent: UNKNOWN,
      exported: false,
      signal: "source module",
    }),
  ];
  let currentClass = null;
  let classBraceDepth = 0;
  let pendingRoute = null;
  let currentSource = moduleName(relativePath);
  let currentSourceType = "module";
  const relationships = [];

  addRouteSymbolsForPath(symbols, relativePath, language);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("//")) {
      return;
    }

    addJavaScriptImport(symbols, relationships, trimmed, relativePath, lineNumber, language);
    addJavaScriptExportOnly(symbols, relationships, trimmed, relativePath, lineNumber, language);

    const route = javascriptRoute(trimmed);

    if (route) {
      symbols.push(createSymbol({
        name: route.name,
        type: route.type,
        path: relativePath,
        lineNumber,
        language,
        parent: moduleName(relativePath),
        exported: false,
        signal: route.signal,
      }));
      relationships.push(createRawRelationship({
        sourceName: moduleName(relativePath),
        sourceType: "module",
        relationshipType: `${route.type}-to-handler`,
        targetName: route.handler,
        targetPath: relativePath,
        sourcePath: relativePath,
        lineNumber,
        signal: `${route.signal}: ${route.handler || UNKNOWN}`,
      }));
      pendingRoute = route.name;
    }

    if (isMiddlewareLine(trimmed, relativePath)) {
      symbols.push(createSymbol({
        name: middlewareName(trimmed, relativePath),
        type: "middleware",
        path: relativePath,
        lineNumber,
        language,
        parent: moduleName(relativePath),
        exported: hasExport(trimmed),
        signal: "middleware evidence",
      }));
      relationships.push(createRawRelationship({
        sourceName: moduleName(relativePath),
        sourceType: "module",
        relationshipType: "middleware-usage",
        targetName: middlewareName(trimmed, relativePath),
        targetPath: relativePath,
        sourcePath: relativePath,
        lineNumber,
        signal: "middleware usage",
      }));
    }

    const classMatch = trimmed.match(/^(?:export\s+default\s+|export\s+)?class\s+([A-Za-z_$][\w$]*)/);

    if (classMatch) {
      const exported = hasExport(trimmed);
      const className = classMatch[1];
      const inheritance = javascriptInheritance(trimmed);
      symbols.push(createSymbol({
        name: className,
        type: "class",
        path: relativePath,
        lineNumber,
        language,
        parent: moduleName(relativePath),
        exported,
        signal: exported ? "exported class declaration" : "class declaration",
      }));
      if (inheritance.extendsName) {
        relationships.push(createRawRelationship({
          sourceName: className,
          sourceType: "class",
          relationshipType: "class-inheritance",
          targetName: inheritance.extendsName,
          sourcePath: relativePath,
          lineNumber,
          signal: "extends clause",
        }));
      }
      for (const implementedName of inheritance.implementsNames) {
        relationships.push(createRawRelationship({
          sourceName: className,
          sourceType: "class",
          relationshipType: "interface-implementation",
          targetName: implementedName,
          sourcePath: relativePath,
          lineNumber,
          signal: "implements clause",
        }));
      }
      currentClass = className;
      currentSource = className;
      currentSourceType = "class";
      classBraceDepth = braceDelta(line);
      pendingRoute = null;
      return;
    }

    if (currentClass) {
      const method = trimmed.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/);

      if (method && !JS_KEYWORDS.has(method[1])) {
        symbols.push(createSymbol({
          name: method[1],
          type: "method",
          path: relativePath,
          lineNumber,
          language,
          parent: currentClass,
          exported: false,
          signal: "class method declaration",
        }));
        currentSource = method[1];
        currentSourceType = "method";
        addJavaScriptCallRelationships(relationships, trimmed, relativePath, lineNumber, currentSource, currentSourceType);
      }

      classBraceDepth += braceDelta(line);

      if (classBraceDepth <= 0) {
        currentClass = null;
        classBraceDepth = 0;
        currentSource = moduleName(relativePath);
        currentSourceType = "module";
      }

      return;
    }

    addTypeScriptSymbol(symbols, trimmed, relativePath, lineNumber, language);
    const addedSource = addJavaScriptFunctionOrVariable(
      symbols,
      relationships,
      trimmed,
      relativePath,
      lineNumber,
      language,
      pendingRoute,
    );

    if (addedSource) {
      currentSource = addedSource.name;
      currentSourceType = addedSource.type;
    } else {
      addJavaScriptCallRelationships(relationships, trimmed, relativePath, lineNumber, currentSource, currentSourceType);
      addReactUsageRelationships(relationships, trimmed, relativePath, lineNumber, currentSource, currentSourceType);
    }
    pendingRoute = null;
  });

  return {
    symbols,
    relationships,
  };
}

function addJavaScriptImport(symbols, relationships, trimmed, relativePath, lineNumber, language) {
  const importMatch =
    trimmed.match(/^import\s+(?:.+?\s+from\s+)?["']([^"']+)["']/) ||
    trimmed.match(/^(?:const|let|var)\s+.+?\s*=\s*require\(["']([^"']+)["']\)/);

  if (!importMatch) {
    return;
  }

  symbols.push(createSymbol({
    name: importMatch[1],
    type: "import",
    path: relativePath,
    lineNumber,
    language,
    parent: moduleName(relativePath),
    exported: false,
      signal: "import declaration",
    }));
  relationships.push(createRawRelationship({
    sourceName: moduleName(relativePath),
    sourceType: "module",
    relationshipType: "import",
    targetName: importMatch[1],
    targetPath: importMatch[1],
    sourcePath: relativePath,
    lineNumber,
    signal: "import declaration",
  }));
  relationships.push(createRawRelationship({
    sourceName: moduleName(relativePath),
    sourceType: "module",
    relationshipType: "module-dependency",
    targetName: importMatch[1],
    targetPath: importMatch[1],
    sourcePath: relativePath,
    lineNumber,
    signal: "module import dependency",
  }));
}

function addJavaScriptExportOnly(symbols, relationships, trimmed, relativePath, lineNumber, language) {
  const exportMatch = trimmed.match(/^export\s+(?:default\s+)?\{?\s*([A-Za-z_$][\w$]*)?/);

  if (!exportMatch || /^(export\s+(class|function|const|let|var|interface|type|enum)\b)/.test(trimmed)) {
    return;
  }

  symbols.push(createSymbol({
    name: exportMatch[1] || "default",
    type: "export",
    path: relativePath,
    lineNumber,
    language,
    parent: moduleName(relativePath),
    exported: true,
      signal: "export declaration",
    }));
  relationships.push(createRawRelationship({
    sourceName: moduleName(relativePath),
    sourceType: "module",
    relationshipType: "export",
    targetName: exportMatch[1] || "default",
    sourcePath: relativePath,
    lineNumber,
    signal: "export declaration",
  }));
}

function addTypeScriptSymbol(symbols, trimmed, relativePath, lineNumber, language) {
  const match = trimmed.match(/^(?:export\s+)?(interface|type|enum)\s+([A-Za-z_$][\w$]*)/);

  if (!match) {
    return;
  }

  symbols.push(createSymbol({
    name: match[2],
    type: match[1],
    path: relativePath,
    lineNumber,
    language,
    parent: moduleName(relativePath),
    exported: hasExport(trimmed),
    signal: `${match[1]} declaration`,
  }));
}

function addJavaScriptFunctionOrVariable(symbols, relationships, trimmed, relativePath, lineNumber, language, pendingRoute) {
  const functionMatch = trimmed.match(/^(?:export\s+default\s+|export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);

  if (functionMatch) {
    const sourceType = reactFunctionType(functionMatch[1], relativePath);
    symbols.push(functionLikeSymbol({
      name: functionMatch[1],
      relativePath,
      lineNumber,
      language,
      exported: hasExport(trimmed),
      signal: pendingRoute ? `route handler for ${pendingRoute}` : "function declaration",
    }));
    if (hasExport(trimmed)) {
      relationships.push(createRawRelationship({
        sourceName: moduleName(relativePath),
        sourceType: "module",
        relationshipType: "export",
        targetName: functionMatch[1],
        sourcePath: relativePath,
        lineNumber,
        signal: "exported function declaration",
      }));
    }
    return {
      name: functionMatch[1],
      type: sourceType,
    };
  }

  const assignmentMatch = trimmed.match(/^(?:export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/);

  if (!assignmentMatch) {
    return null;
  }

  const declaration = assignmentMatch[1];
  const name = assignmentMatch[2];
  const value = assignmentMatch[3];
  const isFunctionValue = value.includes("=>") || value.startsWith("function");

  if (isFunctionValue) {
    const sourceType = reactFunctionType(name, relativePath);
    symbols.push(functionLikeSymbol({
      name,
      relativePath,
      lineNumber,
      language,
      exported: hasExport(trimmed),
      signal: pendingRoute ? `route handler for ${pendingRoute}` : "function expression",
    }));
    if (hasExport(trimmed)) {
      relationships.push(createRawRelationship({
        sourceName: moduleName(relativePath),
        sourceType: "module",
        relationshipType: "export",
        targetName: name,
        sourcePath: relativePath,
        lineNumber,
        signal: "exported function expression",
      }));
    }
    return {
      name,
      type: sourceType,
    };
  }

  symbols.push(createSymbol({
    name,
    type: declaration === "const" ? "constant" : "variable",
    path: relativePath,
    lineNumber,
    language,
    parent: moduleName(relativePath),
    exported: hasExport(trimmed),
    signal: `${declaration} declaration`,
  }));
  if (hasExport(trimmed)) {
    relationships.push(createRawRelationship({
      sourceName: moduleName(relativePath),
      sourceType: "module",
      relationshipType: "export",
      targetName: name,
      sourcePath: relativePath,
      lineNumber,
      signal: "exported variable declaration",
    }));
  }
  return null;
}

function indexPython(relativePath, contents) {
  const language = "Python";
  const lines = contents.split(/\r?\n/);
  const symbols = [
    createSymbol({
      name: moduleName(relativePath),
      type: "module",
      path: relativePath,
      lineNumber: 1,
      language,
      parent: UNKNOWN,
      exported: false,
      signal: "source module",
    }),
  ];
  let currentClass = null;
  let classIndent = -1;
  let pendingRoute = null;
  let currentSource = moduleName(relativePath);
  let currentSourceType = "module";
  const relationships = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const indent = line.match(/^\s*/)[0].length;

    if (currentClass && indent <= classIndent && !trimmed.startsWith("@")) {
      currentClass = null;
      classIndent = -1;
    }

    addPythonImport(symbols, relationships, trimmed, relativePath, lineNumber, language);

    const route = pythonRoute(trimmed);

    if (route) {
      symbols.push(createSymbol({
        name: route.name,
        type: route.type,
        path: relativePath,
        lineNumber,
        language,
        parent: moduleName(relativePath),
        exported: false,
        signal: route.signal,
      }));
      relationships.push(createRawRelationship({
        sourceName: moduleName(relativePath),
        sourceType: "module",
        relationshipType: "api-endpoint-to-handler",
        targetName: UNKNOWN,
        targetPath: relativePath,
        sourcePath: relativePath,
        lineNumber,
        signal: route.signal,
      }));
      pendingRoute = route.name;
      return;
    }

    if (/^@.+\.middleware\(/.test(trimmed)) {
      symbols.push(createSymbol({
        name: "middleware",
        type: "middleware",
        path: relativePath,
        lineNumber,
        language,
        parent: moduleName(relativePath),
        exported: false,
        signal: "middleware decorator",
      }));
      relationships.push(createRawRelationship({
        sourceName: moduleName(relativePath),
        sourceType: "module",
        relationshipType: "middleware-usage",
        targetName: "middleware",
        targetPath: relativePath,
        sourcePath: relativePath,
        lineNumber,
        signal: "middleware decorator",
      }));
      return;
    }

    const classMatch = trimmed.match(/^class\s+([A-Za-z_]\w*)/);

    if (classMatch) {
      currentClass = classMatch[1];
      classIndent = indent;
      const baseClass = pythonBaseClass(trimmed);
      symbols.push(createSymbol({
        name: classMatch[1],
        type: "class",
        path: relativePath,
        lineNumber,
        language,
        parent: moduleName(relativePath),
        exported: pythonExportedName(classMatch[1]),
        signal: "class declaration",
      }));
      if (baseClass) {
        relationships.push(createRawRelationship({
          sourceName: classMatch[1],
          sourceType: "class",
          relationshipType: "class-inheritance",
          targetName: baseClass,
          sourcePath: relativePath,
          lineNumber,
          signal: "base class declaration",
        }));
      }
      pendingRoute = null;
      currentSource = classMatch[1];
      currentSourceType = "class";
      return;
    }

    const functionMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);

    if (functionMatch) {
      const name = functionMatch[1];
      symbols.push(createSymbol({
        name,
        type: currentClass ? "method" : "function",
        path: relativePath,
        lineNumber,
        language,
        parent: currentClass || moduleName(relativePath),
        exported: currentClass ? false : pythonExportedName(name),
        signal: pendingRoute ? `route handler for ${pendingRoute}` : "function declaration",
      }));
      if (pendingRoute) {
        relationships.push(createRawRelationship({
          sourceName: moduleName(relativePath),
          sourceType: "module",
          relationshipType: "api-endpoint-to-handler",
          targetName: name,
          targetPath: relativePath,
          sourcePath: relativePath,
          lineNumber,
          signal: `route handler for ${pendingRoute}`,
        }));
      }
      currentSource = name;
      currentSourceType = currentClass ? "method" : "function";
      pendingRoute = null;
      return;
    }

    addPythonCallRelationships(relationships, trimmed, relativePath, lineNumber, currentSource, currentSourceType);
    addPythonVariable(symbols, trimmed, relativePath, lineNumber, language);
  });

  return {
    symbols,
    relationships,
  };
}

function addPythonImport(symbols, relationships, trimmed, relativePath, lineNumber, language) {
  const importMatch = trimmed.match(/^import\s+([A-Za-z_][\w.]*)/) || trimmed.match(/^from\s+([A-Za-z_][\w.]*)\s+import\s+/);

  if (!importMatch) {
    return;
  }

  symbols.push(createSymbol({
    name: importMatch[1],
    type: "import",
    path: relativePath,
    lineNumber,
    language,
    parent: moduleName(relativePath),
    exported: false,
      signal: "import declaration",
    }));
  relationships.push(createRawRelationship({
    sourceName: moduleName(relativePath),
    sourceType: "module",
    relationshipType: "import",
    targetName: importMatch[1],
    targetPath: importMatch[1],
    sourcePath: relativePath,
    lineNumber,
    signal: "import declaration",
  }));
  relationships.push(createRawRelationship({
    sourceName: moduleName(relativePath),
    sourceType: "module",
    relationshipType: "module-dependency",
    targetName: importMatch[1],
    targetPath: importMatch[1],
    sourcePath: relativePath,
    lineNumber,
    signal: "module import dependency",
  }));
}

function addPythonVariable(symbols, trimmed, relativePath, lineNumber, language) {
  const match = trimmed.match(/^([A-Za-z_]\w*)\s*=\s*.+$/);

  if (!match) {
    return;
  }

  const name = match[1];

  symbols.push(createSymbol({
    name,
    type: /^[A-Z0-9_]+$/.test(name) ? "constant" : "variable",
    path: relativePath,
    lineNumber,
    language,
    parent: moduleName(relativePath),
    exported: pythonExportedName(name),
    signal: "assignment",
  }));
}

function indexConfigurationRelationships(scanRoot, relativePath) {
  if (path.basename(relativePath) !== "package.json" && path.basename(relativePath) !== "tsconfig.json") {
    return [];
  }

  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(path.join(scanRoot, relativePath), "utf8"));
  } catch (error) {
    return [];
  }

  if (path.basename(relativePath) === "package.json") {
    return packageJsonRelationships(relativePath, parsed);
  }

  return tsconfigRelationships(relativePath, parsed);
}

function packageJsonRelationships(relativePath, packageJson) {
  const relationships = [];

  if (typeof packageJson.main === "string") {
    relationships.push(createRawRelationship({
      sourceName: relativePath,
      sourceType: "configuration",
      relationshipType: "configuration-reference",
      targetName: packageJson.main,
      targetPath: packageJson.main,
      sourcePath: relativePath,
      lineNumber: 1,
      signal: "package.json main",
    }));
  }

  if (packageJson.scripts && typeof packageJson.scripts === "object" && !Array.isArray(packageJson.scripts)) {
    for (const [name, command] of Object.entries(packageJson.scripts).sort(compareEntries)) {
      if (typeof command !== "string" || command.trim() === "") {
        continue;
      }

      relationships.push(createRawRelationship({
        sourceName: relativePath,
        sourceType: "configuration",
        relationshipType: "configuration-reference",
        targetName: name,
        sourcePath: relativePath,
        lineNumber: 1,
        signal: `package.json scripts.${name}`,
      }));
    }
  }

  return relationships;
}

function tsconfigRelationships(relativePath, tsconfig) {
  const relationships = [];

  if (typeof tsconfig.extends === "string") {
    relationships.push(createRawRelationship({
      sourceName: relativePath,
      sourceType: "configuration",
      relationshipType: "configuration-reference",
      targetName: tsconfig.extends,
      targetPath: tsconfig.extends,
      sourcePath: relativePath,
      lineNumber: 1,
      signal: "tsconfig extends",
    }));
  }

  return relationships;
}

function addRouteSymbolsForPath(symbols, relativePath, language) {
  const route = routeFromFilePath(relativePath);

  if (!route) {
    return;
  }

  symbols.push(createSymbol({
    name: route.name,
    type: route.type,
    path: relativePath,
    lineNumber: 1,
    language,
    parent: moduleName(relativePath),
    exported: false,
    signal: route.signal,
  }));
}

function routeFromFilePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  const nextApi = normalized.match(/^app\/api\/(.+)\/route\.[cm]?[jt]sx?$/);

  if (nextApi) {
    return {
      name: `/${nextApi[1].replace(/\/index$/, "")}`,
      type: "api-endpoint",
      signal: "Next.js app API route filename",
    };
  }

  const nextPage = normalized.match(/^(?:app|pages)\/(.+?)(?:\/page)?\.[cm]?[jt]sx?$/);

  if (nextPage) {
    const route = nextPage[1].replace(/\/index$/, "").replace(/^index$/, "");
    return {
      name: `/${route}`,
      type: "route",
      signal: "route filename",
    };
  }

  return null;
}

function javascriptRoute(trimmed) {
  const match = trimmed.match(/\b(app|router)\.(get|post|put|patch|delete|all|use)\(\s*["'`]([^"'`]+)["'`]/);

  if (!match) {
    return null;
  }

  return {
    name: `${match[2].toUpperCase()} ${match[3]}`,
    type: match[3].startsWith("/api") || match[2] !== "use" ? "api-endpoint" : "route",
    handler: routeHandlerArgument(trimmed),
    signal: `${match[1]}.${match[2]} route declaration`,
  };
}

function pythonRoute(trimmed) {
  const match = trimmed.match(/^@(?:app|router|blueprint)\.(route|get|post|put|patch|delete)\(\s*["']([^"']+)["']/);

  if (!match) {
    return null;
  }

  return {
    name: `${match[1].toUpperCase()} ${match[2]}`,
    type: "api-endpoint",
    signal: "route decorator",
  };
}

function routeHandlerArgument(trimmed) {
  const match = trimmed.match(/,\s*([A-Za-z_$][\w$]*)\s*(?:[,)]|$)/);
  return match ? match[1] : UNKNOWN;
}

function javascriptInheritance(trimmed) {
  const extendsMatch = trimmed.match(/\bextends\s+([A-Za-z_$][\w$]*)/);
  const implementsMatch = trimmed.match(/\bimplements\s+([A-Za-z_$][\w$,\s]*)/);

  return {
    extendsName: extendsMatch ? extendsMatch[1] : null,
    implementsNames: implementsMatch
      ? implementsMatch[1]
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
  };
}

function pythonBaseClass(trimmed) {
  const match = trimmed.match(/^class\s+[A-Za-z_]\w*\(([^)]+)\)/);

  if (!match) {
    return null;
  }

  const baseClass = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)[0];

  return baseClass || null;
}

function addJavaScriptCallRelationships(relationships, trimmed, relativePath, lineNumber, sourceName, sourceType) {
  if (isDeclarationLine(trimmed)) {
    return;
  }

  const calls = uniqueSorted(
    Array.from(trimmed.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g))
      .filter((match) => trimmed[Math.max(match.index - 1, 0)] !== ".")
      .map((match) => match[1])
      .filter((name) => !JS_NON_CALL_IDENTIFIERS.has(name)),
  );

  for (const call of calls) {
    relationships.push(createRawRelationship({
      sourceName,
      sourceType,
      relationshipType: "function-call",
      targetName: call,
      sourcePath: relativePath,
      lineNumber,
      signal: `direct call expression: ${call}`,
    }));
  }
}

function addPythonCallRelationships(relationships, trimmed, relativePath, lineNumber, sourceName, sourceType) {
  if (/^(?:async\s+)?def\s+/.test(trimmed) || /^class\s+/.test(trimmed) || /^@/.test(trimmed)) {
    return;
  }

  const calls = uniqueSorted(
    Array.from(trimmed.matchAll(/\b([A-Za-z_]\w*)\s*\(/g))
      .map((match) => match[1])
      .filter((name) => !["if", "for", "while", "return"].includes(name)),
  );

  for (const call of calls) {
    relationships.push(createRawRelationship({
      sourceName,
      sourceType,
      relationshipType: "function-call",
      targetName: call,
      sourcePath: relativePath,
      lineNumber,
      signal: `direct call expression: ${call}`,
    }));
  }
}

function addReactUsageRelationships(relationships, trimmed, relativePath, lineNumber, sourceName, sourceType) {
  if (!/\.[jt]sx$/.test(relativePath)) {
    return;
  }

  const components = uniqueSorted(
    Array.from(trimmed.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)).map((match) => match[1]),
  );
  const hooks = uniqueSorted(
    Array.from(trimmed.matchAll(/\b(use[A-Z][A-Za-z0-9_]*)\s*\(/g)).map((match) => match[1]),
  );

  for (const component of components) {
    relationships.push(createRawRelationship({
      sourceName,
      sourceType,
      relationshipType: "react-component-usage",
      targetName: component,
      sourcePath: relativePath,
      lineNumber,
      signal: `JSX component usage: ${component}`,
    }));
  }

  for (const hook of hooks) {
    relationships.push(createRawRelationship({
      sourceName,
      sourceType,
      relationshipType: "hook-usage",
      targetName: hook,
      sourcePath: relativePath,
      lineNumber,
      signal: `hook call: ${hook}`,
    }));
  }
}

function isDeclarationLine(trimmed) {
  return (
    /^(?:export\s+)?(?:async\s+)?function\s+/.test(trimmed) ||
    /^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/.test(trimmed) ||
    /^class\s+/.test(trimmed) ||
    /^import\s+/.test(trimmed)
  );
}

function createRawRelationship(input) {
  return {
    sourceName: stringOrUnknown(input.sourceName),
    sourceType: stringOrUnknown(input.sourceType),
    relationshipType: stringOrUnknown(input.relationshipType),
    targetName: stringOrUnknown(input.targetName),
    targetPath: input.targetPath ? stringOrUnknown(input.targetPath).replace(/\\/g, "/") : UNKNOWN,
    sourcePath: normalizeRelativePath(input.sourcePath),
    lineNumber: normalizeLineNumber(input.lineNumber),
    evidence: {
      source: normalizeRelativePath(input.sourcePath),
      signal: stringOrUnknown(input.signal),
    },
    confidenceState: input.confidenceState || "VERIFIED",
  };
}

function buildRelationships(rawRelationships, symbols, files, repositoryRoot) {
  const knownPaths = new Set(files.map((file) => file.path));
  const relationshipsByFingerprint = new Map();

  for (const rawRelationship of rawRelationships) {
    if (isExcludedPath(rawRelationship.sourcePath) || isExcludedPath(rawRelationship.targetPath)) {
      continue;
    }

    const sourceSymbol = resolveSourceSymbol(rawRelationship, symbols);
    const targetResolution = resolveTarget(rawRelationship, symbols, knownPaths);
    const relationship = {
      relationshipId: UNKNOWN,
      sourceSymbol: sourceSymbol || UNKNOWN,
      relationshipType: rawRelationship.relationshipType,
      targetSymbol: targetResolution.symbol || UNKNOWN,
      targetPath: targetResolution.path,
      sourcePath: rawRelationship.sourcePath,
      lineNumber: rawRelationship.lineNumber,
      evidence: rawRelationship.evidence,
      confidenceState: relationshipConfidence(rawRelationship, sourceSymbol, targetResolution),
    };
    relationship.relationshipId = relationshipId(relationship, repositoryRoot);

    const fingerprint = relationshipFingerprint(relationship);

    if (!relationshipsByFingerprint.has(fingerprint)) {
      relationshipsByFingerprint.set(fingerprint, relationship);
    }
  }

  return Array.from(relationshipsByFingerprint.values()).sort(compareRelationships);
}

function resolveSourceSymbol(rawRelationship, symbols) {
  return (
    symbols.find(
      (symbol) =>
        symbol.path === rawRelationship.sourcePath &&
        symbol.name === rawRelationship.sourceName &&
        symbol.type === rawRelationship.sourceType,
    ) ||
    symbols.find((symbol) => symbol.path === rawRelationship.sourcePath && symbol.name === rawRelationship.sourceName) ||
    symbols.find((symbol) => symbol.path === rawRelationship.sourcePath && symbol.type === "module")
  );
}

function resolveTarget(rawRelationship, symbols, knownPaths) {
  const targetPath = resolveTargetPath(rawRelationship, knownPaths);
  const targetSymbol =
    symbols.find((symbol) => targetPath !== UNKNOWN && symbol.path === targetPath && symbol.name === rawRelationship.targetName) ||
    symbols.find((symbol) => targetPath !== UNKNOWN && symbol.path === targetPath && symbol.type === "module") ||
    symbols.find((symbol) => symbol.path === rawRelationship.sourcePath && symbol.name === rawRelationship.targetName) ||
    symbols.find((symbol) => symbol.name === rawRelationship.targetName);

  return {
    symbol: targetSymbol || null,
    path: targetPath !== UNKNOWN ? targetPath : targetSymbol ? targetSymbol.path : UNKNOWN,
  };
}

function resolveTargetPath(rawRelationship, knownPaths) {
  if (rawRelationship.targetPath === UNKNOWN) {
    return UNKNOWN;
  }

  if (knownPaths.has(rawRelationship.targetPath)) {
    return rawRelationship.targetPath;
  }

  if (!rawRelationship.targetPath.startsWith(".")) {
    return UNKNOWN;
  }

  const sourceDirectory = path.posix.dirname(rawRelationship.sourcePath);
  const withoutExtension = path.posix.normalize(path.posix.join(sourceDirectory, rawRelationship.targetPath));
  const candidates = [
    withoutExtension,
    `${withoutExtension}.js`,
    `${withoutExtension}.jsx`,
    `${withoutExtension}.mjs`,
    `${withoutExtension}.ts`,
    `${withoutExtension}.tsx`,
    `${withoutExtension}.py`,
    `${withoutExtension}/index.js`,
    `${withoutExtension}/index.jsx`,
    `${withoutExtension}/index.ts`,
    `${withoutExtension}/index.tsx`,
  ].map((candidate) => normalizeRelativePath(candidate));

  return candidates.find((candidate) => knownPaths.has(candidate)) || UNKNOWN;
}

function relationshipConfidence(rawRelationship, sourceSymbol, targetResolution) {
  if (rawRelationship.confidenceState === UNKNOWN) {
    return UNKNOWN;
  }

  if (rawRelationship.relationshipType === "function-call" && !targetResolution.symbol) {
    return UNKNOWN;
  }

  if (
    ["class-inheritance", "interface-implementation", "react-component-usage", "hook-usage"].includes(
      rawRelationship.relationshipType,
    ) &&
    !targetResolution.symbol
  ) {
    return UNKNOWN;
  }

  return sourceSymbol ? "VERIFIED" : UNKNOWN;
}

function relationshipId(relationship, repositoryRoot) {
  return `relationship-${crypto
    .createHash("sha256")
    .update(stableSerialize({
      repositoryRoot: path.resolve(repositoryRoot),
      fingerprint: relationshipFingerprint(relationship),
    }))
    .digest("hex")
    .slice(0, 16)}`;
}

function relationshipFingerprint(relationship) {
  return stableSerialize({
    sourcePath: relationship.sourcePath,
    sourceSymbol: symbolReferenceKey(relationship.sourceSymbol),
    relationshipType: relationship.relationshipType,
    targetSymbol: symbolReferenceKey(relationship.targetSymbol),
    targetPath: relationship.targetPath,
    lineNumber: relationship.lineNumber,
  });
}

function symbolReferenceKey(symbol) {
  if (!symbol || symbol === UNKNOWN) {
    return UNKNOWN;
  }

  return stableSerialize({
    symbolId: symbol.symbolId,
    name: symbol.name,
    type: symbol.type,
    path: symbol.path,
  });
}

function compareRelationships(left, right) {
  return (
    left.sourcePath.localeCompare(right.sourcePath) ||
    compareLineNumbers(left.lineNumber, right.lineNumber) ||
    left.relationshipType.localeCompare(right.relationshipType) ||
    stableSerialize(left.sourceSymbol).localeCompare(stableSerialize(right.sourceSymbol)) ||
    stableSerialize(left.targetSymbol).localeCompare(stableSerialize(right.targetSymbol)) ||
    left.relationshipId.localeCompare(right.relationshipId)
  );
}

function functionLikeSymbol(input) {
  const symbolType = reactFunctionType(input.name, input.relativePath);

  return createSymbol({
    name: input.name,
    type: symbolType,
    path: input.relativePath,
    lineNumber: input.lineNumber,
    language: input.language,
    parent: moduleName(input.relativePath),
    exported: input.exported,
    signal: input.signal,
  });
}

function reactFunctionType(name, relativePath) {
  if (/^use[A-Z0-9]/.test(name)) {
    return "hook";
  }

  if ((/\.[jt]sx$/.test(relativePath) || relativePath.includes("/components/")) && /^[A-Z]/.test(name)) {
    return "react-component";
  }

  return "function";
}

function isMiddlewareLine(trimmed, relativePath) {
  return /(^|\/)middleware\.[cm]?[jt]s$/.test(relativePath) || /\b(app|router)\.use\(/.test(trimmed);
}

function middlewareName(trimmed, relativePath) {
  const route = javascriptRoute(trimmed);

  if (route) {
    return route.name;
  }

  return path.basename(relativePath).replace(path.extname(relativePath), "");
}

function createSymbol(input) {
  const symbol = {
    symbolId: UNKNOWN,
    name: stringOrUnknown(input.name),
    type: stringOrUnknown(input.type),
    path: normalizeRelativePath(input.path),
    lineNumber: normalizeLineNumber(input.lineNumber),
    language: stringOrUnknown(input.language),
    parent: stringOrUnknown(input.parent),
    exported: Boolean(input.exported),
    evidence: {
      source: normalizeRelativePath(input.path),
      signal: stringOrUnknown(input.signal),
    },
  };
  symbol.symbolId = symbolId(symbol);
  return symbol;
}

function addSymbol(symbolsByFingerprint, symbol) {
  if (symbol.name === UNKNOWN || symbol.type === UNKNOWN || symbol.path === UNKNOWN) {
    return;
  }

  const fingerprint = symbolFingerprint(symbol);

  if (!symbolsByFingerprint.has(fingerprint)) {
    symbolsByFingerprint.set(fingerprint, symbol);
  }
}

function symbolId(symbol) {
  return `symbol-${crypto.createHash("sha256").update(symbolFingerprint(symbol)).digest("hex").slice(0, 16)}`;
}

function scopeSymbolId(symbol, repositoryRoot) {
  return {
    ...symbol,
    symbolId: `symbol-${crypto
      .createHash("sha256")
      .update(stableSerialize({
        repositoryRoot: path.resolve(repositoryRoot),
        fingerprint: symbolFingerprint(symbol),
      }))
      .digest("hex")
      .slice(0, 16)}`,
  };
}

function symbolFingerprint(symbol) {
  return stableSerialize({
    name: symbol.name,
    type: symbol.type,
    path: symbol.path,
    lineNumber: symbol.lineNumber,
    parent: symbol.parent,
  });
}

function safeFiles(files) {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .filter((file) => file && typeof file.path === "string")
    .map((file) => ({ path: normalizeRelativePath(file.path) }))
    .filter((file) => file.path !== UNKNOWN && !isExcludedPath(file.path))
    .sort(comparePathEntries);
}

function isExcludedPath(filePath) {
  return (
    LEVI_RUNTIME_PATTERN.test(filePath) ||
    GENERATED_PATH_PATTERN.test(filePath) ||
    DEPENDENCY_PATH_PATTERN.test(filePath) ||
    SECRET_PATH_PATTERN.test(filePath) ||
    BINARY_EXTENSION_PATTERN.test(filePath)
  );
}

function isConfigurationFile(filePath) {
  const name = path.basename(filePath);
  return CONFIG_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

function isSourceLikeExtension(extension) {
  return [".c", ".cc", ".cpp", ".cs", ".go", ".h", ".hpp", ".java", ".rb", ".rs"].includes(extension);
}

function languageForPath(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();

  if (JAVASCRIPT_EXTENSIONS.has(extension)) {
    return extension.includes("ts") ? "TypeScript" : "JavaScript";
  }

  if (PYTHON_EXTENSIONS.has(extension)) {
    return "Python";
  }

  if (isConfigurationFile(relativePath)) {
    return "Configuration";
  }

  return UNKNOWN;
}

function moduleName(relativePath) {
  return relativePath.replace(/\.[^.]+$/, "");
}

function hasExport(trimmed) {
  return /^export\b/.test(trimmed);
}

function pythonExportedName(name) {
  return !name.startsWith("_");
}

function braceDelta(line) {
  return (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
}

function normalizeRelativePath(filePath) {
  const normalized = stringOrUnknown(filePath).replace(/\\/g, "/");

  if (normalized === UNKNOWN || normalized.includes("\0") || path.isAbsolute(normalized)) {
    return UNKNOWN;
  }

  const parts = normalized.split("/").filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    return UNKNOWN;
  }

  return parts.join("/");
}

function normalizeLineNumber(lineNumber) {
  return Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : UNKNOWN;
}

function validateScanResult(scanResult) {
  if (!scanResult || typeof scanResult !== "object") {
    throw new Error("Structural indexing requires a repository scan result.");
  }

  if (typeof scanResult.root !== "string" || scanResult.root.trim() === "") {
    throw new Error("Structural indexing requires a repository root.");
  }
}

function stringOrUnknown(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  const text = String(value).trim();
  return text === "" ? UNKNOWN : text;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

function comparePathEntries(left, right) {
  return left.path.localeCompare(right.path);
}

function compareEntries(left, right) {
  return left[0].localeCompare(right[0]);
}

function compareSymbols(left, right) {
  return (
    left.path.localeCompare(right.path) ||
    compareLineNumbers(left.lineNumber, right.lineNumber) ||
    left.type.localeCompare(right.type) ||
    left.name.localeCompare(right.name) ||
    left.parent.localeCompare(right.parent)
  );
}

function compareLineNumbers(left, right) {
  const leftNumber = Number.isInteger(left) ? left : Number.MAX_SAFE_INTEGER;
  const rightNumber = Number.isInteger(right) ? right : Number.MAX_SAFE_INTEGER;
  return leftNumber - rightNumber;
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

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${key}: ${stableSerialize(value[key])}`)
    .join(", ")}}`;
}

module.exports = {
  UNKNOWN,
  buildStructuralIndex,
};

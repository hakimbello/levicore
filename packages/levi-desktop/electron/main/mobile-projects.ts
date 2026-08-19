import { existsSync, readdirSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile as execFileCallback } from "node:child_process";
import type { WorkspaceScanSummary } from "../../src/types/levi-api";
import type { StarterCommand, StarterFile } from "./project-workflows";

const TOOL_TIMEOUT_MS = 8_000;
const MAX_TOOL_OUTPUT = 24_000;
const ANDROID_GRADLE_VERSION = "9.6.1";
const ANDROID_GRADLE_PLUGIN_VERSION = "9.3.0";
const KOTLIN_ANDROID_PLUGIN_VERSION = "2.3.21";
const COMPOSE_BOM_VERSION = "2025.07.00";

export type MobilePlatform = "android" | "ios" | "flutter" | "react-native" | "expo";
export type MobileLanguage = "kotlin" | "java" | "swift" | "dart" | "typescript" | "javascript";
export type MobileFramework = "jetpack-compose" | "android-views" | "swiftui" | "flutter" | "react-native" | "expo";
export type MobileBuildSystem = "gradle" | "xcode" | "swift-package-manager" | "flutter" | "npm";
export type UniversalRunTargetKind =
  | "browser"
  | "android-device"
  | "android-emulator"
  | "ios-simulator"
  | "ios-device"
  | "desktop"
  | "local-server";

export type MobileProjectModel = {
  platform: MobilePlatform;
  language: MobileLanguage;
  framework: MobileFramework;
  buildSystem: MobileBuildSystem;
  requiredTools: string[];
  buildCommand?: string;
  testCommand?: string;
  runCommand?: string;
  deviceTargets: UniversalRunTargetKind[];
  emulatorTargets: UniversalRunTargetKind[];
  packageIdentifier?: string;
  minimumPlatformVersion?: string;
  projectRoot: string;
  modules: string[];
  appModule?: string;
  confidence: number;
  evidence: string[];
};

export type MobileToolStatus = "ready" | "missing" | "unavailable" | "unknown";

export type MobileTool = {
  name: string;
  status: MobileToolStatus;
  version?: string;
  detail?: string;
  executablePath?: string;
  guidance?: string;
};

export type AndroidDeviceTarget = {
  id: string;
  kind: "android-device" | "android-emulator";
  state: "device" | "offline" | "unauthorized" | "unknown";
  model?: string;
  product?: string;
  name?: string;
  manufacturer?: string;
  androidVersion?: string;
  apiLevel?: string;
};

export type MobileEnvironment = {
  os: NodeJS.Platform;
  android: {
    jdk: MobileTool;
    javaHome: MobileTool;
    androidSdk: MobileTool;
    adb: MobileTool;
    gradle: MobileTool;
    gradleWrapper: MobileTool;
    buildTools: MobileTool;
    platformTools: MobileTool;
    platforms: MobileTool;
    emulator: MobileTool;
    avds: MobileTool & { names: string[] };
    devices: MobileTool & { targets: AndroidDeviceTarget[] };
    status: "ready" | "missing-tools" | "no-targets" | "unknown";
    summary: string;
  };
  flutter: {
    flutter: MobileTool;
    dart: MobileTool;
    doctor: MobileTool;
    androidTarget: MobileTool;
    iosTarget: MobileTool;
  };
  reactNative: {
    node: MobileTool;
    npm: MobileTool;
    pnpm: MobileTool;
    yarn: MobileTool;
    npx: MobileTool;
    expoCli: MobileTool;
    androidTooling: MobileTool;
    iosTooling: MobileTool;
  };
  ios: {
    sourceDevelopment: MobileTool;
    nativeBuild: MobileTool;
    xcode: MobileTool;
    xcodebuild: MobileTool;
    swift: MobileTool;
    swiftPackageManager: MobileTool;
    simulators: MobileTool;
    devices: MobileTool;
    summary: string;
  };
};

type ExecFile = typeof execFileCallback;

export function detectMobileProjectFromSummary(summary: WorkspaceScanSummary): MobileProjectModel | null {
  const manifests = new Set(summary.manifestFiles.map(normalizeSlashes));
  const entries = new Set(summary.likelyEntryPoints.map(normalizeSlashes));
  const sources = summary.sourceDirectories.map(normalizeSlashes);
  const frameworks = new Set(summary.frameworks.map((value) => value.toLowerCase()));
  const languages = new Set(summary.languages.map((value) => value.toLowerCase()));
  const evidence: string[] = [];

  const hasAndroidGradle = hasAny(manifests, ["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"]) || sources.some((source) => source.startsWith("app/src/main"));
  const hasManifest = hasAny(manifests, ["AndroidManifest.xml", "app/src/main/AndroidManifest.xml"]) || entriesHas(entries, "AndroidManifest.xml");
  if (hasAndroidGradle || hasManifest || frameworks.has("android") || languages.has("kotlin") && summary.manifestFiles.some((file) => /gradle/i.test(file))) {
    if (hasAndroidGradle) evidence.push("Gradle Android metadata");
    if (hasManifest) evidence.push("Android manifest");
    if (languages.has("kotlin")) evidence.push("Kotlin sources");
    const compose = frameworks.has("jetpack compose") || frameworks.has("compose") || summary.manifestFiles.some((file) => /compose/i.test(file));
    return {
      platform: "android",
      language: languages.has("kotlin") ? "kotlin" : "java",
      framework: compose || languages.has("kotlin") ? "jetpack-compose" : "android-views",
      buildSystem: "gradle",
      requiredTools: ["JDK", "Android SDK", "ADB", "Gradle wrapper"],
      buildCommand: gradleCommand("assembleDebug"),
      testCommand: gradleCommand("testDebugUnitTest"),
      runCommand: "installDebug + adb shell monkey",
      deviceTargets: ["android-device"],
      emulatorTargets: ["android-emulator"],
      packageIdentifier: undefined,
      minimumPlatformVersion: undefined,
      projectRoot: ".",
      modules: inferGradleModules(summary),
      appModule: inferAppModule(summary),
      confidence: hasAndroidGradle && hasManifest ? 0.95 : 0.82,
      evidence
    };
  }

  if (manifests.has("pubspec.yaml") || entries.has("lib/main.dart") || frameworks.has("flutter")) {
    return {
      platform: "flutter",
      language: "dart",
      framework: "flutter",
      buildSystem: "flutter",
      requiredTools: ["Flutter", "Dart", "Android SDK"],
      buildCommand: "flutter build apk",
      testCommand: "flutter test",
      runCommand: "flutter run",
      deviceTargets: ["android-device", "ios-device"],
      emulatorTargets: ["android-emulator", "ios-simulator"],
      projectRoot: ".",
      modules: [],
      confidence: 0.9,
      evidence: ["Flutter project metadata"]
    };
  }

  const packageJson = manifests.has("package.json");
  const expo = packageJson && (frameworks.has("expo") || manifests.has("app.json") || summary.manifestFiles.some((file) => /^app\.config\./i.test(path.basename(file))));
  const reactNative = packageJson && (frameworks.has("react native") || frameworks.has("react-native") || sources.includes("android") || sources.includes("ios"));
  if (expo || reactNative) {
    return {
      platform: expo ? "expo" : "react-native",
      language: languages.has("typescript") ? "typescript" : "javascript",
      framework: expo ? "expo" : "react-native",
      buildSystem: "npm",
      requiredTools: expo ? ["Node", "npm", "npx", "Expo CLI"] : ["Node", "npm", "npx", "Android SDK"],
      buildCommand: expo ? "npx expo export" : commandFromScripts(summary, ["android", "build"]) ?? "npx react-native build-android",
      testCommand: commandFromScripts(summary, ["test"]),
      runCommand: expo ? commandFromScripts(summary, ["start"]) ?? "npx expo start" : commandFromScripts(summary, ["android"]) ?? "npx react-native run-android",
      deviceTargets: ["android-device", "ios-device"],
      emulatorTargets: ["android-emulator", "ios-simulator"],
      projectRoot: ".",
      modules: [],
      confidence: expo ? 0.92 : 0.86,
      evidence: [expo ? "Expo metadata" : "React Native metadata"]
    };
  }

  if (summary.manifestFiles.some((file) => /\.(xcodeproj|xcworkspace)$/i.test(file)) || manifests.has("Package.swift") || languages.has("swift")) {
    return {
      platform: "ios",
      language: "swift",
      framework: frameworks.has("swiftui") || summary.likelyEntryPoints.some((file) => /\.swift$/i.test(file)) ? "swiftui" : "swiftui",
      buildSystem: manifests.has("Package.swift") ? "swift-package-manager" : "xcode",
      requiredTools: ["macOS", "Xcode", "xcodebuild", "Swift"],
      buildCommand: process.platform === "darwin" ? "xcodebuild build" : undefined,
      testCommand: process.platform === "darwin" ? "xcodebuild test" : undefined,
      runCommand: process.platform === "darwin" ? "xcrun simctl launch" : undefined,
      deviceTargets: ["ios-device"],
      emulatorTargets: ["ios-simulator"],
      projectRoot: ".",
      modules: [],
      confidence: 0.84,
      evidence: ["iOS or Swift project metadata"]
    };
  }

  return null;
}

export async function detectMobileProject(root: string | null, summary: WorkspaceScanSummary): Promise<MobileProjectModel | null> {
  const model = detectMobileProjectFromSummary(summary) ?? (root ? await detectMobileProjectFromFiles(root) : null);
  if (!root || !model) return model;
  if (model.platform === "android") return enrichAndroidProject(root, model);
  if (model.platform === "ios") return enrichIosProject(root, model);
  return model;
}

export async function detectMobileEnvironment(root: string | null, execFile: ExecFile = execFileCallback, env: NodeJS.ProcessEnv = process.env): Promise<MobileEnvironment> {
  const javaExecutable = env.JAVA_HOME
    ? path.join(env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
    : defaultAndroidStudioJavaPath();
  const java = await commandTool(execFile, await exists(javaExecutable) ? javaExecutable : "java", ["-version"], undefined, /version\s+"([^"]+)"/i);
  const node = await commandTool(execFile, process.platform === "win32" ? "node.exe" : "node", ["--version"], undefined, /(v?\d+[^\s]*)/);
  const npm = await commandTool(execFile, process.platform === "win32" ? "npm.cmd" : "npm", ["--version"], undefined, /(\d+[^\s]*)/);
  const npx = await commandTool(execFile, process.platform === "win32" ? "npx.cmd" : "npx", ["--version"], undefined, /(\d+[^\s]*)/);
  const pnpm = await commandTool(execFile, process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"], undefined, /(\d+[^\s]*)/);
  const yarn = await commandTool(execFile, process.platform === "win32" ? "yarn.cmd" : "yarn", ["--version"], undefined, /(\d+[^\s]*)/);
  const gradleWrapperPath = root ? path.join(root, process.platform === "win32" ? "gradlew.bat" : "gradlew") : "";
  const gradleWrapperReady = Boolean(root && await exists(gradleWrapperPath));
  const gradle = gradleWrapperReady
    ? await commandTool(execFile, gradleWrapperPath, ["--version"], root ?? undefined, /Gradle\s+([^\s]+)/i)
    : await commandTool(execFile, process.platform === "win32" ? "gradle.bat" : "gradle", ["--version"], undefined, /Gradle\s+([^\s]+)/i);
  const sdkRoot = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || defaultAndroidSdkPath();
  const androidSdkReady = Boolean(sdkRoot && await exists(sdkRoot));
  const adbPath = sdkRoot ? path.join(sdkRoot, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb") : (process.platform === "win32" ? "adb.exe" : "adb");
  const adb = await commandTool(execFile, adbPath, ["version"], undefined, /Android Debug Bridge version\s+([^\s]+)/i);
  const deviceOutput = await execText(execFile, adbPath, ["devices", "-l"], undefined).catch(() => ({ stdout: "", stderr: "" }));
  const devices = adb.status === "ready" ? await enrichAndroidDeviceTargets(execFile, adbPath, parseAdbDevices(deviceOutput.stdout)) : [];
  const emulatorPath = sdkRoot ? path.join(sdkRoot, "emulator", process.platform === "win32" ? "emulator.exe" : "emulator") : (process.platform === "win32" ? "emulator.exe" : "emulator");
  const avdOutput = await execText(execFile, emulatorPath, ["-list-avds"], undefined).catch(() => ({ stdout: "", stderr: "" }));
  const avds = avdOutput.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const flutter = await commandTool(execFile, process.platform === "win32" ? "flutter.bat" : "flutter", ["--version"], undefined, /Flutter\s+([^\s]+)/i);
  const dart = await commandTool(execFile, process.platform === "win32" ? "dart.bat" : "dart", ["--version"], undefined, /Dart SDK version:\s+([^\s]+)/i);
  const flutterDoctor = flutter.status === "ready" ? await commandTool(execFile, process.platform === "win32" ? "flutter.bat" : "flutter", ["doctor", "-v"], undefined) : missingTool("Flutter doctor", "Install Flutter to run flutter doctor.");
  const xcodebuild = process.platform === "darwin" ? await commandTool(execFile, "xcodebuild", ["-version"], undefined, /Xcode\s+([^\s]+)/i) : unavailableTool("xcodebuild", "Native iOS build requires macOS + Xcode.");
  const swift = process.platform === "darwin" ? await commandTool(execFile, "swift", ["--version"], undefined, /Swift version\s+([^\s]+)/i) : unavailableTool("Swift", "Swift compilation for Apple platforms requires macOS toolchains.");
  const simctl = process.platform === "darwin" ? await commandTool(execFile, "xcrun", ["simctl", "list", "devices", "available"], undefined) : unavailableTool("iOS simulators", "iOS simulators require macOS + Xcode.");

  const gradleAvailableForAndroidStarter = gradleWrapperReady || gradle.status === "ready" || process.platform === "win32";
  const androidMissing = [java, adb].filter((tool) => tool.status !== "ready").map((tool) => tool.name);
  if (!gradleAvailableForAndroidStarter) androidMissing.push("Gradle");
  const targetCount = devices.filter((device) => device.state === "device").length + avds.length;
  const androidStatus = androidMissing.length ? "missing-tools" : targetCount ? "ready" : "no-targets";
  return {
    os: process.platform,
    android: {
      jdk: java.status === "ready" ? { ...java, name: "JDK" } : missingTool("JDK", "Install a JDK and ensure java is on PATH."),
      javaHome: env.JAVA_HOME ? readyTool("JAVA_HOME", env.JAVA_HOME) : missingTool("JAVA_HOME", "Set JAVA_HOME to the installed JDK when Gradle requires it."),
      androidSdk: androidSdkReady ? readyTool("Android SDK", sdkRoot) : missingTool("Android SDK", "Install Android Studio or the command line SDK and set ANDROID_HOME or ANDROID_SDK_ROOT."),
      adb: adb.status === "ready" ? { ...adb, name: "ADB", executablePath: adbPath } : missingTool("ADB", "Install Android platform-tools or add adb to PATH."),
      gradle: gradle.status === "ready" ? { ...gradle, name: gradleWrapperReady ? "Gradle wrapper" : "Gradle" } : readyTool("Gradle", "Android starters create a workspace-local Gradle wrapper."),
      gradleWrapper: gradleWrapperReady ? readyTool("Gradle wrapper", normalizeSlashes(gradleWrapperPath)) : readyTool("Gradle wrapper", "Created for Android starters when missing."),
      buildTools: androidSdkReady && await hasSdkChild(sdkRoot, "build-tools") ? readyTool("Android build-tools", "Installed") : missingTool("Android build-tools", "Install Android SDK build-tools."),
      platformTools: androidSdkReady && await hasSdkChild(sdkRoot, "platform-tools") ? readyTool("platform-tools", "Installed") : missingTool("platform-tools", "Install Android SDK platform-tools."),
      platforms: androidSdkReady && await hasSdkChild(sdkRoot, "platforms") ? readyTool("Android platforms", "Installed") : missingTool("Android platforms", "Install at least one Android SDK platform."),
      emulator: avdOutput.stdout || avdOutput.stderr || await exists(emulatorPath) ? readyTool("Emulator", "Available") : missingTool("Emulator", "Install Android Emulator to launch AVDs."),
      avds: { ...(avds.length ? readyTool("AVDs", `${avds.length} available`) : missingTool("AVDs", "Create an Android Virtual Device to launch an emulator.")), names: avds },
      devices: { ...(devices.length ? readyTool("Connected devices", `${devices.length}`) : missingTool("Connected devices", "Connect a device or start an emulator.")), targets: devices },
      status: androidStatus,
      summary: androidStatus === "ready" ? "Ready to build Android apps" : androidStatus === "no-targets" ? "Ready to build Android APKs. Launch Emulator or Connect Android Device to run." : `Missing Android requirements: ${androidMissing.join(", ")}`
    },
    flutter: {
      flutter,
      dart,
      doctor: flutterDoctor,
      androidTarget: androidSdkReady ? readyTool("Flutter Android target", "Android SDK available") : missingTool("Flutter Android target", "Install Android SDK for Flutter Android builds."),
      iosTarget: process.platform === "darwin" ? readyTool("Flutter iOS target", "macOS available") : unavailableTool("Flutter iOS target", "iOS target requires macOS + Xcode.")
    },
    reactNative: {
      node,
      npm,
      pnpm,
      yarn,
      npx,
      expoCli: await commandTool(execFile, process.platform === "win32" ? "npx.cmd" : "npx", ["expo", "--version"], undefined, /([0-9][^\s]*)/),
      androidTooling: androidMissing.length ? missingTool("React Native Android tooling", `Missing ${androidMissing.join(", ")}.`) : readyTool("React Native Android tooling", "Ready"),
      iosTooling: process.platform === "darwin" ? readyTool("React Native iOS tooling", "macOS available") : unavailableTool("React Native iOS tooling", "Native iOS build requires macOS + Xcode.")
    },
    ios: {
      sourceDevelopment: readyTool("iOS source development", "Available"),
      nativeBuild: process.platform === "darwin" ? readyTool("Native iOS build", "Available") : unavailableTool("Native iOS build", "requires macOS + Xcode"),
      xcode: process.platform === "darwin" ? xcodebuild : unavailableTool("Xcode", "Native iOS build requires macOS + Xcode."),
      xcodebuild,
      swift,
      swiftPackageManager: swift.status === "ready" ? readyTool("Swift Package Manager", "Available through swift") : swift,
      simulators: simctl,
      devices: process.platform === "darwin" ? readyTool("Apple devices", "Detected through Xcode when connected") : unavailableTool("Apple devices", "Apple device deployment requires macOS + Xcode."),
      summary: process.platform === "darwin" ? "Ready to inspect and build native iOS apps when Xcode projects are configured." : "iOS source development: available. Native iOS build: requires macOS + Xcode."
    }
  };
}

export function parseAdbDevices(output: string): AndroidDeviceTarget[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^list of devices/i.test(line))
    .map((line) => {
      const [id = "", state = "unknown", ...details] = line.split(/\s+/);
      const fields = new Map(details.map((item) => {
        const index = item.indexOf(":");
        return index > 0 ? [item.slice(0, index), item.slice(index + 1)] : [item, ""];
      }));
      const kind: AndroidDeviceTarget["kind"] = id.startsWith("emulator-") ? "android-emulator" : "android-device";
      const targetState: AndroidDeviceTarget["state"] = state === "device" || state === "offline" || state === "unauthorized" ? state : "unknown";
      return {
        id,
        kind,
        state: targetState,
        model: fields.get("model")?.replace(/_/g, " "),
        product: fields.get("product"),
        name: fields.get("model")?.replace(/_/g, " ") ?? id
      };
    })
    .filter((target) => target.id);
}

async function enrichAndroidDeviceTargets(execFile: ExecFile, adbPath: string, targets: AndroidDeviceTarget[]): Promise<AndroidDeviceTarget[]> {
  const readyTargets = targets.filter((target) => target.state === "device");
  const enriched = new Map<string, AndroidDeviceTarget>();
  for (const target of readyTargets) {
    const [manufacturer, androidVersion, apiLevel, model] = await Promise.all([
      readAndroidProperty(execFile, adbPath, target.id, "ro.product.manufacturer"),
      readAndroidProperty(execFile, adbPath, target.id, "ro.build.version.release"),
      readAndroidProperty(execFile, adbPath, target.id, "ro.build.version.sdk"),
      readAndroidProperty(execFile, adbPath, target.id, "ro.product.model")
    ]);
    enriched.set(target.id, {
      ...target,
      manufacturer,
      androidVersion,
      apiLevel,
      model: model ?? target.model,
      name: model ?? target.name
    });
  }
  return targets.map((target) => enriched.get(target.id) ?? target);
}

async function readAndroidProperty(execFile: ExecFile, adbPath: string, serial: string, property: string): Promise<string | undefined> {
  const result = await execText(execFile, adbPath, ["-s", serial, "shell", "getprop", property], undefined).catch(() => ({ stdout: "", stderr: "" }));
  return firstLine(result.stdout)?.trim() || undefined;
}

export function androidRunCommands(model: MobileProjectModel): Array<{ id: string; label: string; command: string; args: string[]; cwd?: string; confidence: number; longRunning: boolean; targetKind: UniversalRunTargetKind }> {
  if (model.platform !== "android") return [];
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  const module = model.appModule ?? "app";
  return [
    { id: "android:installDebug", label: "Run on Android target", command: gradlew, args: [`:${module}:installDebug`], cwd: model.projectRoot, confidence: 0.92, longRunning: false, targetKind: "android-device" },
    { id: "android:assembleDebug", label: "Build debug APK", command: gradlew, args: [`:${module}:assembleDebug`], cwd: model.projectRoot, confidence: 0.9, longRunning: false, targetKind: "android-emulator" }
  ];
}

export function universalTargetsFor(model: MobileProjectModel | null): UniversalRunTargetKind[] {
  if (!model) return ["browser", "local-server", "desktop"];
  return [...model.deviceTargets, ...model.emulatorTargets];
}

export function androidComposeStarterFiles(): StarterFile[] {
  const sdk = installedAndroidSdk();
  const compileSdk = installedCompileSdk(sdk) ?? 36;
  return [
    { relativePath: "gradlew.bat", content: windowsGradleWrapperScript() },
    { relativePath: "gradlew", content: unixGradleWrapperScript() },
    { relativePath: "gradle/wrapper/gradle-wrapper.properties", content: `distributionUrl=https\\://services.gradle.org/distributions/gradle-${ANDROID_GRADLE_VERSION}-bin.zip\n` },
    { relativePath: "settings.gradle.kts", content: "pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name = \"LeviAndroidApp\"\ninclude(\":app\")\n" },
    { relativePath: "build.gradle.kts", content: `plugins {\n  id(\"com.android.application\") version \"${ANDROID_GRADLE_PLUGIN_VERSION}\" apply false\n  id(\"org.jetbrains.kotlin.android\") version \"${KOTLIN_ANDROID_PLUGIN_VERSION}\" apply false\n  id(\"org.jetbrains.kotlin.plugin.compose\") version \"${KOTLIN_ANDROID_PLUGIN_VERSION}\" apply false\n}\n` },
    { relativePath: "gradle.properties", content: "org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nkotlin.code.style=official\nandroid.nonTransitiveRClass=true\n" },
    { relativePath: "app/build.gradle.kts", content: `plugins {\n  id(\"com.android.application\")\n  id(\"org.jetbrains.kotlin.plugin.compose\")\n}\n\nandroid {\n  namespace = \"app.levi.generated\"\n  compileSdk = ${compileSdk}\n\n  defaultConfig {\n    applicationId = \"app.levi.generated\"\n    minSdk = 24\n    targetSdk = ${compileSdk}\n    versionCode = 1\n    versionName = \"1.0\"\n    testInstrumentationRunner = \"androidx.test.runner.AndroidJUnitRunner\"\n  }\n}\n\ndependencies {\n  implementation(platform(\"androidx.compose:compose-bom:${COMPOSE_BOM_VERSION}\"))\n  implementation(\"androidx.activity:activity-compose:1.11.0\")\n  implementation(\"androidx.compose.material3:material3\")\n  implementation(\"androidx.compose.ui:ui\")\n  implementation(\"androidx.compose.ui:ui-tooling-preview\")\n  debugImplementation(\"androidx.compose.ui:ui-tooling\")\n}\n` },
    { relativePath: "app/src/main/AndroidManifest.xml", content: "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n  <application android:theme=\"@style/AppTheme\" android:label=\"Levi Android App\" android:allowBackup=\"false\" android:supportsRtl=\"true\">\n    <activity android:name=\".MainActivity\" android:exported=\"true\">\n      <intent-filter>\n        <action android:name=\"android.intent.action.MAIN\" />\n        <category android:name=\"android.intent.category.LAUNCHER\" />\n      </intent-filter>\n    </activity>\n  </application>\n</manifest>\n" },
    { relativePath: "app/src/main/res/values/styles.xml", content: "<resources>\n  <style name=\"AppTheme\" parent=\"android:style/Theme.Material.Light.NoActionBar\" />\n</resources>\n" },
    { relativePath: "app/src/main/java/app/levi/generated/MainActivity.kt", content: "package app.levi.generated\n\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.material3.MaterialTheme\nimport androidx.compose.material3.Surface\nimport androidx.compose.material3.Text\n\nclass MainActivity : ComponentActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(savedInstanceState)\n    setContent {\n      MaterialTheme {\n        Surface {\n          Text(\"Ready to build with Levi\")\n        }\n      }\n    }\n  }\n}\n" }
  ];
}

export function androidStarterCommands(): { wrapper: StarterCommand; build: StarterCommand; test: StarterCommand; dev: StarterCommand } {
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  return {
    wrapper: { label: "Prepare Gradle wrapper", command: gradlew, args: ["--version"], kind: "verify", required: true },
    build: { label: "Assemble debug APK", command: gradlew, args: [":app:assembleDebug"], kind: "build", required: true },
    test: { label: "Run Android unit tests", command: gradlew, args: [":app:testDebugUnitTest"], kind: "test", required: false },
    dev: { label: "Install debug APK", command: gradlew, args: [":app:installDebug"], kind: "dev", required: false }
  };
}

function gradleCommand(task: string): string {
  return `${process.platform === "win32" ? "gradlew.bat" : "./gradlew"} :app:${task}`;
}

async function enrichAndroidProject(root: string, model: MobileProjectModel): Promise<MobileProjectModel> {
  const files = await listFiles(root, 5_000);
  const modules = inferModulesFromFiles(files);
  const appModule = modules.includes("app") ? "app" : modules[0] ?? model.appModule;
  const manifest = files.find((file) => /AndroidManifest\.xml$/i.test(file));
  const manifestContent = manifest ? await fs.readFile(path.join(root, manifest), "utf8").catch(() => "") : "";
  const gradleBuild = appModule ? files.find((file) => file === `${appModule}/build.gradle.kts` || file === `${appModule}/build.gradle`) : files.find((file) => /build\.gradle(\.kts)?$/i.test(file));
  const gradleContent = gradleBuild ? await fs.readFile(path.join(root, gradleBuild), "utf8").catch(() => "") : "";
  const sourceFiles = files.filter((file) => /\.(kt|java)$/i.test(file));
  const compose = await containsInFiles(root, sourceFiles, /androidx\.compose|setContent\s*\{/);
  return {
    ...model,
    language: sourceFiles.some((file) => file.endsWith(".kt")) ? "kotlin" : model.language,
    framework: compose ? "jetpack-compose" : model.framework,
    packageIdentifier: manifestContent.match(/package="([^"]+)"/)?.[1] ?? gradleContent.match(/applicationId\s*=\s*"([^"]+)"/)?.[1] ?? gradleContent.match(/namespace\s*=\s*"([^"]+)"/)?.[1] ?? model.packageIdentifier,
    modules: modules.length ? modules : model.modules,
    appModule,
    confidence: Math.max(model.confidence, compose ? 0.96 : 0.9),
    evidence: unique([...model.evidence, ...(compose ? ["Jetpack Compose source imports"] : []), ...(manifest ? ["AndroidManifest.xml"] : [])])
  };
}

async function detectMobileProjectFromFiles(root: string): Promise<MobileProjectModel | null> {
  const files = await listFiles(root, 5_000);
  const fileSet = new Set(files);
  const hasGradle = files.some((file) => /(^|\/)(settings|build)\.gradle(\.kts)?$/i.test(file));
  const hasAndroidManifest = files.some((file) => /(^|\/)AndroidManifest\.xml$/i.test(file));
  const sourceFiles = files.filter((file) => /\.(kt|java)$/i.test(file));
  if (!hasGradle && !hasAndroidManifest) return null;
  const usesKotlin = sourceFiles.some((file) => file.endsWith(".kt")) || files.some((file) => /\.gradle\.kts$/i.test(file));
  const compose = await containsInFiles(root, sourceFiles, /androidx\.compose|setContent\s*\{/);
  const modules = inferModulesFromFiles(files);
  const appModule = modules.includes("app") ? "app" : modules[0] ?? (fileSet.has("app/build.gradle.kts") || fileSet.has("app/build.gradle") ? "app" : undefined);
  return {
    platform: "android",
    language: usesKotlin ? "kotlin" : "java",
    framework: compose || usesKotlin ? "jetpack-compose" : "android-views",
    buildSystem: "gradle",
    requiredTools: ["JDK", "Android SDK", "ADB", "Gradle wrapper"],
    buildCommand: gradleCommand("assembleDebug"),
    testCommand: gradleCommand("testDebugUnitTest"),
    runCommand: "installDebug + adb shell monkey",
    deviceTargets: ["android-device"],
    emulatorTargets: ["android-emulator"],
    projectRoot: ".",
    modules: modules.length ? modules : ["app"],
    appModule,
    confidence: hasGradle && hasAndroidManifest ? 0.94 : 0.82,
    evidence: unique([
      ...(hasGradle ? ["Gradle Android metadata"] : []),
      ...(hasAndroidManifest ? ["Android manifest"] : []),
      ...(usesKotlin ? ["Kotlin sources"] : []),
      ...(compose ? ["Jetpack Compose source imports"] : [])
    ])
  };
}

async function enrichIosProject(root: string, model: MobileProjectModel): Promise<MobileProjectModel> {
  const files = await listFiles(root, 3_000);
  const swiftui = await containsInFiles(root, files.filter((file) => file.endsWith(".swift")), /import\s+SwiftUI/);
  return { ...model, framework: swiftui ? "swiftui" : model.framework, evidence: unique([...model.evidence, ...(swiftui ? ["SwiftUI imports"] : [])]) };
}

async function commandTool(execFile: ExecFile, command: string, args: string[], cwd?: string, versionPattern?: RegExp): Promise<MobileTool> {
  const result = await execText(execFile, command, args, cwd).catch((error) => ({ stdout: "", stderr: error instanceof Error ? error.message : String(error), failed: true }));
  if ("failed" in result) return missingTool(path.basename(command), result.stderr || `Install ${command}.`);
  const text = `${result.stdout}\n${result.stderr}`;
  return readyTool(path.basename(command), versionPattern?.exec(text)?.[1] ?? firstLine(text));
}

function execText(execFile: ExecFile, command: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout: TOOL_TIMEOUT_MS, windowsHide: true, maxBuffer: MAX_TOOL_OUTPUT }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.toString().trim() || stdout.toString().trim() || error.message));
      else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

async function listFiles(root: string, limit: number): Promise<string[]> {
  const ignored = new Set([".git", "node_modules", ".gradle", "build", ".idea"]);
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    if (files.length >= limit) return;
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (ignored.has(entry.name) || files.length >= limit) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(normalizeSlashes(path.relative(root, absolute)));
    }
  }
  await walk(root);
  return files;
}

async function containsInFiles(root: string, files: string[], pattern: RegExp): Promise<boolean> {
  for (const file of files.slice(0, 100)) {
    const content = await fs.readFile(path.join(root, file), "utf8").catch(() => "");
    if (pattern.test(content)) return true;
  }
  return false;
}

function inferGradleModules(summary: WorkspaceScanSummary): string[] {
  const modules = summary.manifestFiles.map(normalizeSlashes).map((file) => file.split("/")[0]).filter((part) => part && part !== "build.gradle.kts" && part !== "build.gradle" && part !== "settings.gradle" && part !== "settings.gradle.kts");
  return unique(modules.length ? modules : ["app"]);
}

function inferAppModule(summary: WorkspaceScanSummary): string | undefined {
  return summary.manifestFiles.map(normalizeSlashes).find((file) => file.startsWith("app/")) ? "app" : inferGradleModules(summary)[0];
}

function inferModulesFromFiles(files: string[]): string[] {
  return unique(files.filter((file) => /^[^/]+\/build\.gradle(\.kts)?$/.test(file)).map((file) => file.split("/")[0]));
}

function commandFromScripts(summary: WorkspaceScanSummary, names: string[]): string | undefined {
  const name = names.find((candidate) => summary.scripts[candidate]);
  return name ? `${summary.packageManager ?? "npm"} run ${name}` : undefined;
}

async function hasSdkChild(root: string, child: string): Promise<boolean> {
  const target = path.join(root, child);
  const entries = await fs.readdir(target).catch(() => []);
  return entries.length > 0;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function defaultAndroidSdkPath(): string {
  return process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Local", "Android", "Sdk")
    : path.join(os.homedir(), "Android", "Sdk");
}

function defaultAndroidStudioJavaPath(): string {
  return process.platform === "win32"
    ? "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe"
    : "java";
}

function installedAndroidSdk(): string {
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || defaultAndroidSdkPath();
}

function installedCompileSdk(sdkRoot: string): number | undefined {
  const platforms = path.join(sdkRoot, "platforms");
  if (!existsSync(platforms)) return undefined;
  const apiLevels = readdirSync(platforms, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^android-\d+(?:\.\d+)?$/.test(entry.name))
    .map((entry) => {
      const properties = path.join(platforms, entry.name, "source.properties");
      const api = existsSync(properties)
        ? readFileSync(properties, "utf8").match(/AndroidVersion\.ApiLevel=(\d+)/)?.[1]
        : entry.name.match(/^android-(\d+)/)?.[1];
      return api ? Number(api) : 0;
    })
    .filter((level) => Number.isInteger(level) && level > 0);
  return apiLevels.length ? Math.max(...apiLevels) : undefined;
}

function windowsGradleWrapperScript(): string {
  return `@echo off
setlocal EnableDelayedExpansion
set "DIR=%~dp0"
set "GRADLE_VERSION=${ANDROID_GRADLE_VERSION}"
if not defined JAVA_HOME if exist "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe" set "JAVA_HOME=C:\\Program Files\\Android\\Android Studio\\jbr"
set "GRADLE_HOME=%DIR%.gradle\\levi\\gradle-%GRADLE_VERSION%"
set "GRADLE_EXE=%GRADLE_HOME%\\bin\\gradle.bat"
if not exist "%GRADLE_EXE%" (
  set "ZIP=%DIR%.gradle\\levi\\gradle-%GRADLE_VERSION%-bin.zip"
  mkdir "%DIR%.gradle\\levi" 2>nul
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://services.gradle.org/distributions/gradle-!GRADLE_VERSION!-bin.zip' -OutFile '!ZIP!'; Expand-Archive -Force '!ZIP!' '!DIR!.gradle\\levi'"
)
if not exist "%GRADLE_EXE%" (
  echo Gradle bootstrap failed 1>&2
  exit /b 1
)
call "%GRADLE_EXE%" %*
`;
}

function unixGradleWrapperScript(): string {
  return `#!/usr/bin/env sh
set -eu
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
GRADLE_VERSION="${ANDROID_GRADLE_VERSION}"
GRADLE_HOME="$DIR/.gradle/levi/gradle-$GRADLE_VERSION"
GRADLE_EXE="$GRADLE_HOME/bin/gradle"
if [ ! -x "$GRADLE_EXE" ]; then
  ZIP="$DIR/.gradle/levi/gradle-$GRADLE_VERSION-bin.zip"
  mkdir -p "$DIR/.gradle/levi"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip" -o "$ZIP"
  else
    wget -q "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip" -O "$ZIP"
  fi
  unzip -oq "$ZIP" -d "$DIR/.gradle/levi"
fi
exec "$GRADLE_EXE" "$@"
`;
}

function readyTool(name: string, detail?: string): MobileTool {
  return { name, status: "ready", detail };
}

function missingTool(name: string, guidance: string): MobileTool {
  return { name, status: "missing", guidance };
}

function unavailableTool(name: string, detail: string): MobileTool {
  return { name, status: "unavailable", detail };
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function entriesHas(entries: Set<string>, suffix: string): boolean {
  return [...entries].some((entry) => entry === suffix || entry.endsWith(`/${suffix}`));
}

function hasAny(values: Set<string>, expected: string[]): boolean {
  return expected.some((value) => values.has(value));
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

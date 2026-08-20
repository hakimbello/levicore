import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkspaceScanSummary } from "../src/types/levi-api";
import { ProjectWorkflowService, detectNewAppIntent, detectProjectFromSummary, detectRunCommands, starterById } from "../electron/main/project-workflows";
import {
  detectMobileEnvironment,
  detectMobileProject,
  detectMobileProjectFromSummary,
  parseAdbDevices,
  universalTargetsFor
} from "../electron/main/mobile-projects";

function summary(overrides: Partial<WorkspaceScanSummary>): WorkspaceScanSummary {
  return {
    projectName: "mobile-demo",
    rootPath: "C:\\mobile-demo",
    languages: [],
    frameworks: [],
    likelyEntryPoints: [],
    sourceDirectories: [],
    testDirectories: [],
    scripts: {},
    documentationFiles: [],
    manifestFiles: [],
    includedFileCount: 0,
    excludedFileCount: 0,
    scanTimestamp: new Date(0).toISOString(),
    ...overrides
  };
}

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "levi-mobile-"));
}

function fakeExec(responses: Record<string, { stdout?: string; stderr?: string; error?: Error }>) {
  return ((command: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    const key = `${path.basename(command).toLowerCase()} ${args.join(" ")}`;
    const response = responses[key] ?? responses[path.basename(command).toLowerCase()] ?? { error: new Error(`missing ${key}`) };
    callback(response.error ?? null, response.stdout ?? "", response.stderr ?? "");
  }) as never;
}

describe("mobile project support", () => {
  it("represents Android projects with a shared mobile model and Compose detection", async () => {
    const root = await tempDir();
    await fs.mkdir(path.join(root, "app", "src", "main", "java", "app", "levi", "generated"), { recursive: true });
    await fs.writeFile(path.join(root, "settings.gradle.kts"), "include(\":app\")\n", "utf8");
    await fs.writeFile(path.join(root, "app", "build.gradle.kts"), "android { namespace = \"app.levi.generated\" applicationId = \"app.levi.generated\" }\n", "utf8");
    await fs.writeFile(path.join(root, "app", "src", "main", "AndroidManifest.xml"), "<manifest><application><activity android:name=\".MainActivity\"><intent-filter><action android:name=\"android.intent.action.MAIN\" /><category android:name=\"android.intent.category.LAUNCHER\" /></intent-filter></activity></application></manifest>\n", "utf8");
    await fs.writeFile(path.join(root, "app", "src", "main", "java", "app", "levi", "generated", "MainActivity.kt"), "import androidx.compose.material3.Text\nfun Screen() { setContent { Text(\"Hi\") } }\n", "utf8");

    const model = await detectMobileProject(root, summary({
      languages: ["Kotlin"],
      manifestFiles: ["settings.gradle.kts", "app/build.gradle.kts", "app/src/main/AndroidManifest.xml"],
      sourceDirectories: ["app/src/main"],
      likelyEntryPoints: ["app/src/main/java/app/levi/generated/MainActivity.kt"]
    }));

    expect(model).toMatchObject({
      platform: "android",
      language: "kotlin",
      framework: "jetpack-compose",
      buildSystem: "gradle",
      appModule: "app",
      packageIdentifier: "app.levi.generated",
      launcherActivity: "app.levi.generated.MainActivity"
    });
    expect(model?.requiredTools).toContain("Android SDK");
    expect(universalTargetsFor(model)).toEqual(["android-device", "android-emulator"]);
  });

  it("detects Android, Flutter, React Native, Expo, and iOS deterministically from summaries", () => {
    expect(detectProjectFromSummary(summary({
      languages: ["Kotlin"],
      manifestFiles: ["settings.gradle.kts", "app/build.gradle.kts", "app/src/main/AndroidManifest.xml"]
    }))).toMatchObject({ projectType: "kotlin-android", framework: "jetpack-compose" });

    expect(detectMobileProjectFromSummary(summary({
      languages: ["Dart"],
      manifestFiles: ["pubspec.yaml"],
      likelyEntryPoints: ["lib/main.dart"]
    }))).toMatchObject({ platform: "flutter", buildCommand: "flutter build apk" });

    expect(detectMobileProjectFromSummary(summary({
      languages: ["TypeScript"],
      frameworks: ["React Native"],
      manifestFiles: ["package.json"],
      sourceDirectories: ["android", "ios"]
    }))).toMatchObject({ platform: "react-native", framework: "react-native" });

    expect(detectMobileProjectFromSummary(summary({
      languages: ["TypeScript"],
      frameworks: ["Expo"],
      manifestFiles: ["package.json", "app.json"]
    }))).toMatchObject({ platform: "expo", framework: "expo" });

    expect(detectMobileProjectFromSummary(summary({
      languages: ["Swift"],
      frameworks: ["SwiftUI"],
      manifestFiles: ["Truck.xcodeproj", "Info.plist"],
      likelyEntryPoints: ["TruckApp.swift"]
    }))).toMatchObject({ platform: "ios", framework: "swiftui" });
  });

  it("detects Android projects from files when the workspace summary is sparse", async () => {
    const root = await tempDir();
    await fs.mkdir(path.join(root, "app", "src", "main", "java", "app", "levi", "generated"), { recursive: true });
    await fs.writeFile(path.join(root, "settings.gradle.kts"), "include(\":app\")\n", "utf8");
    await fs.writeFile(path.join(root, "app", "build.gradle.kts"), "android { namespace = \"app.levi.generated\" }\n", "utf8");
    await fs.writeFile(path.join(root, "app", "src", "main", "AndroidManifest.xml"), "<manifest />\n", "utf8");
    await fs.writeFile(path.join(root, "app", "src", "main", "java", "app", "levi", "generated", "MainActivity.kt"), "import androidx.compose.material3.Text\nfun Screen() { setContent { Text(\"Hi\") } }\n", "utf8");

    const model = await detectMobileProject(root, summary({}));

    expect(model).toMatchObject({
      platform: "android",
      language: "kotlin",
      framework: "jetpack-compose",
      appModule: "app"
    });
  });

  it("parses ADB targets including multiple and offline devices", () => {
    const targets = parseAdbDevices("List of devices attached\nemulator-5554 device product:sdk_gphone model:Pixel_8 device:emu\nR58N offline model:Galaxy_S23\nABC unauthorized\n");
    expect(targets).toEqual([
      expect.objectContaining({ id: "emulator-5554", kind: "android-emulator", state: "device", model: "Pixel 8" }),
      expect.objectContaining({ id: "R58N", kind: "android-device", state: "offline", model: "Galaxy S23" }),
      expect.objectContaining({ id: "ABC", state: "unauthorized" })
    ]);
  });

  it("reports Android environment state, targets, and Windows iOS limitation", async () => {
    const root = await tempDir();
    const sdk = path.join(root, "sdk");
    await fs.mkdir(path.join(sdk, "platform-tools"), { recursive: true });
    await fs.mkdir(path.join(sdk, "build-tools", "36.0.0"), { recursive: true });
    await fs.mkdir(path.join(sdk, "platforms", "android-36"), { recursive: true });
    await fs.mkdir(path.join(sdk, "emulator"), { recursive: true });
    const exec = fakeExec({
      "java -version": { stderr: "openjdk version \"21.0.1\"" },
      "node.exe --version": { stdout: "v24.0.0" },
      "npm.cmd --version": { stdout: "11.0.0" },
      "npx.cmd --version": { stdout: "11.0.0" },
      "gradle.bat --version": { stdout: "Gradle 8.14.3" },
      "adb.exe version": { stdout: "Android Debug Bridge version 1.0.41" },
      "adb.exe devices -l": { stdout: "List of devices attached\nemulator-5554 device model:Pixel_8\n" },
      "adb.exe -s emulator-5554 shell getprop ro.product.manufacturer": { stdout: "Google\n" },
      "adb.exe -s emulator-5554 shell getprop ro.build.version.release": { stdout: "16\n" },
      "adb.exe -s emulator-5554 shell getprop ro.build.version.sdk": { stdout: "36\n" },
      "adb.exe -s emulator-5554 shell getprop ro.product.model": { stdout: "Pixel 8\n" },
      "emulator.exe -list-avds": { stdout: "Pixel_8\n" }
    });

    const environment = await detectMobileEnvironment(root, exec, { ANDROID_HOME: sdk, JAVA_HOME: "C:\\Java" });
    expect(environment.android.status).toBe("ready");
    expect(environment.android.devices.targets[0]).toMatchObject({
      kind: "android-emulator",
      state: "device",
      manufacturer: "Google",
      androidVersion: "16",
      apiLevel: "36",
      model: "Pixel 8"
    });
    expect(environment.android.avds.names).toEqual(["Pixel_8"]);
    expect(environment.ios.sourceDevelopment.status).toBe("ready");
    if (process.platform === "win32") {
      expect(environment.ios.nativeBuild).toMatchObject({ status: "unavailable", detail: "requires macOS + Xcode" });
    }
  });

  it("exposes Android starter, build commands, APK expectation, and trucker fitness deterministic plan metadata", () => {
    const starter = starterById("android-compose");
    expect(starter.expectedFiles).toEqual(expect.arrayContaining(["app/build.gradle.kts", "app/src/main/AndroidManifest.xml"]));
    expect(starter.buildCommand).toMatchObject({ command: process.platform === "win32" ? "gradlew.bat" : "./gradlew", args: [":app:assembleDebug"] });
    expect(starter.files.map((file) => file.relativePath)).toContain("app/src/main/java/app/levi/generated/MainActivity.kt");
    expect(starter.files.find((file) => file.relativePath === "gradlew.bat")?.content).toContain("setlocal EnableDelayedExpansion");

    const intent = detectNewAppIntent("Build me an Android fitness app for truck drivers using Kotlin and Jetpack Compose.");
    expect(intent).toMatchObject({ starterId: "android-compose", projectName: "trucker-fitness" });

    const commands = detectRunCommands(summary({
      languages: ["Kotlin"],
      manifestFiles: ["settings.gradle.kts", "app/build.gradle.kts", "app/src/main/AndroidManifest.xml"]
    }));
    expect(commands.map((command) => command.id)).toEqual(expect.arrayContaining(["android:installDebug", "android:assembleDebug"]));
  });

  it("stops Android starter creation before writing files when required tooling is missing", async () => {
    const root = await tempDir();
    const service = new ProjectWorkflowService({
      getWorkspaceRoot: () => null,
      openProjectAtPath: async () => null,
      refreshWorkspace: async () => undefined,
      getWorkspaceSummary: () => undefined,
      terminalManager: {} as never,
      getWindow: () => null,
      execFile: fakeExec({})
    });

    await expect(service.createStarter({ starter: "android-compose", destinationFolder: root, projectName: "android-app" })).rejects.toThrow(/Android starter requires setup/);
    await expect(fs.readdir(path.join(root, "android-app")).catch(() => [])).resolves.toEqual([]);
  });

  it("selects an Android target for Run App, installs, launches, and stops without free-form ADB shell exposure", async () => {
    const root = await tempDir();
    const sdk = path.join(root, "sdk");
    const calls: string[] = [];
    await fs.mkdir(path.join(root, "app", "src", "main"), { recursive: true });
    await fs.mkdir(path.join(sdk, "platform-tools"), { recursive: true });
    await fs.mkdir(path.join(sdk, "build-tools", "36.0.0"), { recursive: true });
    await fs.mkdir(path.join(sdk, "platforms", "android-36"), { recursive: true });
    await fs.writeFile(path.join(root, "settings.gradle.kts"), "include(\":app\")\n", "utf8");
    await fs.writeFile(path.join(root, "app", "build.gradle.kts"), "android { namespace = \"app.levi.generated\" applicationId = \"app.levi.generated\" }\n", "utf8");
    await fs.writeFile(path.join(root, "app", "src", "main", "AndroidManifest.xml"), "<manifest><application><activity android:name=\".MainActivity\"><intent-filter><action android:name=\"android.intent.action.MAIN\" /><category android:name=\"android.intent.category.LAUNCHER\" /></intent-filter></activity></application></manifest>\n", "utf8");
    await fs.writeFile(path.join(root, "gradlew.bat"), "@echo off\n", "utf8");
    const exec = ((command: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      calls.push(`${path.basename(command)} ${args.join(" ")}`);
      if (args.join(" ") === "devices -l") callback(null, "List of devices attached\nemulator-5554 device model:Pixel_8\n", "");
      else if (args.join(" ") === "-s emulator-5554 shell getprop ro.product.manufacturer") callback(null, "Google\n", "");
      else if (args.join(" ") === "-s emulator-5554 shell getprop ro.build.version.release") callback(null, "16\n", "");
      else if (args.join(" ") === "-s emulator-5554 shell getprop ro.build.version.sdk") callback(null, "36\n", "");
      else if (args.join(" ") === "-s emulator-5554 shell getprop ro.product.model") callback(null, "Pixel 8\n", "");
      else if (args.includes(":app:installDebug")) callback(null, "BUILD SUCCESSFUL\nInstalled on emulator-5554\n", "");
      else if (args.join(" ") === "-s emulator-5554 shell input keyevent HOME") callback(null, "", "");
      else if (args.includes("am") && args.includes("start")) callback(null, "Starting: Intent\nStatus: ok\n", "");
      else if (args.includes("force-stop")) callback(null, "", "");
      else if (path.basename(command).toLowerCase().startsWith("adb")) callback(null, "Android Debug Bridge version 1.0.41\n", "");
      else if (path.basename(command).toLowerCase().startsWith("gradlew")) callback(null, "Gradle 8.14.3\n", "");
      else if (path.basename(command).toLowerCase().startsWith("java")) callback(null, "", "openjdk version \"21.0.1\"");
      else callback(null, "ok\n", "");
    }) as never;
    const service = new ProjectWorkflowService({
      getWorkspaceRoot: () => root,
      openProjectAtPath: async () => null,
      refreshWorkspace: async () => undefined,
      getWorkspaceSummary: () => summary({
        languages: ["Kotlin"],
        manifestFiles: ["settings.gradle.kts", "app/build.gradle.kts", "app/src/main/AndroidManifest.xml"],
        sourceDirectories: ["app/src/main"]
      }),
      terminalManager: {} as never,
      getWindow: () => null,
      execFile: exec
    });
    const previousAndroidHome = process.env.ANDROID_HOME;
    process.env.ANDROID_HOME = sdk;
    try {
      const result = await service.startRun("android:installDebug");
      expect(result.status).toMatchObject({ running: true, target: expect.objectContaining({ id: "emulator-5554" }) });
      expect(result.status.outputPreview).toContain("Status: ok");
      const stopped = service.stopRun();
      expect(stopped.status.running).toBe(false);
      expect(calls.some((call) => call.includes("shell input keyevent HOME"))).toBe(true);
      expect(calls.some((call) => call.includes("shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n app.levi.generated/app.levi.generated.MainActivity"))).toBe(true);
    } finally {
      if (previousAndroidHome === undefined) delete process.env.ANDROID_HOME;
      else process.env.ANDROID_HOME = previousAndroidHome;
    }
  });

  it("reports Android device disconnected when no target is available for Run App", async () => {
    const root = await tempDir();
    const sdk = path.join(root, "sdk");
    await fs.mkdir(path.join(root, "app", "src", "main"), { recursive: true });
    await fs.mkdir(path.join(sdk, "platform-tools"), { recursive: true });
    await fs.mkdir(path.join(sdk, "build-tools", "36.0.0"), { recursive: true });
    await fs.mkdir(path.join(sdk, "platforms", "android-36"), { recursive: true });
    await fs.writeFile(path.join(root, "gradlew.bat"), "@echo off\n", "utf8");
    const exec = ((command: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      if (args.join(" ") === "devices -l") callback(null, "List of devices attached\n", "");
      else if (path.basename(command).toLowerCase().startsWith("adb")) callback(null, "Android Debug Bridge version 1.0.41\n", "");
      else if (path.basename(command).toLowerCase().startsWith("gradlew")) callback(null, "Gradle 9.6.1\n", "");
      else if (path.basename(command).toLowerCase().startsWith("java")) callback(null, "", "openjdk version \"21.0.1\"");
      else callback(null, "ok\n", "");
    }) as never;
    const service = new ProjectWorkflowService({
      getWorkspaceRoot: () => root,
      openProjectAtPath: async () => null,
      refreshWorkspace: async () => undefined,
      getWorkspaceSummary: () => summary({
        languages: ["Kotlin"],
        manifestFiles: ["settings.gradle.kts", "app/build.gradle.kts", "app/src/main/AndroidManifest.xml"],
        sourceDirectories: ["app/src/main"]
      }),
      terminalManager: {} as never,
      getWindow: () => null,
      execFile: exec
    });
    const previousAndroidHome = process.env.ANDROID_HOME;
    process.env.ANDROID_HOME = sdk;
    try {
      await expect(service.startRun("android:installDebug")).rejects.toThrow(/Android device disconnected/i);
    } finally {
      if (previousAndroidHome === undefined) delete process.env.ANDROID_HOME;
      else process.env.ANDROID_HOME = previousAndroidHome;
    }
  });
});

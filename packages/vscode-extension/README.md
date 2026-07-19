# Levi VS Code Extension Shell

This package contains the L3-002 VS Code shell for Levi. It isolates VS Code API usage from the platform-independent runtime and calls Levi only through `LeviApplicationRuntime` public APIs.

Development:

- Run `npm.cmd --prefix packages/vscode-extension run check`
- Run `npm.cmd --prefix packages/vscode-extension test`
- Run `npm.cmd --prefix packages/vscode-extension run validate`
- Open the repository root in VS Code and launch `Levi: Extension Development Host` from Run and Debug.
- The launch configuration resolves the extension with `${workspaceFolder}/packages/vscode-extension`.

The extension does not include model-provider SDKs, cloud services, unrestricted terminal execution, or autonomous source mutation.

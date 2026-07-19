const crypto = require("node:crypto");

class VSCodeWorkspaceMutationAdapter {
  constructor(options = {}) {
    this.vscode = required(options.vscode, "VS Code API is required.");
    this.workspaceAdapter = required(options.workspaceAdapter, "VS Code workspace adapter is required.");
  }

  async readFile(workspace, uriInput, options = {}) {
    const uri = this.resolveUri(workspace, uriInput);
    const result = await this.workspaceAdapter.readFile(workspace, uri, options);
    const content = String(result.content || "");
    return { ...result, uri: this.relative(uri), content, hash: hash(content), size: Buffer.byteLength(content, "utf8") };
  }

  async stat(workspace, uriInput, options = {}) {
    const uri = this.resolveUri(workspace, uriInput);
    const result = await this.workspaceAdapter.stat(workspace, uri, options);
    return { ...result, uri: this.relative(uri) };
  }

  async applyEdits(workspace, uriInput, edits, options = {}) {
    const uri = this.resolveUri(workspace, uriInput);
    const read = await this.readFile(workspace, uri, options);
    if (options.expectedHash && read.hash !== options.expectedHash) throw new Error(`File changed before apply: ${read.uri}.`);
    const content = applyEditsToContent(read.content, edits);
    await this.vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    await this.saveIfOpen(uri);
    return { status: "APPLIED", operation: "UPDATE", uri: read.uri, hash: hash(content), size: Buffer.byteLength(content, "utf8") };
  }

  async createFile(workspace, uriInput, content, options = {}) {
    const uri = this.resolveUri(workspace, uriInput);
    if (!options.overwrite) {
      try {
        await this.vscode.workspace.fs.stat(uri);
        throw new Error(`File already exists: ${this.relative(uri)}.`);
      } catch (error) {
        if (!/not found|not exist|enoent/i.test(error.message)) throw error;
      }
    }
    const text = String(content || "");
    await this.vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
    await this.saveIfOpen(uri);
    return { status: "APPLIED", operation: "CREATE", uri: this.relative(uri), hash: hash(text), size: Buffer.byteLength(text, "utf8") };
  }

  async deleteFile(workspace, uriInput, options = {}) {
    const uri = this.resolveUri(workspace, uriInput);
    await this.vscode.workspace.fs.delete(uri, { recursive: false, useTrash: options.useTrash === true });
    return { status: "APPLIED", operation: "DELETE", uri: this.relative(uri) };
  }

  async renameFile(workspace, fromInput, toInput, options = {}) {
    const from = this.resolveUri(workspace, fromInput);
    const to = this.resolveUri(workspace, toInput);
    await this.vscode.workspace.fs.rename(from, to, { overwrite: options.overwrite === true });
    await this.saveIfOpen(to);
    return { status: "APPLIED", operation: "RENAME", uri: this.relative(from), targetUri: this.relative(to) };
  }

  async verifyFile(workspace, uriInput, expectation = {}) {
    if (expectation.operation === "DELETE") {
      try {
        await this.vscode.workspace.fs.stat(this.resolveUri(workspace, uriInput));
        return { valid: false, message: "Deleted file still exists." };
      } catch (_) {
        return { valid: true, status: "VERIFIED" };
      }
    }
    const read = await this.readFile(workspace, uriInput, {});
    if (expectation.expectedHash && read.hash !== expectation.expectedHash) return { valid: false, message: "File hash did not match expected content.", actualHash: read.hash };
    if (expectation.expectedContent !== undefined && read.content !== String(expectation.expectedContent)) return { valid: false, message: "File content did not match expected content." };
    return { valid: true, status: "VERIFIED", uri: read.uri, hash: read.hash };
  }

  getWorkspaceRevision(workspace) {
    return this.workspaceAdapter.getWorkspaceRevision(workspace);
  }

  resolveUri(workspace = {}, uriInput = "") {
    if (uriInput && uriInput.scheme && typeof uriInput.toString === "function") return uriInput;
    const raw = typeof uriInput === "string" ? uriInput : uriInput && (uriInput.uri || uriInput.path || uriInput.relativePath) || "";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return this.vscode.Uri.parse(raw);
    return this.vscode.Uri.parse(this.workspaceAdapter.resolvePath(workspace, raw));
  }

  relative(uri) {
    if (this.vscode.workspace.asRelativePath) return this.vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
    return uri.toString();
  }

  async saveIfOpen(uri) {
    const documents = this.vscode.workspace.textDocuments || [];
    const document = documents.find((entry) => entry.uri && entry.uri.toString() === uri.toString());
    if (document && typeof document.save === "function") await document.save();
  }
}

function applyEditsToContent(content, edits) {
  let next = String(content || "");
  const normalized = (edits || []).map((edit) => {
    const start = edit.start === undefined || edit.start === null ? offsetForRange(next, edit.range && edit.range.start) : Number(edit.start);
    const end = edit.end === undefined || edit.end === null ? offsetForRange(next, edit.range && edit.range.end, next.length) : Number(edit.end);
    return { start, end, expectedText: edit.expectedText === undefined ? null : String(edit.expectedText), newText: String(edit.newText || "") };
  }).sort((left, right) => right.start - left.start);
  for (const edit of normalized) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > next.length) throw new Error("Text edit range is out of bounds.");
    if (edit.expectedText !== null && next.slice(edit.start, edit.end) !== edit.expectedText) throw new Error("Text edit expectedText does not match current content.");
    next = next.slice(0, edit.start) + edit.newText + next.slice(edit.end);
  }
  return next;
}

function offsetForRange(content, position, fallback = 0) {
  if (!position) return fallback;
  const line = Number(position.line || 0);
  const character = Number(position.character || 0);
  const lines = String(content || "").split(/\r?\n/);
  let offset = 0;
  for (let index = 0; index < Math.min(line, lines.length); index += 1) offset += lines[index].length + 1;
  return Math.min(String(content || "").length, offset + character);
}

function hash(content) {
  return crypto.createHash("sha256").update(String(content || "")).digest("hex");
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

module.exports = {
  VSCodeWorkspaceMutationAdapter,
};

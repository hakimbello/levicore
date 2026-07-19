const { renderDocument } = require("./presentation");

class LeviVirtualDocumentProvider {
  constructor(vscode) {
    this.vscode = vscode;
    this.documents = new Map();
    this.emitter = new vscode.EventEmitter();
    this.onDidChange = this.emitter.event;
  }

  setDocument(key, title, data) {
    const uri = this.uriFor(key);
    this.documents.set(uri.toString(), renderDocument(title, data));
    this.emitter.fire(uri);
    return uri;
  }

  provideTextDocumentContent(uri) {
    return this.documents.get(uri.toString()) || "# Levi\n\nNo content available.\n";
  }

  uriFor(key) {
    return this.vscode.Uri.parse(`levi:/${encodeURIComponent(key)}`);
  }

  dispose() {
    if (this.emitter && typeof this.emitter.dispose === "function") this.emitter.dispose();
  }
}

module.exports = {
  LeviVirtualDocumentProvider,
};

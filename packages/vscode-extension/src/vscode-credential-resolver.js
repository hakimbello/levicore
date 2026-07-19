class VSCodeSecretCredentialResolver {
  constructor(context, options = {}) {
    this.context = context || {};
    this.prefix = options.prefix || "levi.modelProvider.";
    this.memory = new Map();
  }

  async getCredential(reference) {
    const key = this.key(reference);
    if (!key) return null;
    if (this.context.secrets && typeof this.context.secrets.get === "function") return this.context.secrets.get(key);
    return this.memory.get(key) || null;
  }

  async hasCredential(reference) {
    return Boolean(await this.getCredential(reference));
  }

  async setCredential(reference, value) {
    const key = this.key(reference);
    if (!key) throw new Error("Credential reference is required.");
    if (this.context.secrets && typeof this.context.secrets.store === "function") {
      await this.context.secrets.store(key, String(value || ""));
      return { status: "STORED", reference };
    }
    this.memory.set(key, String(value || ""));
    return { status: "STORED", reference };
  }

  async clearCredential(reference) {
    const key = this.key(reference);
    if (!key) return { status: "EMPTY", reference };
    if (this.context.secrets && typeof this.context.secrets.delete === "function") await this.context.secrets.delete(key);
    this.memory.delete(key);
    return { status: "CLEARED", reference };
  }

  key(reference) {
    if (!reference) return null;
    return `${this.prefix}${String(reference).replace(/[^A-Za-z0-9_.:-]/g, "_")}`;
  }
}

module.exports = {
  VSCodeSecretCredentialResolver,
};

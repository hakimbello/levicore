class InMemoryCredentialResolver {
  constructor(initial = {}) {
    this.credentials = new Map(Object.entries(initial));
  }

  getCredential(reference) {
    const key = normalizeReference(reference);
    return this.credentials.get(key) || null;
  }

  hasCredential(reference) {
    return this.credentials.has(normalizeReference(reference));
  }

  clearCredential(reference) {
    return this.credentials.delete(normalizeReference(reference));
  }

  setCredential(reference, value) {
    const key = normalizeReference(reference);
    if (typeof value !== "string" || value === "") throw new Error("Credential value must be a non-empty string.");
    this.credentials.set(key, value);
    return { reference: key, stored: true };
  }
}

function normalizeReference(reference) {
  if (typeof reference === "string" && reference.trim() !== "") return reference.trim();
  if (reference && typeof reference === "object" && typeof reference.id === "string" && reference.id.trim() !== "") return reference.id.trim();
  throw new Error("Credential reference is required.");
}

module.exports = {
  InMemoryCredentialResolver,
};

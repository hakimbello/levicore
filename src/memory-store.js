const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const CONFIDENCE_STATES = new Set(["APPROVED", "VERIFIED", "INFERRED", "REJECTED"]);
const RECORD_TYPES = new Set(["project-fact", "approved-decision", "task-outcome", "failed-attempt"]);

function createMemoryStore(filePath) {
  const storePath = path.resolve(filePath);

  function loadStore() {
    if (!fs.existsSync(storePath)) {
      return { projects: {} };
    }

    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  }

  function saveStore(store) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }

  function listRecords(projectId) {
    const store = loadStore();
    const project = store.projects[projectId];
    return project ? project.records : [];
  }

  function addRecord(projectId, record) {
    const normalized = normalizeRecord({
      ...record,
      projectId: record.projectId || projectId,
    });
    const store = loadStore();

    if (!store.projects[projectId]) {
      store.projects[projectId] = { records: [] };
    }

    store.projects[projectId].records.push(normalized);
    saveStore(store);
    return normalized;
  }

  function removeRecord(projectId, recordId) {
    const store = loadStore();
    const project = store.projects[projectId];

    if (!project) {
      return false;
    }

    const before = project.records.length;
    project.records = project.records.filter((record) => record.id !== recordId);
    saveStore(store);
    return project.records.length !== before;
  }

  function updateRecord(projectId, recordId, updater) {
    const store = loadStore();
    const project = store.projects[projectId];

    if (!project) {
      return null;
    }

    const index = project.records.findIndex((record) => record.id === recordId);

    if (index === -1) {
      return null;
    }

    const current = project.records[index];
    const next = typeof updater === "function" ? updater(JSON.parse(JSON.stringify(current))) : updater;
    const normalized = normalizeRecord({
      ...next,
      id: current.id,
      projectId: current.projectId || projectId,
      timestamp: next.timestamp || current.timestamp,
    });

    project.records[index] = normalized;
    saveStore(store);
    return normalized;
  }

  return {
    addRecord,
    listRecords,
    removeRecord,
    updateRecord,
  };
}

function normalizeRecord(record) {
  validateRecord(record);

  return {
    id: record.id || crypto.randomUUID(),
    projectId: record.projectId,
    type: record.type,
    source: record.source,
    timestamp: record.timestamp || new Date().toISOString(),
    confidenceState: record.confidenceState,
    value: record.value,
  };
}

function validateRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Memory record must be an object.");
  }

  if (!RECORD_TYPES.has(record.type)) {
    throw new Error("Memory record type is required.");
  }

  if (record.projectId !== undefined && (typeof record.projectId !== "string" || record.projectId.trim() === "")) {
    throw new Error("Memory record project ID must be a nonempty string.");
  }

  if (!record.source || typeof record.source !== "object" || Array.isArray(record.source)) {
    throw new Error("Memory record source is required.");
  }

  if (record.timestamp && Number.isNaN(Date.parse(record.timestamp))) {
    throw new Error("Memory record timestamp must be valid.");
  }

  if (!CONFIDENCE_STATES.has(record.confidenceState)) {
    throw new Error("Memory record confidence state is required.");
  }

  if (record.source.kind === "model-output" && record.confidenceState === "APPROVED") {
    throw new Error("Unverified model output cannot become approved project truth.");
  }
}

module.exports = {
  createMemoryStore,
};

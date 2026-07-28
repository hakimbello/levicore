const {
  approvalsModel,
  changesModel,
  diagnosticsModel,
  modelsModel,
  multiAgentModel,
  operationsModel,
  overviewModel,
  performanceModel,
  projectModel,
  qualificationModel,
  reliabilityModel,
  securityAssuranceModel,
  stressScalabilityModel,
  workflowsModel,
} = require("./presentation");
const { environmentModel } = require("./product-experience/environment-view-provider");

class LeviTreeProvider {
  constructor(vscode, id, modelFactory) {
    this.vscode = vscode;
    this.id = id;
    this.modelFactory = modelFactory;
    this.state = {};
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
  }

  setState(state) {
    this.state = state || {};
    this.refresh();
  }

  refresh() {
    this.emitter.fire(undefined);
  }

  getTreeItem(element) {
    const item = new this.vscode.TreeItem(element.label, element.children && element.children.length ? this.vscode.TreeItemCollapsibleState.Collapsed : this.vscode.TreeItemCollapsibleState.None);
    item.description = element.description || "";
    item.tooltip = element.description || element.label;
    item.contextValue = element.kind;
    return item;
  }

  getChildren(element) {
    if (element) return Promise.resolve(element.children || []);
    const model = this.modelFactory(this.state);
    return Promise.resolve(model.children || []);
  }

  dispose() {
    if (this.emitter && typeof this.emitter.dispose === "function") this.emitter.dispose();
  }
}

function createViewProviders(vscode) {
  return {
    overview: new LeviTreeProvider(vscode, "levi.overview", (state) => overviewModel(state)),
    environment: new LeviTreeProvider(vscode, "levi.environment", (state) => environmentModel(state)),
    project: new LeviTreeProvider(vscode, "levi.project", (state) => projectModel(state.project || {})),
    settings: new LeviTreeProvider(vscode, "levi.settings", (state) => settingsModel(state)),
    operations: new LeviTreeProvider(vscode, "levi.operations", (state) => operationsModel(state.operations || [])),
    approvals: new LeviTreeProvider(vscode, "levi.approvals", (state) => approvalsModel(state.approvals || [])),
    models: new LeviTreeProvider(vscode, "levi.models", (state) => modelsModel(state)),
    changes: new LeviTreeProvider(vscode, "levi.changes", (state) => changesModel(state)),
    multiAgent: new LeviTreeProvider(vscode, "levi.multiAgent", (state) => multiAgentModel(state)),
    workflows: new LeviTreeProvider(vscode, "levi.workflows", (state) => workflowsModel(state)),
    performance: new LeviTreeProvider(vscode, "levi.performance", (state) => performanceModel(state)),
    reliability: new LeviTreeProvider(vscode, "levi.reliability", (state) => reliabilityModel(state)),
    securityAssurance: new LeviTreeProvider(vscode, "levi.securityAssurance", (state) => securityAssuranceModel(state)),
    stressScalability: new LeviTreeProvider(vscode, "levi.stressScalability", (state) => stressScalabilityModel(state)),
    qualification: new LeviTreeProvider(vscode, "levi.qualification", (state) => qualificationModel(state)),
    diagnostics: new LeviTreeProvider(vscode, "levi.diagnostics", (state) => diagnosticsModel(state)),
  };
}

function settingsModel(state = {}) {
  const config = state.configuration || {};
  const homeConnection = state.homeConnection || {};
  const readiness = homeConnection.ollamaReadiness || {};
  return {
    label: "Settings",
    children: [
      { label: "Local AI", description: readiness.status === "READY" || readiness.status === "NEEDS_MODEL" ? "Ready" : "Not connected", kind: "settings" },
      { label: "Behavior", description: config.requireApproval === false ? "Manual approvals off" : "Ask before edits and commands", kind: "settings" },
      { label: "Advanced", description: "Developer Tools", kind: "settings" },
    ],
  };
}

module.exports = {
  LeviTreeProvider,
  createViewProviders,
};

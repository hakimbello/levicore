const { serializeProductExperience } = require("./product-experience-serializer");

function presentOnboarding(state = {}, config = {}) {
  const completed = Boolean(state.productExperience && state.productExperience.onboarding && state.productExperience.onboarding.completed);
  const providers = state.modelProviders || [];
  const hasLocalProvider = providers.some((provider) => provider.local === true || provider.type === "OLLAMA");
  const hasModels = (state.models || []).length > 0;
  return serializeProductExperience({
    completed,
    shouldShow: config.autoOpenOnFirstRun !== false && !completed,
    steps: [
      step("Workspace", Boolean(state.workspace && state.workspace.id), state.workspace ? "Workspace is open" : "Open a workspace"),
      step("Workspace Trust", state.workspace && state.workspace.trusted !== false, state.workspace && state.workspace.trusted === false ? "Trust is required for protected actions" : "Trust boundary is visible"),
      step("Local Model", hasLocalProvider, hasLocalProvider ? "Local provider configured" : "Ollama can be configured later"),
      step("Model Selection", hasModels, hasModels ? "A model is available" : "No cloud provider is required"),
      step("Git", Boolean(state.sourceControl && state.sourceControl.available), state.sourceControl && state.sourceControl.available ? "Git status available" : "Git actions are unavailable"),
      step("Safe Check", true, "Read-only runtime health is available"),
    ],
    actions: ["Select Model", "Open Setup Guide", "Configure Endpoint", "Skip"],
    noCloudRequired: true,
  });
}

function step(label, complete, description) {
  return { label, complete: Boolean(complete), description };
}

module.exports = {
  presentOnboarding,
};

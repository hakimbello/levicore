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
      step("Local AI Model", hasLocalProvider, hasLocalProvider ? "Local Ollama configured" : "Install Ollama and pull a model"),
      step("Model Selection", hasModels, hasModels ? "An AI model is available" : "Set `levi.ollama.defaultModel` after pulling a model"),
      step("Git", Boolean(state.sourceControl && state.sourceControl.available), state.sourceControl && state.sourceControl.available ? "Git status available" : "Git actions are unavailable"),
      step("Safe Check", true, "Read-only runtime health is available"),
    ],
    actions: ["Select AI Model", "Open Setup Guide", "Test Ollama Connection", "Skip"],
    noCloudRequired: true,
  });
}

function step(label, complete, description) {
  return { label, complete: Boolean(complete), description };
}

module.exports = {
  presentOnboarding,
};

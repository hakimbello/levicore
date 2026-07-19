const { serializeProductExperience } = require("./product-experience-serializer");

function presentModelPickerState(state = {}) {
  const providers = state.modelProviders || [];
  const models = state.models || [];
  const defaultModelId = state.modelHealth && state.modelHealth.defaultModelId;
  const selected = state.selectedModel || models.find((model) => model.id === defaultModelId) || models[0] || null;
  return serializeProductExperience({
    selected: selected && {
      id: selected.id,
      name: selected.name || selected.id,
      providerId: selected.providerId || "unknown",
      local: selected.local === true || selected.remote !== true,
      remote: selected.remote === true,
      availability: selected.state || "Available",
    } || null,
    providers: providers.slice(0, 20).map((provider) => ({
      id: provider.id,
      name: provider.name || provider.id,
      local: provider.local === true || provider.remote !== true,
      remote: provider.remote === true,
      availability: provider.state || provider.status || "Unknown",
      privacy: provider.privacyPolicyStatus || "Policy enforced",
    })),
    models: models.slice(0, 50).map((model) => ({
      id: model.id,
      name: model.name || model.id,
      providerId: model.providerId,
      local: model.local === true || model.remote !== true,
      remote: model.remote === true,
      capabilities: (model.capabilities || []).slice(0, 6),
    })),
    gateway: state.modelHealth && (state.modelHealth.gatewayState || state.modelHealth.status) || "Unavailable",
    privacy: state.modelHealth && state.modelHealth.privacyPolicyStatus || "ENFORCED",
    credentialValuesVisible: false,
    actions: ["Select Model", "Refresh Providers", "Test Provider", "Open Model Settings"],
  });
}

module.exports = {
  presentModelPickerState,
};

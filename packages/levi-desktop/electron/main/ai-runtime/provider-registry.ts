import type { AIRuntimeProvider, AIRuntimeProviderId } from "../../../src/features/ai-runtime/types";

export type AIRuntimeProviderFactory = () => AIRuntimeProvider;

export class AIRuntimeProviderRegistry {
  private readonly factories = new Map<AIRuntimeProviderId, AIRuntimeProviderFactory>();

  register(id: AIRuntimeProviderId, factory: AIRuntimeProviderFactory): void {
    if (this.factories.has(id)) {
      throw new Error(`AI runtime provider "${id}" is already registered.`);
    }
    this.factories.set(id, factory);
  }

  get(id: AIRuntimeProviderId): AIRuntimeProvider | undefined {
    return this.factories.get(id)?.();
  }

  list(): AIRuntimeProvider[] {
    return [...this.factories.values()].map((factory) => factory());
  }

  ids(): AIRuntimeProviderId[] {
    return [...this.factories.keys()];
  }
}

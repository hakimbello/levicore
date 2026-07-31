import type { DebugScope, DebugVariable } from "./DebugEvents";

export class VariableStore {
  private scopes: DebugScope[] = [];

  list(): DebugScope[] {
    return this.scopes.map((scope) => ({
      ...scope,
      variables: scope.variables.map((variable) => ({ ...variable }))
    }));
  }

  replaceScopes(scopes: DebugScope[]): void {
    this.scopes = scopes.map((scope) => ({
      ...scope,
      variables: scope.variables.map((variable) => ({ ...variable }))
    }));
  }

  replaceVariables(variablesReference: number, variables: DebugVariable[]): void {
    this.scopes = this.scopes.map((scope) =>
      scope.variablesReference === variablesReference
        ? { ...scope, variables: variables.map((variable) => ({ ...variable })) }
        : scope
    );
  }

  clear(): void {
    this.scopes = [];
  }
}

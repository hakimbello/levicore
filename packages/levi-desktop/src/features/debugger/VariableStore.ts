import type { DebugScope, DebugVariable } from "./DebugEvents";

export class VariableStore {
  private scopes: DebugScope[] = [];

  list(): DebugScope[] {
    return this.scopes.map((scope) => ({
      ...scope,
      variables: scope.variables.map(cloneVariable)
    }));
  }

  replaceScopes(scopes: DebugScope[]): void {
    this.scopes = scopes.map((scope) => ({
      ...scope,
      variables: scope.variables.map(cloneVariable)
    }));
  }

  replaceVariables(variablesReference: number, variables: DebugVariable[]): void {
    this.scopes = this.scopes.map((scope) =>
      scope.variablesReference === variablesReference
        ? { ...scope, variables: variables.map((variable) => ({ ...variable })) }
        : { ...scope, variables: replaceChildVariables(scope.variables, variablesReference, variables) }
    );
  }

  setExpanded(variablesReference: number, variables: DebugVariable[]): void {
    this.scopes = this.scopes.map((scope) => ({
      ...scope,
      variables: expandVariables(scope.variables, variablesReference, variables)
    }));
  }

  collapseVariables(variablesReference: number): void {
    this.scopes = this.scopes.map((scope) => ({
      ...scope,
      variables: collapseVariables(scope.variables, variablesReference)
    }));
  }

  findVariable(variablesReference: number): DebugVariable | null {
    for (const scope of this.scopes) {
      const variable = findVariable(scope.variables, variablesReference);
      if (variable) return variable;
    }
    return null;
  }

  scopeByReference(variablesReference: number): DebugScope | null {
    return this.scopes.find((scope) => scope.variablesReference === variablesReference) ?? null;
  }

  clear(): void {
    this.scopes = [];
  }
}

function cloneVariable(variable: DebugVariable): DebugVariable {
  return {
    ...variable,
    children: variable.children?.map(cloneVariable)
  };
}

function replaceChildVariables(current: DebugVariable[], variablesReference: number, variables: DebugVariable[]): DebugVariable[] {
  return current.map((variable) =>
    variable.variablesReference === variablesReference
      ? { ...variable, children: variables.map(cloneVariable), expanded: true }
      : { ...variable, children: variable.children ? replaceChildVariables(variable.children, variablesReference, variables) : undefined }
  );
}

function expandVariables(current: DebugVariable[], variablesReference: number, variables: DebugVariable[]): DebugVariable[] {
  return current.map((variable) =>
    variable.variablesReference === variablesReference
      ? { ...variable, children: variables.map(cloneVariable), expanded: true }
      : { ...variable, children: variable.children ? expandVariables(variable.children, variablesReference, variables) : undefined }
  );
}

function collapseVariables(current: DebugVariable[], variablesReference: number): DebugVariable[] {
  return current.map((variable) =>
    variable.variablesReference === variablesReference
      ? { ...variable, children: [], expanded: false }
      : { ...variable, children: variable.children ? collapseVariables(variable.children, variablesReference) : undefined }
  );
}

function findVariable(variables: DebugVariable[], variablesReference: number): DebugVariable | null {
  for (const variable of variables) {
    if (variable.variablesReference === variablesReference) {
      return variable;
    }
    const child = variable.children ? findVariable(variable.children, variablesReference) : null;
    if (child) return child;
  }
  return null;
}

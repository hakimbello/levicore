import type {
  LeviApiWithWorkspaceTree,
  WorkspaceTreeResult
} from "../types/workspace-tree-api";

let cachedTree: WorkspaceTreeResult | null = null;
let inFlightRequest: Promise<WorkspaceTreeResult> | null = null;

function getWorkspaceApi(): LeviApiWithWorkspaceTree["workspace"] {
  const levi = (window as Window & { levi?: LeviApiWithWorkspaceTree }).levi;

  if (!levi?.workspace?.listTree) {
    throw new Error("The workspace tree API is unavailable. Restart Levi and try again.");
  }

  return levi.workspace;
}

export async function loadWorkspaceTree(options: { force?: boolean } = {}): Promise<WorkspaceTreeResult> {
  if (!options.force && cachedTree) {
    return cachedTree;
  }

  if (!options.force && inFlightRequest) {
    return inFlightRequest;
  }

  const request = getWorkspaceApi()
    .listTree()
    .then((result) => {
      cachedTree = result;
      return result;
    })
    .finally(() => {
      if (inFlightRequest === request) {
        inFlightRequest = null;
      }
    });

  inFlightRequest = request;
  return request;
}

export function refreshWorkspaceTree(): Promise<WorkspaceTreeResult> {
  return loadWorkspaceTree({ force: true });
}

export function clearWorkspaceTreeCache(): void {
  cachedTree = null;
  inFlightRequest = null;
}

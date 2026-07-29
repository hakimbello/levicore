import { useCallback, useEffect, useState } from "react";
import { loadWorkspaceTree, refreshWorkspaceTree } from "../services/workspace-tree";
import type { WorkspaceTreeResult } from "../types/workspace-tree-api";

export type WorkspaceTreeState = {
  tree: WorkspaceTreeResult | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load the workspace.";
}

export function useWorkspaceTree(): WorkspaceTreeState {
  const [tree, setTree] = useState<WorkspaceTreeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    loadWorkspaceTree()
      .then((result) => {
        if (!disposed) {
          setTree(result);
          setError(null);
        }
      })
      .catch((nextError: unknown) => {
        if (!disposed) {
          setError(getErrorMessage(nextError));
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setTree(await refreshWorkspaceTree());
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { tree, loading, refreshing, error, refresh };
}

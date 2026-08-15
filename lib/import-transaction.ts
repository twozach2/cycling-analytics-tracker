export type SaveThenRefreshResult<TSaved, TRefreshed> =
  | { status: "saved"; saved: TSaved; refreshed: TRefreshed }
  | { status: "saved_refresh_failed"; saved: TSaved; refreshError: Error };

function toError(error: unknown) {
  return error instanceof Error ? error : new Error("The saved data could not be refreshed.");
}

/**
 * Keeps persistence and reload failures distinct. Once save resolves, callers
 * must never tell the rider that the original save failed or invite a retry
 * that could create a duplicate.
 */
export async function saveThenRefresh<TSaved, TRefreshed>(
  save: () => Promise<TSaved>,
  refresh: () => Promise<TRefreshed>,
): Promise<SaveThenRefreshResult<TSaved, TRefreshed>> {
  const saved = await save();
  try {
    return { status: "saved", saved, refreshed: await refresh() };
  } catch (error) {
    return { status: "saved_refresh_failed", saved, refreshError: toError(error) };
  }
}

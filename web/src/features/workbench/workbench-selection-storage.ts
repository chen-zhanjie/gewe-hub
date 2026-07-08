const selectedAccountStorageKey = "gewehub.workbench.selectedAccountId";

export function readStoredSelectedAccountId() {
  try {
    return window.localStorage.getItem(selectedAccountStorageKey);
  } catch {
    return null;
  }
}

export function storeSelectedAccountId(accountId: string | null) {
  try {
    if (accountId) {
      window.localStorage.setItem(selectedAccountStorageKey, accountId);
    } else {
      window.localStorage.removeItem(selectedAccountStorageKey);
    }
  } catch {
    // Account selection should still work for the current page when storage is unavailable.
  }
}

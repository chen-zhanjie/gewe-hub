const mobileAccountStorageKey = "gewehub.mobile.accountId";

export function loadMobileAccountId(): string | null {
  try {
    return window.localStorage.getItem(mobileAccountStorageKey);
  } catch {
    return null;
  }
}

export function storeMobileAccountId(accountId: string | null): void {
  try {
    if (accountId) {
      window.localStorage.setItem(mobileAccountStorageKey, accountId);
      return;
    }

    window.localStorage.removeItem(mobileAccountStorageKey);
  } catch {
    // localStorage 不可用时，账号选择仍可在当前页面内继续工作。
  }
}

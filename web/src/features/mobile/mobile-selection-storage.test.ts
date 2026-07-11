import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMobileAccountId, storeMobileAccountId } from "./mobile-selection-storage";

describe("mobile account selection storage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("使用移动端独立 key 持久化账号选择", () => {
    storeMobileAccountId("account-1");

    expect(loadMobileAccountId()).toBe("account-1");
    expect(window.localStorage.getItem("gewehub.mobile.accountId")).toBe("account-1");
    expect(window.localStorage.getItem("gewehub.workbench.accountId")).toBeNull();
    expect(window.localStorage.getItem("gewehub.workbench.selectedAccountId")).toBeNull();
  });

  it("传入 null 时清除移动端账号选择", () => {
    window.localStorage.setItem("gewehub.mobile.accountId", "account-1");

    storeMobileAccountId(null);

    expect(loadMobileAccountId()).toBeNull();
  });

  it("localStorage 不可用时安全降级", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => {
          throw new Error("storage unavailable");
        }),
        setItem: vi.fn(() => {
          throw new Error("storage unavailable");
        }),
        removeItem: vi.fn(() => {
          throw new Error("storage unavailable");
        }),
      },
    });

    expect(() => storeMobileAccountId("account-1")).not.toThrow();
    expect(() => storeMobileAccountId(null)).not.toThrow();
    expect(loadMobileAccountId()).toBeNull();
  });
});

function installLocalStorageMock() {
  const storage = new Map<string, string>();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    },
  });
}

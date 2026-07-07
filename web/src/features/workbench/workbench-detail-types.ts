export interface BindingDraft {
  appId: string;
  deliveryFilter: "all" | "at_only";
  debounceMs: string;
  maxWaitMs: string;
}

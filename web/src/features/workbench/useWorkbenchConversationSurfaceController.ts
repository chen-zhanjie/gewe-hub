import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  bindWorkbenchConversation,
  unbindWorkbenchConversation,
  updateWorkbenchConversation,
  updateWorkbenchGroupMember,
  useWorkbenchGroupMembersQuery,
  type HubAppSummary,
  type WorkbenchGroupMembersData,
} from "@/features/workbench/queries";
import type { BindingDraft } from "@/features/workbench/workbench-conversation-surface-types";
import {
  asBackendConversation,
  formatNullableNumber,
  parseOptionalNumber,
  readQueryError,
} from "@/features/workbench/workbench-helpers";
import type { BackendMessage, ConversationSummary } from "@/lib/workspace-data";

interface WorkbenchConversationSurfaceControllerOptions {
  selectedConversation?: ConversationSummary;
  apps: HubAppSummary[];
  refreshWorkspace: () => Promise<unknown>;
  refreshGroupMembers: (conversation: ConversationSummary, search?: string) => Promise<WorkbenchGroupMembersData>;
  searchGroupMembers: (conversation: ConversationSummary, search: string) => Promise<WorkbenchGroupMembersData>;
  loadMoreGroupMembers: (conversation: ConversationSummary) => Promise<WorkbenchGroupMembersData | undefined>;
}

export function useWorkbenchConversationSurfaceController({
  selectedConversation,
  apps,
  refreshWorkspace,
  refreshGroupMembers,
  searchGroupMembers,
  loadMoreGroupMembers,
}: WorkbenchConversationSurfaceControllerOptions) {
  const [bindingSaving, setBindingSaving] = useState(false);
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [remarkError, setRemarkError] = useState<string | null>(null);
  const [conversationRemarkDraft, setConversationRemarkDraft] = useState("");
  const [confirmingUnbind, setConfirmingUnbind] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [loadingMoreMembers, setLoadingMoreMembers] = useState(false);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [bindingDraft, setBindingDraft] = useState<BindingDraft>({
    appId: "",
    deliveryFilter: "all",
    debounceMs: "",
    maxWaitMs: "",
  });
  const groupMembersQuery = useWorkbenchGroupMembersQuery(selectedConversation, selectedConversation?.type === "group");

  useEffect(() => {
    const raw = asBackendConversation(selectedConversation?.raw);
    setBindingDraft({
      appId: raw?.app?.id ?? "",
      deliveryFilter: raw?.deliveryFilter ?? "all",
      debounceMs: formatNullableNumber(raw?.debounceMs),
      maxWaitMs: formatNullableNumber(raw?.maxWaitMs),
    });
    setBindingError(null);
    setRemarkError(null);
    setMemberError(null);
    setSavingMemberId(null);
    setConversationRemarkDraft(raw?.platformRemark ?? "");
    setConfirmingUnbind(false);
    setLoadingMoreMembers(false);
    setSearchingMembers(false);
  }, [selectedConversation?.id, selectedConversation?.raw]);

  async function handleSaveBinding() {
    if (!selectedConversation || !bindingDraft.appId || bindingSaving) return;
    setBindingSaving(true);
    setBindingError(null);
    try {
      await bindWorkbenchConversation(selectedConversation.id, {
        appId: bindingDraft.appId,
        deliveryFilter: bindingDraft.deliveryFilter,
        debounceMs: parseOptionalNumber(bindingDraft.debounceMs),
        maxWaitMs: parseOptionalNumber(bindingDraft.maxWaitMs),
      });
      await refreshWorkspace();
    } catch (saveError) {
      setBindingError(saveError instanceof Error ? saveError.message : "保存绑定失败");
    } finally {
      setBindingSaving(false);
    }
  }

  async function handleSaveConversationRemark() {
    if (!selectedConversation || remarkSaving) return;
    setRemarkSaving(true);
    setRemarkError(null);
    try {
      await updateWorkbenchConversation(selectedConversation.id, {
        platformRemark: conversationRemarkDraft.trim() || null,
      });
      await refreshWorkspace();
    } catch (saveError) {
      setRemarkError(saveError instanceof Error ? saveError.message : "保存备注失败");
    } finally {
      setRemarkSaving(false);
    }
  }

  function requestUnbindConversation() {
    if (!selectedConversation || !selectedConversation.raw.app?.id || bindingSaving) return;
    setConfirmingUnbind(true);
  }

  async function confirmUnbindConversation() {
    if (!selectedConversation || !selectedConversation.raw.app?.id || bindingSaving) return;
    setBindingSaving(true);
    setBindingError(null);
    try {
      await unbindWorkbenchConversation(selectedConversation.id);
      await refreshWorkspace();
      toast.success("已解绑应用");
      setConfirmingUnbind(false);
    } catch (unbindError) {
      setBindingError(unbindError instanceof Error ? unbindError.message : "解绑失败");
    } finally {
      setBindingSaving(false);
    }
  }

  async function handleSaveGroupMemberRemark(memberId: string, remark: string) {
    const group = groupMembersQuery.data?.group;
    if (!selectedConversation || !group || savingMemberId) return;
    setSavingMemberId(memberId);
    setMemberError(null);
    try {
      await updateWorkbenchGroupMember(group.id, memberId, {
        platformRemark: remark.trim() || null,
      });
      await refreshGroupMembers(selectedConversation, groupMembersQuery.data?.search ?? "");
    } catch (saveError) {
      setMemberError(saveError instanceof Error ? saveError.message : "保存成员备注失败");
    } finally {
      setSavingMemberId(null);
    }
  }

  async function handleLoadMoreGroupMembers() {
    if (!selectedConversation || loadingMoreMembers || !groupMembersQuery.data?.hasMore) return;
    setLoadingMoreMembers(true);
    setMemberError(null);
    try {
      await loadMoreGroupMembers(selectedConversation);
    } catch (loadError) {
      setMemberError(loadError instanceof Error ? loadError.message : "加载更多群成员失败");
    } finally {
      setLoadingMoreMembers(false);
    }
  }

  async function handleSearchGroupMembers(search: string) {
    if (!selectedConversation || searchingMembers) return;
    setSearchingMembers(true);
    setMemberError(null);
    try {
      await searchGroupMembers(selectedConversation, search);
    } catch (searchError) {
      setMemberError(searchError instanceof Error ? searchError.message : "搜索群成员失败");
    } finally {
      setSearchingMembers(false);
    }
  }

  return {
    apps,
    bindingDraft,
    setBindingDraft,
    bindingSaving,
    bindingError,
    conversationRemarkDraft,
    setConversationRemarkDraft,
    remarkSaving,
    remarkError,
    confirmingUnbind,
    setConfirmingUnbind,
    groupMembersQuery,
    savingMemberId,
    loadingMoreMembers,
    searchingMembers,
    groupMembersError: readQueryError(groupMembersQuery.error) ?? memberError,
    handleSaveConversationRemark,
    handleSaveBinding,
    requestUnbindConversation,
    confirmUnbindConversation,
    handleSaveGroupMemberRemark,
    handleLoadMoreGroupMembers,
    handleSearchGroupMembers,
  };
}

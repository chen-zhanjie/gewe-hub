import type { MessageNode } from "@gewehub/contracts";

export interface AccountSummary {
  id: string;
  name: string;
  wxid: string;
  status: "online" | "offline" | "unknown";
}

export interface ConversationSummary {
  id: string;
  name: string;
  type: "private" | "group";
  lastMessage: string;
  lastAt: string;
  appName?: string;
  unread: number;
  avatarText: string;
  status: "active" | "inactive";
}

export interface MessageItem {
  id: string;
  senderName: string;
  isSelf: boolean;
  sentAt: string;
  status: "normal" | "revoked";
  content: MessageNode;
  standardJson: unknown;
  rawPayload: unknown;
}

export interface HubAppSummary {
  id: string;
  name: string;
  status: "active" | "disabled";
  ownerWxid: string;
  tokenPreview: string;
  boundConversations: number;
  defaultDebounceMs: number;
}

export const accounts: AccountSummary[] = [
  { id: "acc_001", name: "客服主号", wxid: "wxid_gewe_owner", status: "online" },
  { id: "acc_002", name: "测试小号", wxid: "wxid_gewe_test", status: "unknown" }
];

export const conversations: ConversationSummary[] = [
  {
    id: "conv_001",
    name: "产品体验群",
    type: "group",
    lastMessage: "引用消息已经进入标准结构",
    lastAt: "09:42",
    appName: "Hermes 助手",
    unread: 2,
    avatarText: "产",
    status: "active"
  },
  {
    id: "conv_002",
    name: "张三",
    type: "private",
    lastMessage: "图片样本已收到",
    lastAt: "昨天",
    avatarText: "张",
    unread: 0,
    status: "active"
  },
  {
    id: "conv_003",
    name: "外部测试群",
    type: "group",
    lastMessage: "暂无绑定应用",
    lastAt: "07-05",
    avatarText: "测",
    unread: 0,
    status: "inactive"
  }
];

const quoteNode: MessageNode = {
  type: "text",
  text: "昨天的原始 payload 可以保留吗？",
  senderName: "李四"
};

export const messages: MessageItem[] = [
  {
    id: "msg_1001",
    senderName: "李四",
    isSelf: false,
    sentAt: "09:36",
    status: "normal",
    content: {
      type: "text",
      text: "第一版先看标准消息、原始 payload 和投递记录。"
    },
    standardJson: {
      messageId: "msg_1001",
      type: "text",
      renderedText: "第一版先看标准消息、原始 payload 和投递记录。"
    },
    rawPayload: {
      msgType: "TEXT",
      newMsgId: "1001"
    }
  },
  {
    id: "msg_1002",
    senderName: "王五",
    isSelf: false,
    sentAt: "09:40",
    status: "normal",
    content: {
      type: "text",
      text: "可以，引用块也要在工作台里看到。",
      quote: quoteNode
    },
    standardJson: {
      messageId: "msg_1002",
      type: "quote",
      quote: quoteNode
    },
    rawPayload: {
      msgType: "QUOTE",
      referMsgId: "msg_0988"
    }
  },
  {
    id: "msg_1003",
    senderName: "我",
    isSelf: true,
    sentAt: "09:42",
    status: "normal",
    content: {
      type: "chat_record",
      text: "合并转发记录",
      items: [
        { type: "text", text: "第一条摘要", senderName: "张三" },
        { type: "file", text: "[文件] 需求说明.pdf", senderName: "李四", media: { status: "ready", url: null, fileName: "需求说明.pdf" } },
        { type: "unsupported", text: "未知类型", rawType: "APP_MSG:87", senderName: "王五" }
      ]
    },
    standardJson: {
      messageId: "msg_1003",
      type: "chat_record",
      itemCount: 3
    },
    rawPayload: {
      msgType: "CHAT_RECORD",
      newMsgId: "1003"
    }
  },
  {
    id: "msg_1004",
    senderName: "系统",
    isSelf: false,
    sentAt: "09:43",
    status: "revoked",
    content: {
      type: "system",
      text: "王五撤回了一条消息"
    },
    standardJson: {
      messageId: "msg_1004",
      status: "revoked"
    },
    rawPayload: {
      msgType: "REVOKE_MSG",
      newMsgId: "1004"
    }
  }
];

export const hubApps: HubAppSummary[] = [
  {
    id: "app_001",
    name: "Hermes 助手",
    status: "active",
    ownerWxid: "wxid_gewe_owner",
    tokenPreview: "hub_live_8f2e••••b91c",
    boundConversations: 12,
    defaultDebounceMs: 2000
  },
  {
    id: "app_002",
    name: "客服审计",
    status: "disabled",
    ownerWxid: "wxid_audit_owner",
    tokenPreview: "hub_live_a14d••••02bf",
    boundConversations: 3,
    defaultDebounceMs: 0
  }
];

export const deliveryRows = [
  {
    id: "del_msg_1001_app_001",
    app: "Hermes 助手",
    conversation: "产品体验群",
    status: "delivered",
    attempts: 1,
    updatedAt: "09:42"
  },
  {
    id: "del_msg_1002_app_001",
    app: "Hermes 助手",
    conversation: "产品体验群",
    status: "queued",
    attempts: 0,
    updatedAt: "09:43"
  },
  {
    id: "del_msg_0977_app_002",
    app: "客服审计",
    conversation: "张三",
    status: "failed",
    attempts: 5,
    updatedAt: "昨天"
  }
];

export const sendRows = [
  {
    id: "send_001",
    conversation: "产品体验群",
    type: "text",
    status: "sent",
    resultMsgId: "msg_1003",
    updatedAt: "09:42"
  },
  {
    id: "send_002",
    conversation: "张三",
    type: "image",
    status: "pending",
    resultMsgId: "",
    updatedAt: "09:44"
  }
];

export const failedTasks = [
  {
    id: "task_901",
    type: "deliver",
    ref: "del_msg_0977_app_002",
    status: "dead",
    error: "下游 SSE 已断开"
  },
  {
    id: "task_902",
    type: "download_media",
    ref: "msg_0888",
    status: "failed",
    error: "媒体下载超时"
  }
];

export interface MentionCandidate {
  wxid: string;
  label: string;
}

export interface MentionToken {
  id: string;
  wxid: string;
  label: string;
  start: number;
  end: number;
  markerIndex: number;
}

export interface MentionDraft {
  text: string;
  selectionStart: number;
  tokens: MentionToken[];
}

export function createMentionDraft(text = "", selectionStart = text.length): MentionDraft {
  return { text, selectionStart: clampSelection(selectionStart, text), tokens: [] };
}

export function getActiveMentionQuery(draft: MentionDraft): { start: number; query: string } | null {
  const beforeCaret = draft.text.slice(0, draft.selectionStart);
  const start = beforeCaret.lastIndexOf("@");
  if (start < 0) return null;
  const query = beforeCaret.slice(start + 1);
  if (/\s/.test(query) || (start > 0 && !/\s/.test(beforeCaret[start - 1] ?? ""))) return null;
  return { start, query };
}

export function insertMention(draft: MentionDraft, member: MentionCandidate, selectionStart = draft.selectionStart): MentionDraft {
  const normalizedDraft = { ...draft, selectionStart: clampSelection(selectionStart, draft.text) };
  const activeQuery = getActiveMentionQuery(normalizedDraft);
  if (!activeQuery) return normalizedDraft;

  const replacement = `@${member.label} `;
  const text = `${draft.text.slice(0, activeQuery.start)}${replacement}${draft.text.slice(normalizedDraft.selectionStart)}`;
  const insertionEnd = activeQuery.start + replacement.length;
  const removedLength = normalizedDraft.selectionStart - activeQuery.start;
  const delta = replacement.length - removedLength;
  const token: MentionToken = {
    id: `${member.wxid}:${activeQuery.start}:${replacement.length}`,
    wxid: member.wxid,
    label: member.label,
    start: activeQuery.start,
    end: activeQuery.start + replacement.length - 1,
    markerIndex: activeQuery.start + replacement.length - 1,
  };

  return {
    text,
    selectionStart: insertionEnd,
    tokens: [
      ...rebaseTokens(draft.tokens, normalizedDraft.selectionStart, normalizedDraft.selectionStart, delta),
      token,
    ].sort((left, right) => left.start - right.start),
  };
}

export function applyMentionTextChange(previous: MentionDraft, text: string, selectionStart: number): MentionDraft {
  if (text === previous.text) return { ...previous, selectionStart: clampSelection(selectionStart, text) };
  const change = findTextChange(previous.text, text);
  const delta = change.insertedLength - change.removedLength;
  const tokens = previous.tokens.flatMap((token) => {
    if (change.end <= token.start) return [shiftToken(token, delta)];
    if (change.start > token.markerIndex) return [token];
    return [];
  });
  return { text, selectionStart: clampSelection(selectionStart, text), tokens };
}

export function getEffectiveMentionWxids(draft: MentionDraft): string[] {
  return [...new Set(draft.tokens.filter((token) => draft.text[token.markerIndex] === " ").map((token) => token.wxid))];
}

function findTextChange(previous: string, next: string) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start += 1;

  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (previousEnd > start && nextEnd > start && previous[previousEnd - 1] === next[nextEnd - 1]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return { start, end: previousEnd, removedLength: previousEnd - start, insertedLength: nextEnd - start };
}

function rebaseTokens(tokens: MentionToken[], changeStart: number, changeEnd: number, delta: number): MentionToken[] {
  return tokens.flatMap((token) => {
    if (changeEnd <= token.start) return [shiftToken(token, delta)];
    if (changeStart > token.markerIndex) return [token];
    return [];
  });
}

function shiftToken(token: MentionToken, delta: number): MentionToken {
  return { ...token, start: token.start + delta, end: token.end + delta, markerIndex: token.markerIndex + delta };
}

function clampSelection(selectionStart: number, text: string): number {
  return Math.max(0, Math.min(selectionStart, text.length));
}

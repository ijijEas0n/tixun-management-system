import { SportEventKey } from '../types';

export type EntryDraftInputs = Record<string, Record<string, string[]>>;
export type EntryDraftComments = Record<string, Record<string, string>>;

export const ENTRY_DRAFTS_STORAGE_KEY = 'testing_group_entry_drafts';
export const ENTRY_DRAFT_COMMENTS_STORAGE_KEY = 'testing_group_entry_comments';

export function getEntryDraftKey(sessionId: string, event: SportEventKey, versionId: string) {
  return `${sessionId}:${event}:${versionId}`;
}

export function safeParseEntryDrafts(saved: string | null): EntryDraftInputs {
  if (!saved) return {};
  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? parsed as EntryDraftInputs : {};
  } catch {
    return {};
  }
}

export function removeEntryDraftsForSessions(
  drafts: EntryDraftInputs,
  sessionIds: string[],
): EntryDraftInputs {
  const removedSessionIds = new Set(sessionIds);
  if (removedSessionIds.size === 0) return drafts;

  return Object.fromEntries(
    Object.entries(drafts).filter(([key]) => {
      const [sessionId] = key.split(':');
      return !removedSessionIds.has(sessionId);
    }),
  );
}

export function safeParseEntryDraftComments(saved: string | null): EntryDraftComments {
  if (!saved) return {};
  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? parsed as EntryDraftComments : {};
  } catch {
    return {};
  }
}

export function removeEntryDraftCommentsForSessions(
  comments: EntryDraftComments,
  sessionIds: string[],
): EntryDraftComments {
  const removedSessionIds = new Set(sessionIds);
  if (removedSessionIds.size === 0) return comments;

  return Object.fromEntries(
    Object.entries(comments).filter(([key]) => {
      const [sessionId] = key.split(':');
      return !removedSessionIds.has(sessionId);
    }),
  );
}

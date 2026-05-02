import {
  ENTRY_DRAFTS_STORAGE_KEY,
  ENTRY_DRAFT_COMMENTS_STORAGE_KEY,
  EntryDraftComments,
  EntryDraftInputs,
} from './entryDrafts';

export const SCORE_SYNC_HISTORY_KEY = 'testing_group_score_sync_history';
export const ENTRY_VERSION_SELECTIONS_KEY = 'testing_group_entry_version_selections';

interface CleanupAuxiliaryDataOptions {
  removedStudentIds?: string[];
  removedSessionIds?: string[];
  removedVersionIds?: string[];
}

type JsonRecord = Record<string, unknown>;

function safeParseRecord(saved: string | null): JsonRecord {
  if (!saved) return {};
  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function safeParseArray(saved: string | null): unknown[] {
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getKeyParts(key: string) {
  const [sessionId, event, versionId] = key.split(':');
  return { sessionId, event, versionId };
}

function cleanNestedStudentRecord<T extends Record<string, unknown>>(
  value: T,
  removedStudentIds: Set<string>,
): T {
  if (removedStudentIds.size === 0) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([studentId]) => !removedStudentIds.has(studentId)),
  ) as T;
}

function cleanupDraftRecord<T extends EntryDraftInputs | EntryDraftComments>(
  saved: string | null,
  options: Required<CleanupAuxiliaryDataOptions>,
): T {
  const removedSessionIds = new Set(options.removedSessionIds);
  const removedVersionIds = new Set(options.removedVersionIds);
  const removedStudentIds = new Set(options.removedStudentIds);
  const parsed = safeParseRecord(saved);

  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, value]) => {
      const { sessionId, versionId } = getKeyParts(key);
      if (removedSessionIds.has(sessionId) || removedVersionIds.has(versionId)) return [];
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const cleaned = cleanNestedStudentRecord(value as Record<string, unknown>, removedStudentIds);
      return Object.keys(cleaned).length > 0 ? [[key, cleaned]] : [];
    }),
  ) as T;
}

function cleanupSyncHistory(saved: string | null, options: Required<CleanupAuxiliaryDataOptions>) {
  const removedSessionIds = new Set(options.removedSessionIds);
  const removedVersionIds = new Set(options.removedVersionIds);
  const removedStudentIds = new Set(options.removedStudentIds);

  return safeParseArray(saved).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const sessionId = String(record.sessionId || '');
    const versionId = String(record.versionId || '');
    if (removedSessionIds.has(sessionId) || removedVersionIds.has(versionId)) return [];

    if (Array.isArray(record.snapshots) && removedStudentIds.size > 0) {
      const snapshots = record.snapshots.filter(snapshot => (
        !snapshot ||
        typeof snapshot !== 'object' ||
        !removedStudentIds.has(String((snapshot as Record<string, unknown>).studentId || ''))
      ));
      if (snapshots.length === 0) return [];
      return [{ ...record, snapshots }];
    }
    return [record];
  });
}

function cleanupEntryVersionSelections(saved: string | null, options: Required<CleanupAuxiliaryDataOptions>) {
  const removedSessionIds = new Set(options.removedSessionIds);
  const removedVersionIds = new Set(options.removedVersionIds);
  const parsed = safeParseRecord(saved);

  return Object.fromEntries(
    Object.entries(parsed).filter(([key, value]) => {
      const { sessionId } = getKeyParts(key);
      return !removedSessionIds.has(sessionId) && !removedVersionIds.has(String(value || ''));
    }),
  );
}

function clearLegacyEntryDrafts(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (key === 'draft_test_date' || key === 'draft_active_item' || key.startsWith('draft_entry_inputs_'))) {
      keys.push(key);
    }
  }
  keys.forEach(key => storage.removeItem(key));
}

export function cleanupAuxiliaryData(
  options: CleanupAuxiliaryDataOptions,
  storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): void {
  if (!storage) return;
  const normalizedOptions: Required<CleanupAuxiliaryDataOptions> = {
    removedStudentIds: options.removedStudentIds || [],
    removedSessionIds: options.removedSessionIds || [],
    removedVersionIds: options.removedVersionIds || [],
  };

  storage.setItem(
    ENTRY_DRAFTS_STORAGE_KEY,
    JSON.stringify(cleanupDraftRecord(storage.getItem(ENTRY_DRAFTS_STORAGE_KEY), normalizedOptions)),
  );
  storage.setItem(
    ENTRY_DRAFT_COMMENTS_STORAGE_KEY,
    JSON.stringify(cleanupDraftRecord(storage.getItem(ENTRY_DRAFT_COMMENTS_STORAGE_KEY), normalizedOptions)),
  );
  storage.setItem(
    SCORE_SYNC_HISTORY_KEY,
    JSON.stringify(cleanupSyncHistory(storage.getItem(SCORE_SYNC_HISTORY_KEY), normalizedOptions)),
  );
  storage.setItem(
    ENTRY_VERSION_SELECTIONS_KEY,
    JSON.stringify(cleanupEntryVersionSelections(storage.getItem(ENTRY_VERSION_SELECTIONS_KEY), normalizedOptions)),
  );
  clearLegacyEntryDrafts(storage);
}


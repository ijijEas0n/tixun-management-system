import assert from 'node:assert/strict';
import {
  cleanupAuxiliaryData,
  SCORE_SYNC_HISTORY_KEY,
  ENTRY_VERSION_SELECTIONS_KEY,
} from './auxiliaryStorage';
import {
  ENTRY_DRAFTS_STORAGE_KEY,
  ENTRY_DRAFT_COMMENTS_STORAGE_KEY,
} from './entryDrafts';

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

const storage = createMemoryStorage({
  [ENTRY_DRAFTS_STORAGE_KEY]: JSON.stringify({
    'session-remove:hundred:version-remove': { s1: ['12.2'], s2: ['13.1'] },
    'session-keep:hundred:version-keep': { s1: ['12.8'], s3: ['13.5'] },
  }),
  [ENTRY_DRAFT_COMMENTS_STORAGE_KEY]: JSON.stringify({
    'session-remove:hundred:version-remove': { s1: '删除' },
    'session-keep:hundred:version-keep': { s1: '删除学生', s3: '保留学生' },
  }),
  [SCORE_SYNC_HISTORY_KEY]: JSON.stringify([
    { id: 'h1', sessionId: 'session-remove', versionId: 'version-remove', snapshots: [{ studentId: 's1' }] },
    { id: 'h2', sessionId: 'session-keep', versionId: 'version-keep', snapshots: [{ studentId: 's1' }, { studentId: 's3' }] },
  ]),
  [ENTRY_VERSION_SELECTIONS_KEY]: JSON.stringify({
    'session-remove:hundred': 'version-remove',
    'session-keep:hundred': 'version-keep',
  }),
  draft_test_date: '2026-05-02',
  draft_active_item: 'hundred',
  draft_entry_inputs_2026: JSON.stringify({ hundred: { s1: ['12.2'] } }),
});

cleanupAuxiliaryData({
  removedStudentIds: ['s1'],
  removedSessionIds: ['session-remove'],
  removedVersionIds: ['version-remove'],
}, storage);

assert.deepEqual(
  JSON.parse(storage.getItem(ENTRY_DRAFTS_STORAGE_KEY) || '{}'),
  { 'session-keep:hundred:version-keep': { s3: ['13.5'] } },
  'cleanup removes deleted sessions, versions, and students from entry drafts',
);
assert.deepEqual(
  JSON.parse(storage.getItem(ENTRY_DRAFT_COMMENTS_STORAGE_KEY) || '{}'),
  { 'session-keep:hundred:version-keep': { s3: '保留学生' } },
  'cleanup removes deleted sessions, versions, and students from draft comments',
);
assert.deepEqual(
  JSON.parse(storage.getItem(SCORE_SYNC_HISTORY_KEY) || '[]'),
  [{ id: 'h2', sessionId: 'session-keep', versionId: 'version-keep', snapshots: [{ studentId: 's3' }] }],
  'cleanup removes deleted sync history and prunes deleted students from remaining snapshots',
);
assert.deepEqual(
  JSON.parse(storage.getItem(ENTRY_VERSION_SELECTIONS_KEY) || '{}'),
  { 'session-keep:hundred': 'version-keep' },
  'cleanup removes stale entry version selections',
);
assert.equal(storage.getItem('draft_test_date'), null, 'cleanup clears legacy draft metadata');
assert.equal(storage.getItem('draft_active_item'), null, 'cleanup clears legacy active item');
assert.equal(storage.getItem('draft_entry_inputs_2026'), null, 'cleanup clears legacy draft inputs');

const brokenStorage = createMemoryStorage({
  [ENTRY_DRAFTS_STORAGE_KEY]: '{broken',
  [ENTRY_DRAFT_COMMENTS_STORAGE_KEY]: '{broken',
  [SCORE_SYNC_HISTORY_KEY]: '{broken',
  [ENTRY_VERSION_SELECTIONS_KEY]: '{broken',
});
cleanupAuxiliaryData({ removedSessionIds: ['any'] }, brokenStorage);
assert.equal(brokenStorage.getItem(ENTRY_DRAFTS_STORAGE_KEY), '{}', 'broken draft json is repaired to an empty object');


import assert from 'node:assert/strict';
import {
  ENTRY_DRAFT_COMMENTS_STORAGE_KEY,
  ENTRY_DRAFTS_STORAGE_KEY,
  getEntryDraftKey,
  removeEntryDraftCommentsForSessions,
  removeEntryDraftsForSessions,
  safeParseEntryDraftComments,
  safeParseEntryDrafts,
} from './entryDrafts';

assert.equal(
  getEntryDraftKey('session-1', 'hundred', 'version-1'),
  'session-1:hundred:version-1',
  'draft keys include session, event, and version',
);

const drafts = {
  [getEntryDraftKey('session-1', 'hundred', 'version-1')]: { s1: ['12.3'] },
  [getEntryDraftKey('session-2', 'hundred', 'version-1')]: { s2: ['13.1'] },
};

assert.deepEqual(
  removeEntryDraftsForSessions(drafts, ['session-1']),
  {
    [getEntryDraftKey('session-2', 'hundred', 'version-1')]: { s2: ['13.1'] },
  },
  'clearing one imported or removed session preserves unrelated drafts',
);

const comments = {
  [getEntryDraftKey('session-1', 'hundred', 'version-1')]: { s1: '起跑慢' },
  [getEntryDraftKey('session-2', 'hundred', 'version-1')]: { s2: '摆臂好' },
};

assert.deepEqual(
  removeEntryDraftCommentsForSessions(comments, ['session-1']),
  {
    [getEntryDraftKey('session-2', 'hundred', 'version-1')]: { s2: '摆臂好' },
  },
  'clearing one imported or removed session preserves unrelated draft comments',
);

assert.deepEqual(
  safeParseEntryDrafts('{bad json'),
  {},
  'bad draft storage falls back to empty drafts',
);

assert.deepEqual(
  safeParseEntryDraftComments('{bad json'),
  {},
  'bad draft comment storage falls back to empty comments',
);

assert.equal(
  ENTRY_DRAFTS_STORAGE_KEY,
  'testing_group_entry_drafts',
  'draft storage key remains stable for existing users',
);

assert.equal(
  ENTRY_DRAFT_COMMENTS_STORAGE_KEY,
  'testing_group_entry_comments',
  'draft comment storage key remains stable',
);

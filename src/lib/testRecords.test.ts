import assert from 'node:assert/strict';
import { Student, TestRecord, TestSession } from '../types';
import {
  buildRankTestOptions,
  getRecordTestKey,
  isSameRecordTarget,
} from './testRecords';

const records: TestRecord[] = [
  {
    id: 'r1',
    date: '2026-04-30',
    testSessionId: 'session-a',
    testName: '上午测试',
    scores: { hundred: null, shotPut: null, tripleJump: null, eightHundred: null },
    points: { hundred: 0, shotPut: 0, tripleJump: 0, eightHundred: 0, total: 70 },
  },
  {
    id: 'r2',
    date: '2026-04-30',
    testSessionId: 'session-b',
    testName: '下午测试',
    scores: { hundred: null, shotPut: null, tripleJump: null, eightHundred: null },
    points: { hundred: 0, shotPut: 0, tripleJump: 0, eightHundred: 0, total: 80 },
  },
  {
    id: 'legacy',
    date: '2026-04-29',
    scores: { hundred: null, shotPut: null, tripleJump: null, eightHundred: null },
    points: { hundred: 0, shotPut: 0, tripleJump: 0, eightHundred: 0, total: 60 },
  },
];

const sessions: TestSession[] = [
  {
    id: 'session-a',
    name: '正式测试 A',
    date: '2026-04-30',
    yearId: 'y1',
    activeVersionIds: {},
    entryVersionIds: {},
    groupingVersions: { hundred: [], shotPut: [], tripleJump: [], eightHundred: [] },
    trialConfigs: { hundred: 3, shotPut: 3, tripleJump: 3, eightHundred: 1 },
    groupScheduleConfigs: {},
  },
  {
    id: 'session-b',
    name: '正式测试 B',
    date: '2026-04-30',
    yearId: 'y1',
    activeVersionIds: {},
    entryVersionIds: {},
    groupingVersions: { hundred: [], shotPut: [], tripleJump: [], eightHundred: [] },
    trialConfigs: { hundred: 3, shotPut: 3, tripleJump: 3, eightHundred: 1 },
    groupScheduleConfigs: {},
  },
];

const students: Student[] = [
  { id: 's1', studentNo: '25001', name: '学生一', gender: 'male', yearId: 'y1' },
];

assert.equal(getRecordTestKey(records[0]), 'session:session-a', 'session records use session key');
assert.equal(getRecordTestKey(records[2]), 'date:2026-04-29', 'legacy records fall back to date key');
assert.equal(
  isSameRecordTarget(records[0], { date: '2026-04-30', testSessionId: 'session-a' }),
  true,
  'same session target matches existing record',
);
assert.equal(
  isSameRecordTarget(records[0], { date: '2026-04-30', testSessionId: 'session-b' }),
  false,
  'same date but different session does not overwrite existing record',
);

assert.deepEqual(
  buildRankTestOptions({ s1: records }, students, sessions).map(option => ({
    key: option.key,
    label: option.label,
    count: option.count,
  })),
  [
    { key: 'session:session-a', label: '正式测试 A · 2026-04-30', count: 1 },
    { key: 'session:session-b', label: '正式测试 B · 2026-04-30', count: 1 },
    { key: 'date:2026-04-29', label: '2026-04-29 测试', count: 1 },
  ],
  'rankings list same-day sessions separately by test name and date',
);

import assert from 'node:assert/strict';
import {
  applyScoreSyncUndoSnapshots,
  buildScoreSyncUpdates,
  buildScoreSyncUndoSnapshots,
} from './scoreSync';
import { Student, TestRecord, TestSessionGroup } from '../types';

const students: Student[] = [
  { id: 's1', studentNo: '25001', name: '学生一', gender: 'male', yearId: 'y1' },
  { id: 's2', studentNo: '25002', name: '学生二', gender: 'male', yearId: 'y1' },
  { id: 's3', studentNo: '25003', name: '学生三', gender: 'female', yearId: 'y1' },
];

const groups: TestSessionGroup[] = [
  {
    id: 'g1',
    name: '男生第1组',
    gender: 'male',
    members: [{ studentId: 's1', lane: 1 }, { studentId: 's2', lane: 2 }],
  },
  {
    id: 'g2',
    name: '女生第1组',
    gender: 'female',
    members: [{ studentId: 's3', lane: 1 }],
  },
];

const target = {
  date: '2026-04-30',
  testSessionId: 'session-1',
  testName: '测试1',
};

const updates = buildScoreSyncUpdates({
  groups,
  event: 'hundred',
  trialCount: 3,
  target,
  draft: {
    s1: ['12.2', '12.0', ''],
    s2: ['', '', ''],
    s3: ['13.1', '13.4', '13.2'],
  },
});

assert.deepEqual(
  updates.map(update => ({
    studentId: update.studentId,
    groupName: update.groupName,
    best: update.scores.hundred,
    attempts: update.scores.hundredAttempts,
  })),
  [
    { studentId: 's1', groupName: '男生第1组', best: 12, attempts: [12.2, 12, null] },
    { studentId: 's3', groupName: '女生第1组', best: 13.1, attempts: [13.1, 13.4, 13.2] },
  ],
  'sync all groups creates updates only for students with valid scores',
);

const existingRecords: Record<string, TestRecord[]> = {
  s1: [{
    id: 'r1',
    date: target.date,
    testSessionId: target.testSessionId,
    testName: target.testName,
    scores: {
      hundred: 12.5,
      hundredAttempts: [12.5, null, null],
      shotPut: 9,
      tripleJump: null,
      eightHundred: null,
    },
    points: { hundred: 5, shotPut: 5, tripleJump: 0, eightHundred: 0, total: 10 },
  }],
  s3: [{
    id: 'r3',
    date: target.date,
    testSessionId: target.testSessionId,
    testName: target.testName,
    scores: {
      hundred: 13.1,
      hundredAttempts: [13.1, 13.4, 13.2],
      shotPut: null,
      tripleJump: null,
      eightHundred: null,
    },
    points: { hundred: 4, shotPut: 0, tripleJump: 0, eightHundred: 0, total: 4 },
  }],
};

const snapshots = buildScoreSyncUndoSnapshots({
  records: existingRecords,
  target,
  event: 'hundred',
  updates,
});

assert.deepEqual(
  snapshots.map(snapshot => ({
    studentId: snapshot.studentId,
    hadRecord: snapshot.hadRecord,
    previousValue: snapshot.previousValue,
    previousAttempts: snapshot.previousAttempts,
  })),
  [
    { studentId: 's1', hadRecord: true, previousValue: 12.5, previousAttempts: [12.5, null, null] },
    { studentId: 's3', hadRecord: true, previousValue: 13.1, previousAttempts: [13.1, 13.4, 13.2] },
  ],
  'undo snapshots capture previous values before sync',
);

const changedRecords: Record<string, TestRecord[]> = {
  s1: [{
    ...existingRecords.s1[0],
    scores: {
      ...existingRecords.s1[0].scores,
      hundred: 12,
      hundredAttempts: [12.2, 12, null],
    },
  }],
  s2: [],
  s3: [{
    ...existingRecords.s3[0],
    scores: {
      ...existingRecords.s3[0].scores,
      hundred: 13,
      hundredAttempts: [13, null, null],
    },
  }],
};

const restoredRecords = applyScoreSyncUndoSnapshots({
  records: changedRecords,
  students,
  target,
  event: 'hundred',
  snapshots: [snapshots[0]],
});

assert.equal(
  restoredRecords.s1[0].scores.hundred,
  12.5,
  'partial undo restores only the selected student score',
);
assert.equal(
  restoredRecords.s3[0].scores.hundred,
  13,
  'partial undo leaves unselected synced students unchanged',
);
assert.equal(
  restoredRecords.s1[0].scores.shotPut,
  9,
  'partial undo preserves other event scores in the same record',
);

const newlyCreatedRecords: Record<string, TestRecord[]> = {
  s2: [{
    id: 'new',
    date: target.date,
    testSessionId: target.testSessionId,
    testName: target.testName,
    scores: {
      hundred: 12.8,
      hundredAttempts: [12.8, null, null],
      shotPut: null,
      tripleJump: null,
      eightHundred: null,
    },
    points: { hundred: 4, shotPut: 0, tripleJump: 0, eightHundred: 0, total: 4 },
  }],
};

const emptiedRecords = applyScoreSyncUndoSnapshots({
  records: newlyCreatedRecords,
  students,
  target,
  event: 'hundred',
  snapshots: [{
    studentId: 's2',
    groupId: 'g1',
    groupName: '男生第1组',
    hadRecord: false,
    previousValue: null,
  }],
});

assert.deepEqual(emptiedRecords.s2, [], 'undo removes a record that was created only by the sync');

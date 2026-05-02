import assert from 'node:assert/strict';
import { AppData } from '../types';
import { createEmptyGroupingVersions, createDefaultTrialConfigs } from './grouping';
import { repairAppData, validateAppData } from './dataIntegrity';

const data: AppData = {
  years: [{ id: 'y1', name: '2026' }],
  students: [
    { id: 's1', studentNo: '26001', name: '学生一', gender: 'male', yearId: 'y1' },
    { id: 's1', studentNo: '26001', name: '重复学生', gender: 'female', yearId: 'y1' },
    { id: 's2', studentNo: '26001', name: '学生二', gender: 'bad' as never, yearId: 'y1' },
  ],
  records: {
    s1: [
      {
        id: 'r1',
        date: '2026-05-02',
        testSessionId: 't1',
        scores: { hundred: 12, shotPut: -1, tripleJump: null, eightHundred: null },
        points: { hundred: 0, shotPut: 10, tripleJump: 0, eightHundred: 0, total: 10 },
      },
      {
        id: 'r2',
        date: '2026-05-02',
        testSessionId: 'missing-session',
        scores: { hundred: 13, shotPut: null, tripleJump: null, eightHundred: null },
        points: { hundred: 1, shotPut: 0, tripleJump: 0, eightHundred: 0, total: 1 },
      },
    ],
    missingStudent: [{
      id: 'orphan',
      date: '2026-05-02',
      scores: { hundred: 12, shotPut: null, tripleJump: null, eightHundred: null },
      points: { hundred: 1, shotPut: 0, tripleJump: 0, eightHundred: 0, total: 1 },
    }],
  },
  testSessions: [{
    id: 't1',
    name: '测试',
    date: '2026-05-02',
    yearId: 'y1',
    absentStudentIds: ['s1', 'missingStudent'],
    activeVersionIds: { hundred: 'missing-version' },
    entryVersionIds: { hundred: 'v1' },
    groupingVersions: {
      ...createEmptyGroupingVersions(),
      hundred: [{
        id: 'v1',
        name: '版本 1',
        event: 'hundred',
        createdAt: '2026-05-02T08:00:00.000Z',
        source: 'generated',
        mode: 'size',
        groups: [{
          id: 'g1',
          name: '第一组',
          gender: 'male',
          members: [{ studentId: 's1' }, { studentId: 'missingStudent' }],
        }],
      }],
    },
    trialConfigs: createDefaultTrialConfigs(),
    groupScheduleConfigs: {},
  }],
};

const report = validateAppData(data);
assert.ok(report.issues.some(issue => issue.code === 'DUPLICATE_STUDENT_ID'), 'validator reports duplicate student ids');
assert.ok(report.issues.some(issue => issue.code === 'ORPHAN_RECORD_STUDENT'), 'validator reports orphan record owners');
assert.ok(report.issues.some(issue => issue.code === 'ORPHAN_RECORD_SESSION'), 'validator reports orphan test sessions');
assert.ok(report.issues.some(issue => issue.code === 'DUPLICATE_STUDENT_NO'), 'validator reports duplicate student numbers');
assert.ok(report.issues.some(issue => issue.code === 'INVALID_GENDER'), 'validator reports invalid gender');
assert.ok(report.issues.some(issue => issue.code === 'INVALID_SCORE'), 'validator reports invalid raw scores');
assert.ok(report.issues.some(issue => issue.code === 'POINTS_MISMATCH'), 'validator reports stale points');

const repaired = repairAppData(data);
assert.deepEqual(repaired.students.map(student => student.id), ['s1', 's2'], 'repair removes duplicate student ids');
assert.equal(repaired.students.find(student => student.id === 's2')?.gender, 'male', 'repair normalizes invalid gender');
assert.equal(repaired.students[1].studentNo !== repaired.students[0].studentNo, true, 'repair resolves duplicate student numbers');
assert.equal(repaired.records.missingStudent, undefined, 'repair removes records for missing students');
assert.equal(repaired.records.s1.some(record => record.testSessionId === 'missing-session'), false, 'repair removes records for missing sessions');
assert.equal(repaired.records.s1[0].scores.shotPut, null, 'repair nulls invalid scores');
assert.equal(repaired.records.s1[0].points.total, repaired.records.s1[0].points.hundred, 'repair recalculates points from scores and gender');
assert.deepEqual(repaired.testSessions[0].absentStudentIds, ['s1'], 'repair removes missing absent student ids');
assert.deepEqual(repaired.testSessions[0].activeVersionIds, {}, 'repair removes active version ids that do not exist');
assert.deepEqual(repaired.testSessions[0].groupingVersions.hundred[0].groups[0].members, [{ studentId: 's1' }], 'repair removes missing group members');


import assert from 'node:assert/strict';
import {
  mergePrearrangedImportWithYearData,
  parsePrearrangedWorkbook,
  replaceYearDataWithPrearrangedImport,
} from './prearrangedImport';
import { AppData } from '../types';

const importResult = parsePrearrangedWorkbook({
  百米测试: [
    ['时间', '道次', '姓名', '序号', '成绩'],
    ['10:00', '一道', '甘振豪', '29', ''],
    ['', '二道', '范泽涵', '47', ''],
    ['时间', '道次', '姓名', '序号', '成绩'],
    ['10:02', '一道', '黄靖昌', '55', ''],
    ['', '二道', '叶子超', '1', ''],
  ],
  三级跳测试: [
    ['时间', '道次', '顺序', '姓名', '序号', '第一跳', '第二跳', '第三跳'],
    ['15:30', '第一道', '1', '甘振豪', '29', '', '', ''],
    ['', '', '2', '范泽涵', '47', '', '', ''],
  ],
  铅球测试: [
    ['时间', '投掷区', '顺序', '姓名', '序号', '第一投', '第二投', '第三投'],
    ['16:30', '二区', '1', '黄靖昌', '55', '', '', ''],
  ],
  '800': [
    ['时间', '顺序', '姓名', '序号', '成绩', '排名'],
    ['8:30', '1', '甘振豪', '29', '', '3'],
    ['', '2', '叶子超', '1', '', '4'],
  ],
}, {
  fileName: '2026.5.1四项测试.xlsx',
  yearId: 'y1',
  now: '2026-04-30T08:00:00.000Z',
});

assert.equal(importResult.testSession.name, '2026.5.1四项测试', 'session name comes from file name');
assert.equal(importResult.testSession.date, '2026-05-01', 'session date comes from file name');
assert.equal(importResult.students.length, 4, 'students are deduplicated across sheets');
assert.deepEqual(
  importResult.students.map(student => [student.studentNo, student.name, student.gender]),
  [
    ['1', '叶子超', 'male'],
    ['29', '甘振豪', 'male'],
    ['47', '范泽涵', 'male'],
    ['55', '黄靖昌', 'male'],
  ],
  'students are imported with table numbers and a safe default gender',
);

const hundredVersion = importResult.testSession.groupingVersions.hundred[0];
assert.equal(hundredVersion.groups.length, 2, '100m repeated headers become separate groups');
assert.equal(hundredVersion.groups[0].startTime, '10:00', '100m group keeps its start time');
assert.deepEqual(
  hundredVersion.groups[0].members.map(member => [member.lane, member.order]),
  [[1, 1], [2, 2]],
  '100m members keep lane and order',
);
assert.equal(
  importResult.testSession.entryVersionIds.hundred,
  hundredVersion.id,
  'imported grouping is confirmed for entry',
);

const tripleGroup = importResult.testSession.groupingVersions.tripleJump[0].groups[0];
assert.equal(tripleGroup.marker, '第一道', 'field event group keeps its area marker');
assert.equal(tripleGroup.startTime, '15:30', 'field event group keeps its start time');
assert.deepEqual(
  tripleGroup.members.map(member => member.order),
  [1, 2],
  'field event members keep test order',
);

const eightGroup = importResult.testSession.groupingVersions.eightHundred[0].groups[0];
assert.equal(eightGroup.gender, 'mixed', '800m imported groups stay mixed');
assert.deepEqual(
  eightGroup.members.map(member => [member.order, member.rank]),
  [[1, 3], [2, 4]],
  '800m members keep order and ranking when a ranking column exists',
);

assert.equal(importResult.summary.eventSummaries.hundred.groups, 2, 'summary counts groups');
assert.equal(importResult.summary.eventSummaries.hundred.students, 4, 'summary counts event students');

const oldData: AppData = {
  years: [{ id: 'y1', name: '2025' }, { id: 'y2', name: '2026' }],
  students: [
    { id: 'old-y1', studentNo: 'old', name: '旧学生', gender: 'male', yearId: 'y1' },
    { id: 'keep-y2', studentNo: 'keep', name: '保留学生', gender: 'female', yearId: 'y2' },
  ],
  records: {
    'old-y1': [{
      id: 'r1',
      date: '2026-04-01',
      scores: { hundred: 12, shotPut: null, tripleJump: null, eightHundred: null },
      points: { hundred: 1, shotPut: 0, tripleJump: 0, eightHundred: 0, total: 1 },
    }],
    'keep-y2': [],
  },
  testSessions: [{
    id: 'old-session',
    name: '旧测试',
    date: '2026-04-01',
    yearId: 'y1',
    activeVersionIds: {},
    entryVersionIds: {},
    groupingVersions: { hundred: [], shotPut: [], tripleJump: [], eightHundred: [] },
    trialConfigs: { hundred: 3, shotPut: 3, tripleJump: 3, eightHundred: 1 },
    groupScheduleConfigs: {},
  }],
};

const replaced = replaceYearDataWithPrearrangedImport(oldData, 'y1', importResult);
assert.equal(replaced.students.some(student => student.id === 'old-y1'), false, 'old current-year students are cleared');
assert.equal(replaced.records['old-y1'], undefined, 'old current-year records are cleared');
assert.equal(replaced.testSessions.some(session => session.id === 'old-session'), false, 'old current-year sessions are cleared');
assert.equal(replaced.students.some(student => student.id === 'keep-y2'), true, 'other years are preserved');
assert.equal(replaced.testSessions.length, 1, 'import creates one new test session');

const existingStudentId = importResult.students.find(student => student.name === '甘振豪')!.id;
const existingLinkedData: AppData = {
  ...oldData,
  students: [
    { id: 'existing-gan', studentNo: '29', name: '甘振豪', gender: 'male', yearId: 'y1' },
    { id: 'keep-y2', studentNo: 'keep', name: '保留学生', gender: 'female', yearId: 'y2' },
  ],
};
const merged = mergePrearrangedImportWithYearData(existingLinkedData, 'y1', importResult, 'appendMissing');
assert.equal(merged.students.some(student => student.id === 'existing-gan'), true, 'default import keeps existing matching students');
assert.equal(
  merged.students.filter(student => student.yearId === 'y1' && student.name === '甘振豪').length,
  1,
  'default import does not duplicate matching students',
);
assert.equal(merged.records['old-y1']?.length, 1, 'default import keeps existing current-year records');
assert.equal(merged.testSessions.some(session => session.id === 'old-session'), true, 'default import keeps existing current-year tests');
assert.equal(merged.testSessions.length, 2, 'default import adds the imported test session');
const mergedSession = merged.testSessions.find(session => session.id === importResult.testSession.id)!;
assert.equal(
  mergedSession.groupingVersions.hundred[0].groups[0].members.some(member => member.studentId === 'existing-gan'),
  true,
  'imported groups link to existing matching student ids',
);
assert.equal(
  mergedSession.groupingVersions.hundred[0].groups[0].members.some(member => member.studentId === existingStudentId),
  false,
  'imported groups do not keep duplicate generated student ids for matched students',
);

const sameNameImport = parsePrearrangedWorkbook({
  百米: [
    ['时间', '道次', '姓名', '序号'],
    ['09:00', '1', '张伟', '003'],
  ],
}, {
  fileName: '2026.5.2测试.xlsx',
  yearId: 'y1',
  now: '2026-05-02T08:00:00.000Z',
});
const sameNameData: AppData = {
  ...oldData,
  students: [
    { id: 'zhang-001', studentNo: '001', name: '张伟', gender: 'male', yearId: 'y1' },
    { id: 'zhang-002', studentNo: '002', name: '张伟', gender: 'male', yearId: 'y1' },
  ],
  records: {},
  testSessions: [],
};
const sameNameMerged = mergePrearrangedImportWithYearData(sameNameData, 'y1', sameNameImport, 'appendMissing');
assert.equal(
  sameNameMerged.students.some(student => student.studentNo === '003' && student.name === '张伟'),
  true,
  'same-name import with a different number creates a distinct student',
);
const sameNameSession = sameNameMerged.testSessions.find(session => session.id === sameNameImport.testSession.id)!;
const sameNameMemberId = sameNameSession.groupingVersions.hundred[0].groups[0].members[0].studentId;
assert.equal(
  sameNameMerged.students.find(student => student.id === sameNameMemberId)?.studentNo,
  '003',
  'same-name imported grouping points at the imported student number',
);

const femaleImport = parsePrearrangedWorkbook({
  名单: [
    ['姓名', '序号'],
    ['王丽', '8'],
  ],
  百米: [
    ['时间', '道次', '姓名', '序号', '性别'],
    ['09:00', '1', '王丽', '8', '女'],
  ],
}, {
  fileName: '2026.5.3测试.xlsx',
  yearId: 'y1',
  now: '2026-05-03T08:00:00.000Z',
});
assert.equal(
  femaleImport.students.find(student => student.name === '王丽')?.gender,
  'female',
  'event sheet gender updates a student first seen in the roster sheet',
);

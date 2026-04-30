import assert from 'node:assert/strict';
import { ScoreSet, Student, TestRecord, TestSessionGroup } from '../types';
import {
  buildGroupPerformanceAnalysis,
  buildOverallPerformanceAnalysis,
  buildSingleEventPerformanceAnalysis,
} from './performanceAnalysis';

const students: Student[] = [
  { id: 's1', studentNo: '25001', name: '赵明轩', gender: 'male', yearId: 'y1' },
  { id: 's2', studentNo: '25002', name: '李承泽', gender: 'male', yearId: 'y1' },
  { id: 's3', studentNo: '25003', name: '何欣怡', gender: 'female', yearId: 'y1' },
  { id: 's4', studentNo: '25004', name: '孙宇航', gender: 'male', yearId: 'y1' },
];

function scores(values: Partial<ScoreSet>): ScoreSet {
  return {
    hundred: null,
    shotPut: null,
    tripleJump: null,
    eightHundred: null,
    ...values,
  };
}

function record(id: string, date: string, total: number, values: Partial<ScoreSet>, points?: Partial<TestRecord['points']>): TestRecord {
  return {
    id,
    date,
    testSessionId: `session-${date}`,
    testName: `${date}测试`,
    scores: scores(values),
    points: {
      hundred: points?.hundred ?? 10,
      shotPut: points?.shotPut ?? 5,
      tripleJump: points?.tripleJump ?? 8,
      eightHundred: points?.eightHundred ?? 7,
      total,
    },
  };
}

const records: Record<string, TestRecord[]> = {
  s1: [
    record('r1', '2026-04-01', 40, { hundred: 13.5, shotPut: 7.1 }, { hundred: 9, shotPut: 4 }),
    record('r2', '2026-04-15', 48, { hundred: 13.0, shotPut: 7.6 }, { hundred: 11, shotPut: 5 }),
    record('r3', '2026-04-30', 55, { hundred: 12.6, shotPut: 8.0 }, { hundred: 13, shotPut: 6 }),
  ],
  s2: [
    record('r4', '2026-04-01', 70, { hundred: 12.2, shotPut: 9.0 }, { hundred: 16, shotPut: 9 }),
    record('r5', '2026-04-15', 68, { hundred: 12.4, shotPut: 8.8 }, { hundred: 15, shotPut: 8 }),
    record('r6', '2026-04-30', 66, { hundred: 12.5, shotPut: 8.7 }, { hundred: 14, shotPut: 8 }),
  ],
  s3: [
    record('r7', '2026-04-01', 30, { hundred: 15.0, shotPut: 5.0 }, { hundred: 5, shotPut: 2 }),
    record('r8', '2026-04-15', 62, { hundred: 13.8, shotPut: 6.6 }, { hundred: 10, shotPut: 5 }),
    record('r9', '2026-04-30', 55, { hundred: 14.0, shotPut: 6.2 }, { hundred: 9, shotPut: 4 }),
  ],
};

const overall = buildOverallPerformanceAnalysis(students, records);

assert.equal(overall.summary.studentCount, 4);
assert.equal(overall.summary.recordedStudentCount, 3);
assert.equal(overall.latestTest?.label, '2026-04-30测试 · 2026-04-30');
assert.equal(overall.summary.averageTotal, 58.67);
assert.equal(overall.summary.maxTotal, 66);
assert.equal(overall.summary.minTotal, 55);
assert.equal(overall.summary.modeTotal, 55);
assert.equal(overall.weakestEvent?.event, 'shotPut');
assert.deepEqual(
  overall.progressLeaders.map(item => ({ id: item.student.id, change: item.change })),
  [
    { id: 's3', change: 25 },
    { id: 's1', change: 15 },
  ],
);
assert.deepEqual(overall.regressionLeaders.map(item => item.student.id), ['s2']);
assert.deepEqual(overall.continuousDeclines.map(item => item.student.id), ['s2']);
assert.equal(overall.highVolatility[0].student.id, 's3');
assert.equal(overall.fastestImprovers[0].student.id, 's3');
assert.ok(overall.trend.length >= 3);
assert.equal(overall.testAnalyses.length, 3);
assert.deepEqual(
  overall.testAnalyses[2].distribution.map(bucket => ({ label: bucket.label, count: bucket.count })),
  [
    { label: '0-60', count: 2 },
    { label: '60-70', count: 1 },
    { label: '70-80', count: 0 },
    { label: '80-90', count: 0 },
    { label: '90-100', count: 0 },
  ],
);
assert.equal(overall.testAnalyses[2].progressBoard[0].student.id, 's1');
assert.equal(overall.testAnalyses[2].regressionBoard[0].student.id, 's3');
assert.equal(overall.overallWeakestEvent?.event, 'shotPut');

const hundredAnalysis = buildSingleEventPerformanceAnalysis(students, records, 'hundred');
assert.equal(hundredAnalysis.event, 'hundred');
assert.equal(hundredAnalysis.trend.length, 3);
assert.equal(hundredAnalysis.testAnalyses[2].average, 48);
assert.equal(hundredAnalysis.testAnalyses[2].progressBoard[0].student.id, 's1');
assert.equal(hundredAnalysis.testAnalyses[2].regressionBoard[0].student.id, 's2');
assert.equal(hundredAnalysis.continuousDeclines[0].student.id, 's2');

const group: TestSessionGroup = {
  id: 'g1',
  name: '男生第1组',
  gender: 'male',
  members: [
    { studentId: 's1', lane: 1 },
    { studentId: 's2', lane: 2 },
    { studentId: 's4', lane: 3 },
  ],
};

const groupAnalysis = buildGroupPerformanceAnalysis({
  group,
  students,
  records,
  target: { date: '2026-04-30', testSessionId: 'session-2026-04-30' },
  event: 'hundred',
});

assert.equal(groupAnalysis.summary.memberCount, 3);
assert.equal(groupAnalysis.summary.recordedCount, 2);
assert.equal(groupAnalysis.summary.averageTotal, 60.5);
assert.equal(groupAnalysis.summary.averageEventPoint, 13.5);
assert.equal(groupAnalysis.bestPerformer?.student.id, 's2');
assert.equal(groupAnalysis.eventBest?.student.id, 's2');
assert.equal(groupAnalysis.progressLeaders[0].student.id, 's1');
assert.equal(groupAnalysis.regressionLeaders[0].student.id, 's2');
assert.equal(groupAnalysis.weakestEvent?.event, 'shotPut');

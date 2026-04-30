import assert from 'node:assert/strict';
import { Student, TestRecord } from '../types';
import { buildStudentReportRows } from './studentReport';

const student: Student = {
  id: 's1',
  studentNo: '25001',
  name: '学生一',
  gender: 'male',
  yearId: 'y1',
};

const records: TestRecord[] = [
  {
    id: 'r1',
    date: '2026-04-30',
    testName: '月考',
    testSessionId: 't1',
    scores: {
      hundred: 12.1,
      shotPut: 8.5,
      tripleJump: 6.3,
      eightHundred: 145,
    },
    points: {
      hundred: 21.26,
      shotPut: 14.4,
      tripleJump: 4.37,
      eightHundred: 17.14,
      total: 57.17,
    },
  },
];

assert.deepEqual(buildStudentReportRows(student, records), [
  {
    '姓名': '学生一',
    '学号': '25001',
    '性别': '男',
    '测试名称': '月考',
    '测试日期': '2026-04-30',
    '100米成绩': '12.10s',
    '100米得分': 21.26,
    '铅球成绩': '8.50m',
    '铅球得分': 14.4,
    '三级跳成绩': '6.30m',
    '三级跳得分': 4.37,
    '800米成绩': '2:25.0',
    '800米得分': 17.14,
    '总分': 57.17,
  },
], 'student report rows include profile info, test identity, scores, and points');

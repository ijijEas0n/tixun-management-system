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
      hundredAttempts: [12.4, 12.1, null],
      shotPut: 8.5,
      tripleJump: 6.3,
      tripleJumpAttempts: [6.1, 6.3, 6.25],
      eightHundred: 145,
    },
    points: {
      hundred: 21.26,
      shotPut: 14.4,
      tripleJump: 4.37,
      eightHundred: 17.14,
      total: 57.17,
    },
    comments: {
      hundred: '起跑慢，摆臂需要放松',
      tripleJump: '第二跳节奏最好',
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
    '100米多次记录': '12.40s / 12.10s / --',
    '100米批注': '起跑慢，摆臂需要放松',
    '100米得分': 21.26,
    '铅球成绩': '8.50m',
    '铅球多次记录': '--',
    '铅球批注': '',
    '铅球得分': 14.4,
    '三级跳成绩': '6.30m',
    '三级跳多次记录': '6.10m / 6.30m / 6.25m',
    '三级跳批注': '第二跳节奏最好',
    '三级跳得分': 4.37,
    '800米成绩': '2:25.0',
    '800米多次记录': '--',
    '800米批注': '',
    '800米得分': 17.14,
    '总分': 57.17,
  },
], 'student report rows include profile info, test identity, scores, and points');

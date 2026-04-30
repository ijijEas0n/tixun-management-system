import { Student, TestRecord } from '../types';
import { formatTime800m } from './utils';

function formatSprint(value: number | null): string {
  return value === null ? '--' : `${value.toFixed(2)}s`;
}

function formatDistance(value: number | null): string {
  return value === null ? '--' : `${value.toFixed(2)}m`;
}

export function buildStudentReportRows(student: Student, records: TestRecord[]) {
  return [...records]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(record => ({
      '姓名': student.name,
      '学号': student.studentNo,
      '性别': student.gender === 'male' ? '男' : '女',
      '测试名称': record.testName || '未命名测试',
      '测试日期': record.date,
      '100米成绩': formatSprint(record.scores.hundred),
      '100米得分': record.points.hundred,
      '铅球成绩': formatDistance(record.scores.shotPut),
      '铅球得分': record.points.shotPut,
      '三级跳成绩': formatDistance(record.scores.tripleJump),
      '三级跳得分': record.points.tripleJump,
      '800米成绩': formatTime800m(record.scores.eightHundred),
      '800米得分': record.points.eightHundred,
      '总分': record.points.total,
    }));
}

import { ScoreSet, SportEventKey, Student, TestRecord } from '../types';
import { formatTime800m } from './utils';

function formatSprint(value: number | null): string {
  return value === null ? '--' : `${value.toFixed(2)}s`;
}

function formatDistance(value: number | null): string {
  return value === null ? '--' : `${value.toFixed(2)}m`;
}

const ATTEMPT_KEYS: Record<SportEventKey, keyof ScoreSet> = {
  hundred: 'hundredAttempts',
  shotPut: 'shotPutAttempts',
  tripleJump: 'tripleJumpAttempts',
  eightHundred: 'eightHundredAttempts',
};

function formatAttempt(event: SportEventKey, value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return event === 'hundred'
    ? `${value.toFixed(2)}s`
    : event === 'eightHundred'
      ? formatTime800m(value)
      : `${value.toFixed(2)}m`;
}

function formatAttempts(record: TestRecord, event: SportEventKey): string {
  const attempts = record.scores[ATTEMPT_KEYS[event]];
  if (!Array.isArray(attempts) || attempts.length === 0) return '--';
  return attempts.map(value => formatAttempt(event, value)).join(' / ');
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
      '100米多次记录': formatAttempts(record, 'hundred'),
      '100米批注': record.comments?.hundred || '',
      '100米得分': record.points.hundred,
      '铅球成绩': formatDistance(record.scores.shotPut),
      '铅球多次记录': formatAttempts(record, 'shotPut'),
      '铅球批注': record.comments?.shotPut || '',
      '铅球得分': record.points.shotPut,
      '三级跳成绩': formatDistance(record.scores.tripleJump),
      '三级跳多次记录': formatAttempts(record, 'tripleJump'),
      '三级跳批注': record.comments?.tripleJump || '',
      '三级跳得分': record.points.tripleJump,
      '800米成绩': formatTime800m(record.scores.eightHundred),
      '800米多次记录': formatAttempts(record, 'eightHundred'),
      '800米批注': record.comments?.eightHundred || '',
      '800米得分': record.points.eightHundred,
      '总分': record.points.total,
    }));
}

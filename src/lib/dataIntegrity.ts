import {
  AppData,
  ScoreSet,
  SportEventKey,
  Student,
  StudentGender,
  TestRecord,
  TestSession,
  TestSessionGroupingVersion,
} from '../types';
import { calculatePoints } from './scoring';
import { createDefaultTrialConfigs, createEmptyGroupingVersions } from './grouping';
import { getRecordTestKey } from './testRecords';

const EVENTS: SportEventKey[] = ['hundred', 'shotPut', 'tripleJump', 'eightHundred'];
const VALID_GENDERS = new Set<StudentGender>(['male', 'female']);

export interface IntegrityIssue {
  code: string;
  message: string;
  path: string;
  severity: 'warning' | 'error';
}

export interface IntegrityReport {
  issues: IntegrityIssue[];
  hasErrors: boolean;
}

function issue(code: string, message: string, path: string, severity: IntegrityIssue['severity'] = 'warning'): IntegrityIssue {
  return { code, message, path, severity };
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach(value => {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  });
  return Array.from(duplicates);
}

function isValidGender(gender: unknown): gender is StudentGender {
  return typeof gender === 'string' && VALID_GENDERS.has(gender as StudentGender);
}

function isInvalidScoreValue(value: unknown): boolean {
  return value !== null && value !== undefined && (
    typeof value !== 'number' || !Number.isFinite(value) || value < 0
  );
}

function normalizeScoreValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeAttemptValues(value: unknown): (number | null)[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(item => normalizeScoreValue(item));
}

function normalizeScores(scores: Partial<ScoreSet> | undefined): ScoreSet {
  return {
    hundred: normalizeScoreValue(scores?.hundred),
    hundredAttempts: normalizeAttemptValues(scores?.hundredAttempts),
    shotPut: normalizeScoreValue(scores?.shotPut),
    shotPutAttempts: normalizeAttemptValues(scores?.shotPutAttempts),
    tripleJump: normalizeScoreValue(scores?.tripleJump),
    tripleJumpAttempts: normalizeAttemptValues(scores?.tripleJumpAttempts),
    eightHundred: normalizeScoreValue(scores?.eightHundred),
    eightHundredAttempts: normalizeAttemptValues(scores?.eightHundredAttempts),
  };
}

function pointsEqual(left: TestRecord['points'], right: TestRecord['points']): boolean {
  return EVENTS.every(event => Math.abs((left?.[event] ?? 0) - right[event]) <= 0.01) &&
    Math.abs((left?.total ?? 0) - right.total) <= 0.01;
}

function getYearPrefix(year?: { name: string }) {
  return year ? year.name.slice(-2) : '00';
}

function allocateRepairStudentNo(
  used: Set<string>,
  year?: { name: string },
): string {
  const prefix = getYearPrefix(year);
  let next = 1;
  let value = `${prefix}${String(next).padStart(3, '0')}`;
  while (used.has(value)) {
    next += 1;
    value = `${prefix}${String(next).padStart(3, '0')}`;
  }
  used.add(value);
  return value;
}

function completeGroupingVersions(
  groupingVersions: Partial<Record<SportEventKey, TestSessionGroupingVersion[]>> | undefined,
): Record<SportEventKey, TestSessionGroupingVersion[]> {
  const empty = createEmptyGroupingVersions();
  EVENTS.forEach(event => {
    empty[event] = Array.isArray(groupingVersions?.[event]) ? groupingVersions[event] : [];
  });
  return empty;
}

export function validateAppData(data: AppData): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const yearIds = data.years.map(year => year.id);
  const studentIds = data.students.map(student => student.id);
  const sessionIds = data.testSessions.map(session => session.id);
  const studentIdSet = new Set(studentIds);
  const sessionIdSet = new Set(sessionIds);
  const studentsById = new Map(data.students.map(student => [student.id, student]));

  findDuplicates(yearIds).forEach(id => issues.push(issue('DUPLICATE_YEAR_ID', `学年 ID 重复：${id}`, `years.${id}`, 'error')));
  findDuplicates(studentIds).forEach(id => issues.push(issue('DUPLICATE_STUDENT_ID', `学生 ID 重复：${id}`, `students.${id}`, 'error')));
  findDuplicates(sessionIds).forEach(id => issues.push(issue('DUPLICATE_TEST_SESSION_ID', `测试 ID 重复：${id}`, `testSessions.${id}`, 'error')));

  const studentNosByYear = new Map<string, Set<string>>();
  data.students.forEach((student, index) => {
    if (!isValidGender(student.gender)) {
      issues.push(issue('INVALID_GENDER', `学生 ${student.name || student.id} 性别无效`, `students.${index}.gender`, 'error'));
    }
    const key = student.yearId;
    const used = studentNosByYear.get(key) || new Set<string>();
    if (student.studentNo && used.has(student.studentNo)) {
      issues.push(issue('DUPLICATE_STUDENT_NO', `同一学年学号重复：${student.studentNo}`, `students.${index}.studentNo`, 'error'));
    }
    if (student.studentNo) used.add(student.studentNo);
    studentNosByYear.set(key, used);
  });

  Object.entries(data.records).forEach(([studentId, records]) => {
    if (!studentIdSet.has(studentId)) {
      issues.push(issue('ORPHAN_RECORD_STUDENT', `成绩归属学生不存在：${studentId}`, `records.${studentId}`, 'error'));
      return;
    }
    const seenRecordTargets = new Set<string>();
    records.forEach((record, index) => {
      if (record.testSessionId && !sessionIdSet.has(record.testSessionId)) {
        issues.push(issue('ORPHAN_RECORD_SESSION', `成绩关联测试不存在：${record.testSessionId}`, `records.${studentId}.${index}.testSessionId`, 'error'));
      }
      const targetKey = getRecordTestKey(record);
      if (seenRecordTargets.has(targetKey)) {
        issues.push(issue('DUPLICATE_TEST_RECORD', `同一学生同一测试存在重复成绩：${targetKey}`, `records.${studentId}.${index}`, 'error'));
      }
      seenRecordTargets.add(targetKey);
      EVENTS.forEach(event => {
        if (isInvalidScoreValue(record.scores?.[event])) {
          issues.push(issue('INVALID_SCORE', `成绩无效：${event}`, `records.${studentId}.${index}.scores.${event}`, 'error'));
        }
      });
      const student = studentsById.get(studentId);
      if (student && record.points && !pointsEqual(record.points, calculatePoints(normalizeScores(record.scores), student.gender))) {
        issues.push(issue('POINTS_MISMATCH', '成绩分数与原始成绩或性别不一致', `records.${studentId}.${index}.points`, 'warning'));
      }
    });
  });

  data.testSessions.forEach((session, sessionIndex) => {
    (session.absentStudentIds || []).forEach(studentId => {
      if (!studentIdSet.has(studentId)) {
        issues.push(issue('ORPHAN_ABSENT_STUDENT', `缺考学生不存在：${studentId}`, `testSessions.${sessionIndex}.absentStudentIds`));
      }
    });
    EVENTS.forEach(event => {
      const versions = session.groupingVersions?.[event] || [];
      const versionIds = new Set(versions.map(version => version.id));
      const activeVersionId = session.activeVersionIds?.[event];
      const entryVersionId = session.entryVersionIds?.[event];
      if (activeVersionId && !versionIds.has(activeVersionId)) {
        issues.push(issue('ORPHAN_ACTIVE_VERSION', `当前分组版本不存在：${activeVersionId}`, `testSessions.${sessionIndex}.activeVersionIds.${event}`));
      }
      if (entryVersionId && !versionIds.has(entryVersionId)) {
        issues.push(issue('ORPHAN_ENTRY_VERSION', `录入分组版本不存在：${entryVersionId}`, `testSessions.${sessionIndex}.entryVersionIds.${event}`));
      }
      versions.forEach((version, versionIndex) => {
        version.groups.forEach((group, groupIndex) => {
          group.members.forEach((member, memberIndex) => {
            if (!studentIdSet.has(member.studentId)) {
              issues.push(issue(
                'ORPHAN_GROUP_MEMBER',
                `分组成员学生不存在：${member.studentId}`,
                `testSessions.${sessionIndex}.groupingVersions.${event}.${versionIndex}.groups.${groupIndex}.members.${memberIndex}`,
              ));
            }
          });
        });
      });
    });
  });

  return { issues, hasErrors: issues.some(item => item.severity === 'error') };
}

export function repairAppData(data: AppData): AppData {
  const years = data.years.filter((year, index, list) => (
    year.id && list.findIndex(item => item.id === year.id) === index
  ));
  const fallbackYear = years[0] || { id: 'y1', name: '2025' };
  const yearIds = new Set(years.map(year => year.id));
  const yearsById = new Map(years.map(year => [year.id, year]));
  const seenStudentIds = new Set<string>();
  const usedStudentNosByYear = new Map<string, Set<string>>();

  const students: Student[] = data.students.flatMap(student => {
    if (!student.id || seenStudentIds.has(student.id)) return [];
    seenStudentIds.add(student.id);
    const yearId = yearIds.has(student.yearId) ? student.yearId : fallbackYear.id;
    const used = usedStudentNosByYear.get(yearId) || new Set<string>();
    const cleanNo = String(student.studentNo || '').trim();
    const studentNo = cleanNo && !used.has(cleanNo)
      ? cleanNo
      : allocateRepairStudentNo(used, yearsById.get(yearId));
    used.add(studentNo);
    usedStudentNosByYear.set(yearId, used);
    return [{
      id: student.id,
      name: String(student.name || '').trim() || '未命名学生',
      studentNo,
      gender: isValidGender(student.gender) ? student.gender : 'male',
      yearId,
    }];
  });
  const studentsById = new Map(students.map(student => [student.id, student]));

  const testSessions: TestSession[] = data.testSessions
    .filter((session, index, list) => session.id && list.findIndex(item => item.id === session.id) === index)
    .map(session => {
      const groupingVersions = completeGroupingVersions(session.groupingVersions);
      const activeVersionIds = { ...(session.activeVersionIds || {}) };
      const entryVersionIds = { ...(session.entryVersionIds || {}) };

      EVENTS.forEach(event => {
        groupingVersions[event] = groupingVersions[event].map(version => ({
          ...version,
          groups: version.groups.map(group => ({
            ...group,
            members: group.members.filter(member => studentsById.has(member.studentId)),
          })),
        }));
        const versionIds = new Set(groupingVersions[event].map(version => version.id));
        if (activeVersionIds[event] && !versionIds.has(activeVersionIds[event])) delete activeVersionIds[event];
        if (entryVersionIds[event] && !versionIds.has(entryVersionIds[event])) delete entryVersionIds[event];
      });

      return {
        ...session,
        yearId: yearIds.has(session.yearId) ? session.yearId : fallbackYear.id,
        absentStudentIds: (session.absentStudentIds || []).filter(studentId => studentsById.has(studentId)),
        activeVersionIds,
        entryVersionIds,
        groupingVersions,
        trialConfigs: {
          ...createDefaultTrialConfigs(),
          ...(session.trialConfigs || {}),
        },
        groupScheduleConfigs: session.groupScheduleConfigs || {},
      };
    });
  const sessionIds = new Set(testSessions.map(session => session.id));

  const records = Object.fromEntries(
    Object.entries(data.records).flatMap(([studentId, studentRecords]) => {
      const student = studentsById.get(studentId);
      if (!student || !Array.isArray(studentRecords)) return [];
      const byTarget = new Map<string, TestRecord>();
      studentRecords.forEach(record => {
        if (record.testSessionId && !sessionIds.has(record.testSessionId)) return;
        const scores = normalizeScores(record.scores);
        byTarget.set(getRecordTestKey(record), {
          ...record,
          scores,
          points: calculatePoints(scores, student.gender),
        });
      });
      return [[studentId, Array.from(byTarget.values())]];
    }),
  );

  return {
    years: years.length > 0 ? years : [fallbackYear],
    students,
    records,
    testSessions,
  };
}


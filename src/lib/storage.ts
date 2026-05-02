import { useState, useEffect } from 'react';
import {
  AppData,
  AcademicYear,
  Student,
  TestRecord,
  ScoreSet,
  TestSession,
  TestSessionGroupingVersion,
  SportEventKey,
} from '../types';
import { calculatePoints } from './scoring';
import { createDefaultTrialConfigs, createEmptyGroupingVersions } from './grouping';
import { isSameRecordTarget, RecordTarget } from './testRecords';
import { applyScoreSyncUndoSnapshots, ScoreSyncUndoSnapshot } from './scoreSync';
import { cleanupAuxiliaryData } from './auxiliaryStorage';
import { repairAppData, validateAppData } from './dataIntegrity';
import { generateId } from './id';
import {
  buildPrearrangedImportPreview,
  mergePrearrangedImportWithYearData,
  PREARRANGED_BACKUP_STORAGE_KEY,
  PrearrangedImportResult,
  PrearrangedStudentImportMode,
} from './prearrangedImport';

const STORAGE_KEY = 'fujian_sports_app_data';

const DEFAULT_DATA: AppData = {
  years: [{ id: 'y1', name: '2025' }],
  students: [],
  records: {},
  testSessions: [],
};

const EVENTS: SportEventKey[] = ['hundred', 'shotPut', 'tripleJump', 'eightHundred'];

export type StudentArchiveImportRow = { name: string; gender: Student['gender']; studentNo?: string };

function genderFromStudentNo(value: unknown): Student['gender'] | undefined {
  const text = String(value || '').trim();
  if (text === '女') return 'female';
  if (text === '男') return 'male';
  return undefined;
}

function cleanStudentNo(value: unknown): string {
  return String(value || '').trim();
}

function createStudentNoAllocator(students: Student[], years: AcademicYear[], yearId: string) {
  const year = years.find(item => item.id === yearId);
  const yearPrefix = year ? year.name.slice(-2) : '00';
  const usedStudentNos = new Set(
    students
      .filter(student => student.yearId === yearId)
      .map(student => cleanStudentNo(student.studentNo))
      .filter(studentNo => studentNo && !genderFromStudentNo(studentNo)),
  );
  const numericSuffixes = Array.from(usedStudentNos)
    .map(studentNo => parseInt(studentNo.slice(-3), 10))
    .filter(Number.isFinite);
  let nextNum = numericSuffixes.length > 0 ? Math.max(...numericSuffixes) + 1 : 1;

  return (preferredNo = '') => {
    const cleanPreferredNo = cleanStudentNo(preferredNo);
    if (cleanPreferredNo && !genderFromStudentNo(cleanPreferredNo) && !usedStudentNos.has(cleanPreferredNo)) {
      usedStudentNos.add(cleanPreferredNo);
      return cleanPreferredNo;
    }

    let studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
    while (usedStudentNos.has(studentNo)) {
      nextNum += 1;
      studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
    }
    usedStudentNos.add(studentNo);
    nextNum += 1;
    return studentNo;
  };
}

export function allocateNextStudentNo(yearStudents: Student[], year?: AcademicYear): string {
  const yearPrefix = year ? year.name.slice(-2) : '00';
  const usedStudentNos = new Set(
    yearStudents
      .map(student => cleanStudentNo(student.studentNo))
      .filter(studentNo => studentNo && !genderFromStudentNo(studentNo)),
  );
  const numericSuffixes = Array.from(usedStudentNos)
    .map(studentNo => parseInt(studentNo.slice(-3), 10))
    .filter(Number.isFinite);
  let nextNum = numericSuffixes.length > 0 ? Math.max(...numericSuffixes) + 1 : 1;
  let studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;

  while (usedStudentNos.has(studentNo)) {
    nextNum += 1;
    studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
  }

  return studentNo;
}

export function mergeStudentArchiveImport({
  students,
  importedStudents,
  yearId,
  years,
}: {
  students: Student[];
  importedStudents: StudentArchiveImportRow[];
  yearId: string;
  years: AcademicYear[];
}): Student[] {
  let nextStudents = students.map(student => ({
    ...student,
    studentNo: cleanStudentNo(student.studentNo),
  }));
  const nextStudentNo = createStudentNoAllocator(nextStudents, years, yearId);
  const seenImportedKeys = new Set<string>();

  importedStudents.forEach(item => {
    const name = item.name.trim();
    if (!name) return;

    const providedNo = cleanStudentNo(item.studentNo);
    const importedKey = providedNo ? `${providedNo}:${name}` : `no-number:${name}`;
    if (seenImportedKeys.has(importedKey)) return;
    seenImportedKeys.add(importedKey);

    const yearStudents = nextStudents.filter(student => student.yearId === yearId);
    const exactMatch = providedNo
      ? yearStudents.find(student => student.studentNo === providedNo && student.name === name)
      : undefined;
    const nameMatches = providedNo ? [] : yearStudents.filter(student => student.name === name);
    const matchedStudent = exactMatch || (nameMatches.length === 1 ? nameMatches[0] : undefined);

    if (matchedStudent) {
      nextStudents = nextStudents.map(student => (
        student.id === matchedStudent.id && student.gender !== item.gender
          ? { ...student, gender: item.gender }
          : student
      ));
      return;
    }

    if (!providedNo && nameMatches.length > 1) return;

    nextStudents = [
      ...nextStudents,
      {
        id: generateId('stu'),
        studentNo: nextStudentNo(providedNo),
        name,
        gender: item.gender,
        yearId,
      },
    ];
  });

  return nextStudents;
}

function recalculateRecordsForStudents(records: AppData['records'], students: Student[]): AppData['records'] {
  const studentsById = new Map(students.map(student => [student.id, student]));

  return Object.fromEntries(
    Object.entries(records).map(([studentId, studentRecords]) => {
      const student = studentsById.get(studentId);
      if (!student) return [studentId, studentRecords];
      return [
        studentId,
        studentRecords.map(record => ({
          ...record,
          points: calculatePoints(record.scores, student.gender),
        })),
      ];
    }),
  );
}

function normalizeStudents(students: Student[], years: AcademicYear[]): Student[] {
  const usedStudentNosByYear = new Map<string, Set<string>>();
  const nextNumberByYear = new Map<string, number>();

  const getUsedStudentNos = (yearId: string) => {
    const used = usedStudentNosByYear.get(yearId) || new Set<string>();
    usedStudentNosByYear.set(yearId, used);
    return used;
  };

  students.forEach(student => {
    const studentNo = String(student.studentNo || '').trim();
    if (!studentNo || genderFromStudentNo(studentNo)) return;
    const used = getUsedStudentNos(student.yearId);
    used.add(studentNo);
    const suffix = parseInt(studentNo.slice(-3), 10);
    if (Number.isFinite(suffix)) {
      nextNumberByYear.set(student.yearId, Math.max(nextNumberByYear.get(student.yearId) || 1, suffix + 1));
    }
  });

  const nextStudentNo = (yearId: string) => {
    const year = years.find(item => item.id === yearId);
    const yearPrefix = year ? year.name.slice(-2) : '00';
    const used = getUsedStudentNos(yearId);
    let nextNum = nextNumberByYear.get(yearId) || 1;
    let studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
    while (used.has(studentNo)) {
      nextNum += 1;
      studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
    }
    used.add(studentNo);
    nextNumberByYear.set(yearId, nextNum + 1);
    return studentNo;
  };

  return students.map(student => {
    const studentNo = String(student.studentNo || '').trim();
    const gender = genderFromStudentNo(studentNo);
    if (gender) {
      return { ...student, gender, studentNo: nextStudentNo(student.yearId) };
    }
    if (!studentNo) {
      return { ...student, studentNo: nextStudentNo(student.yearId) };
    }
    return { ...student, studentNo };
  });
}

function normalizeGroupingVersions(rawSession: any): Record<SportEventKey, TestSessionGroupingVersion[]> {
  const empty = createEmptyGroupingVersions();

  if (rawSession.groupingVersions) {
    EVENTS.forEach(event => {
      empty[event] = (rawSession.groupingVersions[event] || []).map((version: any, versionIndex: number) => ({
        id: version.id || generateId('grouping'),
        name: version.name || `版本 ${versionIndex + 1}`,
        event,
        createdAt: version.createdAt || rawSession.date || new Date().toISOString(),
        source: version.source || 'generated',
        mode: version.mode || 'size',
        groupSize: version.groupSize,
        groupCount: version.groupCount,
        groups: (version.groups || []).map((group: any, groupIndex: number) => ({
          id: group.id || generateId('group'),
          name: group.name || `第${groupIndex + 1}组`,
          marker: group.marker || '',
          startTime: group.startTime || '',
          gender: group.gender || (event === 'eightHundred' ? 'mixed' : 'male'),
          members: (group.members || group.studentIds || []).map((member: any, memberIndex: number) => {
            if (typeof member === 'string') {
              return {
                studentId: member,
                lane: event === 'hundred' ? memberIndex + 1 : undefined,
                order: memberIndex + 1,
              };
            }
            return {
              studentId: member.studentId,
              lane: event === 'hundred' ? member.lane ?? memberIndex + 1 : undefined,
              order: member.order ?? memberIndex + 1,
              rank: member.rank,
              note: member.note || '',
            };
          }),
        })),
      }));
    });
    return empty;
  }

  if (rawSession.groupings) {
    EVENTS.forEach(event => {
      const groups = rawSession.groupings[event] || [];
      if (groups.length === 0) return;
      empty[event] = [{
        id: generateId('grouping'),
        name: '版本 1',
        event,
        createdAt: rawSession.date || new Date().toISOString(),
        source: 'generated',
        mode: 'size',
        groups: groups.map((group: any, groupIndex: number) => ({
          id: group.id || generateId('group'),
          name: group.name || `第${groupIndex + 1}组`,
          marker: group.marker || '',
          startTime: group.startTime || '',
          gender: group.gender || (event === 'eightHundred' ? 'mixed' : 'male'),
          members: (group.studentIds || []).map((studentId: string, memberIndex: number) => ({
            studentId,
            lane: event === 'hundred' ? memberIndex + 1 : undefined,
            order: memberIndex + 1,
          })),
        })),
      }];
    });
  }

  return empty;
}

function normalizeTestSessions(rawSessions: any[] | undefined): TestSession[] {
  return (rawSessions || []).map((session: any) => {
    const groupingVersions = normalizeGroupingVersions(session);
    const activeVersionIds: Partial<Record<SportEventKey, string>> = { ...(session.activeVersionIds || {}) };
    const entryVersionIds: Partial<Record<SportEventKey, string>> = { ...(session.entryVersionIds || {}) };

    EVENTS.forEach(event => {
      if (!activeVersionIds[event] && groupingVersions[event][0]) {
        activeVersionIds[event] = groupingVersions[event][groupingVersions[event].length - 1].id;
      }
      if (
        entryVersionIds[event] &&
        !groupingVersions[event].some(version => version.id === entryVersionIds[event])
      ) {
        delete entryVersionIds[event];
      }
    });

    return {
      id: session.id || generateId('session'),
      name: session.name || '未命名测试',
      date: session.date || new Date().toISOString().split('T')[0],
      yearId: session.yearId || 'y1',
      absentStudentIds: Array.isArray(session.absentStudentIds) ? session.absentStudentIds : [],
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
}

export function parseStoredAppData(saved: string | null): AppData {
  let parsed: any;
  try {
    parsed = saved ? JSON.parse(saved) : DEFAULT_DATA;
  } catch {
    return DEFAULT_DATA;
  }

  const years = Array.isArray(parsed.years) && parsed.years.length > 0 ? parsed.years : DEFAULT_DATA.years;
  const students = Array.isArray(parsed.students) ? parsed.students : [];
  const testSessions = normalizeTestSessions(parsed.testSessions || parsed.phaseTests);

  const migratedStudents = normalizeStudents(students, years);

  const rawRecords = parsed.records && typeof parsed.records === 'object' ? parsed.records : {};
  const records = Object.fromEntries(
    Object.entries(rawRecords).map(([studentId, studentRecords]) => {
      const student = migratedStudents.find((s: Student) => s.id === studentId);
      if (!student || !Array.isArray(studentRecords)) return [studentId, Array.isArray(studentRecords) ? studentRecords : []];

      return [
        studentId,
        (studentRecords as TestRecord[]).map(record => ({
          ...record,
          points: calculatePoints(record.scores, student.gender),
        })),
      ];
    }),
  );

  const normalized = { ...DEFAULT_DATA, ...parsed, years, students: migratedStudents, records, testSessions };
  const repaired = repairAppData(normalized);
  const report = validateAppData(repaired);
  if (report.issues.length > 0 && typeof console !== 'undefined') {
    console.warn('AppData integrity warnings after repair', report.issues);
  }
  return repaired;
}

function getSessionVersionIds(session: TestSession | undefined): string[] {
  if (!session) return [];
  return EVENTS.flatMap(event => (session.groupingVersions[event] || []).map(version => version.id));
}

export function deleteTestSessionFromData(data: AppData, sessionId: string): AppData {
  return {
    ...data,
    records: Object.fromEntries(
      Object.entries(data.records).map(([studentId, studentRecords]) => [
        studentId,
        studentRecords.filter(record => record.testSessionId !== sessionId),
      ]),
    ),
    testSessions: data.testSessions.filter(session => session.id !== sessionId),
  };
}

function patchTestSessionInternalData(
  data: AppData,
  sessionId: string,
  updates: Pick<Partial<TestSession>, 'activeVersionIds' | 'entryVersionIds' | 'trialConfigs' | 'groupScheduleConfigs'>,
): AppData {
  return {
    ...data,
    testSessions: data.testSessions.map(session => {
      if (session.id !== sessionId) return session;
      return {
        ...session,
        activeVersionIds: updates.activeVersionIds ?? session.activeVersionIds,
        entryVersionIds: updates.entryVersionIds ?? session.entryVersionIds,
        trialConfigs: updates.trialConfigs ?? session.trialConfigs,
        groupScheduleConfigs: updates.groupScheduleConfigs ?? session.groupScheduleConfigs,
      };
    }),
  };
}

type SafeStudentUpdates = Pick<Partial<Student>, 'name' | 'gender' | 'studentNo'>;
type SafeTestSessionUpdates = Pick<Partial<TestSession>, 'name' | 'date' | 'absentStudentIds'>;

export function useData() {
  const [data, setData] = useState<AppData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return parseStoredAppData(saved);
  });

  const [currentYearId, setCurrentYearId] = useState<string>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_year`);
    return saved || data.years[0]?.id || '';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_year`, currentYearId);
  }, [currentYearId]);

  const addYear = (name: string) => {
    const newYear: AcademicYear = { id: generateId('year'), name };
    setData(prev => ({ ...prev, years: [...prev.years, newYear] }));
  };

  const deleteYear = (id: string) => {
    if (currentYearId === id) {
      const remainingYears = data.years.filter(y => y.id !== id);
      setCurrentYearId(remainingYears[0]?.id || '');
    }

    setData(prev => {
      const yearStudents = prev.students.filter(s => s.yearId === id);
      const studentIds = yearStudents.map(s => s.id);
      const removedSessions = prev.testSessions.filter(session => session.yearId === id);
      const removedSessionIds = removedSessions.map(session => session.id);
      const removedVersionIds = removedSessions.flatMap(getSessionVersionIds);
      cleanupAuxiliaryData({
        removedStudentIds: studentIds,
        removedSessionIds,
        removedVersionIds,
      });
      
      const newYears = prev.years.filter(y => y.id !== id);
      const newRecords = { ...prev.records };
      studentIds.forEach(sid => delete newRecords[sid]);

      return {
        ...prev,
        years: newYears,
        students: prev.students.filter(s => s.yearId !== id),
        records: newRecords,
        testSessions: prev.testSessions.filter(session => session.yearId !== id),
      };
    });
  };

  const updateYear = (id: string, name: string) => {
    setData(prev => ({
      ...prev,
      years: prev.years.map(y => y.id === id ? { ...y, name } : y),
    }));
  };

  const addStudent = (name: string, gender: 'male' | 'female', yearId: string) => {
    let createdStudent: Student | null = null;
    setData(prev => {
      const year = prev.years.find(y => y.id === yearId);
      const yearStudents = prev.students.filter(s => s.yearId === yearId);
      const newStudent: Student = {
        id: generateId('stu'),
        studentNo: allocateNextStudentNo(yearStudents, year),
        name,
        gender,
        yearId,
      };
      createdStudent = newStudent;
      return { ...prev, students: [...prev.students, newStudent] };
    });
    return createdStudent;
  };

  const batchAddStudents = (studentList: { name: string; gender: 'male' | 'female'; studentNo?: string }[], yearId: string) => {
    setData(prev => {
      const students = mergeStudentArchiveImport({
        students: prev.students,
        importedStudents: studentList,
        yearId,
        years: prev.years,
      });
      return {
        ...prev,
        students,
        records: recalculateRecordsForStudents(prev.records, students),
      };
    });
  };

  const updateStudent = (id: string, updates: SafeStudentUpdates) => {
    setData(prev => {
      const existing = prev.students.find(student => student.id === id);
      if (!existing) return prev;
      const safeUpdates: SafeStudentUpdates = {};
      if (updates.name !== undefined) safeUpdates.name = updates.name;
      if (updates.gender === 'male' || updates.gender === 'female') safeUpdates.gender = updates.gender;
      if (updates.studentNo !== undefined) safeUpdates.studentNo = cleanStudentNo(updates.studentNo);

      const students = prev.students.map(student => (
        student.id === id ? { ...student, ...safeUpdates, id: student.id, yearId: student.yearId } : student
      ));
      const genderChanged = safeUpdates.gender !== undefined && safeUpdates.gender !== existing.gender;
      return {
        ...prev,
        students,
        records: genderChanged ? recalculateRecordsForStudents(prev.records, students) : prev.records,
      };
    });
  };

  const batchDeleteStudents = (ids: string[]) => {
    setData(prev => {
      const newRecords = { ...prev.records };
      ids.forEach(id => delete newRecords[id]);
      return {
        ...prev,
        students: prev.students.filter(s => !ids.includes(s.id)),
        records: newRecords,
        testSessions: prev.testSessions.map(session => ({
          ...session,
          absentStudentIds: (session.absentStudentIds || []).filter(studentId => !ids.includes(studentId)),
          groupingVersions: Object.fromEntries(
            EVENTS.map(event => [
              event,
              session.groupingVersions[event].map(version => ({
                ...version,
                groups: version.groups.map(group => ({
                  ...group,
                  members: group.members.filter(member => !ids.includes(member.studentId)),
                })),
              })),
            ]),
          ) as Record<SportEventKey, TestSessionGroupingVersion[]>,
        })),
      };
    });
    cleanupAuxiliaryData({ removedStudentIds: ids });
  };

  const deleteStudent = (id: string) => {
    batchDeleteStudents([id]);
  };

  const deleteRecord = (studentId: string, recordId: string) => {
    setData(prev => {
      const studentRecords = prev.records[studentId] || [];
      const newStudentRecords = studentRecords.filter(r => r.id !== recordId);
      
      return {
        ...prev,
        records: {
          ...prev.records,
          [studentId]: newStudentRecords
        }
      };
    });
  };

  const updateRecordsBatch = (
    updates: Array<{
      studentId: string;
      scores: Partial<ScoreSet>;
      comments?: Partial<Record<SportEventKey, string>>;
    } & RecordTarget>,
  ) => {
    setData(prev => {
      const newRecords = { ...prev.records };
      
      updates.forEach(({ studentId, date, testSessionId, testName, scores, comments }) => {
        const student = prev.students.find(s => s.id === studentId);
        if (!student) return;

        const studentRecords = [...(newRecords[studentId] || [])];
        const existingRecordIndex = studentRecords.findIndex(r => isSameRecordTarget(r, { date, testSessionId }));

        if (existingRecordIndex > -1) {
          const existing = studentRecords[existingRecordIndex];
          const mergedScores: ScoreSet = {
            hundred: scores.hundred !== undefined ? scores.hundred : existing.scores.hundred,
            hundredAttempts: scores.hundredAttempts !== undefined ? scores.hundredAttempts : existing.scores.hundredAttempts,
            shotPut: scores.shotPut !== undefined ? scores.shotPut : existing.scores.shotPut,
            shotPutAttempts: scores.shotPutAttempts !== undefined ? scores.shotPutAttempts : existing.scores.shotPutAttempts,
            tripleJump: scores.tripleJump !== undefined ? scores.tripleJump : existing.scores.tripleJump,
            tripleJumpAttempts: scores.tripleJumpAttempts !== undefined ? scores.tripleJumpAttempts : existing.scores.tripleJumpAttempts,
            eightHundred: scores.eightHundred !== undefined ? scores.eightHundred : existing.scores.eightHundred,
            eightHundredAttempts: scores.eightHundredAttempts !== undefined ? scores.eightHundredAttempts : existing.scores.eightHundredAttempts,
          };
          
          const points = calculatePoints(mergedScores, student.gender);
          
          studentRecords[existingRecordIndex] = {
            ...existing,
            date,
            testSessionId: testSessionId || existing.testSessionId,
            testName: testName || existing.testName,
            scores: mergedScores,
            points,
            comments: comments !== undefined ? { ...(existing.comments || {}), ...comments } : existing.comments,
          };
        } else {
          // If scores is partial, we need to fill it with nulls for a new record
          const fullScores: ScoreSet = {
            hundred: scores.hundred ?? null,
            hundredAttempts: scores.hundredAttempts ?? [null, null, null],
            shotPut: scores.shotPut ?? null,
            shotPutAttempts: scores.shotPutAttempts ?? [null, null, null],
            tripleJump: scores.tripleJump ?? null,
            tripleJumpAttempts: scores.tripleJumpAttempts ?? [null, null, null],
            eightHundred: scores.eightHundred ?? null,
            eightHundredAttempts: scores.eightHundredAttempts ?? [null],
          };
          const points = calculatePoints(fullScores, student.gender);
          
          studentRecords.push({
            id: generateId('record'),
            date,
            testSessionId,
            testName,
            scores: fullScores,
            points,
            comments,
          });
        }
        newRecords[studentId] = studentRecords;
      });
      
      return { ...prev, records: newRecords };
    });
  };

  const revertScoreSyncBatch = (
    target: RecordTarget,
    event: SportEventKey,
    snapshots: ScoreSyncUndoSnapshot[],
  ) => {
    setData(prev => ({
      ...prev,
      records: applyScoreSyncUndoSnapshots({
        records: prev.records,
        students: prev.students,
        target,
        event,
        snapshots,
      }),
    }));
  };

  const addTestSession = (name: string, date: string, yearId: string, absentStudentIds: string[] = []) => {
    const newSession: TestSession = {
      id: generateId('session'),
      name,
      date,
      yearId,
      absentStudentIds,
      activeVersionIds: {},
      entryVersionIds: {},
      groupingVersions: createEmptyGroupingVersions(),
      trialConfigs: createDefaultTrialConfigs(),
      groupScheduleConfigs: {},
    };
    setData(prev => ({ ...prev, testSessions: [...prev.testSessions, newSession] }));
    return newSession;
  };

  const updateTestSession = (sessionId: string, updates: SafeTestSessionUpdates) => {
    setData(prev => ({
      ...prev,
      testSessions: prev.testSessions.map(session => (
        session.id === sessionId ? {
          ...session,
          name: updates.name ?? session.name,
          date: updates.date ?? session.date,
          absentStudentIds: updates.absentStudentIds ?? session.absentStudentIds,
        } : session
      )),
    }));
  };

  const patchTestSessionInternal = (
    sessionId: string,
    updates: Pick<Partial<TestSession>, 'activeVersionIds' | 'entryVersionIds' | 'trialConfigs' | 'groupScheduleConfigs'>,
  ) => {
    setData(prev => patchTestSessionInternalData(prev, sessionId, updates));
  };

  const deleteTestSession = (sessionId: string) => {
    setData(prev => {
      const removedSession = prev.testSessions.find(session => session.id === sessionId);
      cleanupAuxiliaryData({
        removedSessionIds: [sessionId],
        removedVersionIds: getSessionVersionIds(removedSession),
      });
      return deleteTestSessionFromData(prev, sessionId);
    });
  };

  const addGroupingVersion = (
    sessionId: string,
    event: SportEventKey,
    version: TestSessionGroupingVersion,
  ) => {
    setData(prev => ({
      ...prev,
      testSessions: prev.testSessions.map(session => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          activeVersionIds: {
            ...session.activeVersionIds,
            [event]: version.id,
          },
          groupingVersions: {
            ...session.groupingVersions,
            [event]: [...session.groupingVersions[event], version],
          },
        };
      }),
    }));
  };

  const updateGroupingVersion = (
    sessionId: string,
    event: SportEventKey,
    versionId: string,
    updates: Partial<TestSessionGroupingVersion>,
  ) => {
    setData(prev => ({
      ...prev,
      testSessions: prev.testSessions.map(session => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          groupingVersions: {
            ...session.groupingVersions,
            [event]: session.groupingVersions[event].map(version => (
              version.id === versionId ? { ...version, ...updates } : version
            )),
          },
        };
      }),
    }));
  };

  const applyPrearrangedImport = (
    yearId: string,
    importResult: PrearrangedImportResult,
    mode: PrearrangedStudentImportMode = 'appendMissing',
  ) => {
    setData(prev => {
      const preview = buildPrearrangedImportPreview(prev, yearId, importResult, mode);
      if (preview.conflicts.length > 0 || preview.errors.length > 0) return prev;
      if (mode === 'replaceYear') {
        if (preview.backup && typeof localStorage !== 'undefined') {
          localStorage.setItem(PREARRANGED_BACKUP_STORAGE_KEY, JSON.stringify(preview.backup));
        }
        const removedStudentIds = prev.students.filter(student => student.yearId === yearId).map(student => student.id);
        const removedSessions = prev.testSessions.filter(session => session.yearId === yearId);
        cleanupAuxiliaryData({
          removedStudentIds,
          removedSessionIds: removedSessions.map(session => session.id),
          removedVersionIds: removedSessions.flatMap(getSessionVersionIds),
        });
      }
      return mergePrearrangedImportWithYearData(prev, yearId, importResult, mode);
    });
  };

  return {
    data,
    setData,
    currentYearId,
    setCurrentYearId,
    addYear,
    deleteYear,
    updateYear,
    addStudent,
    updateStudent,
    deleteStudent,
    batchDeleteStudents,
    deleteRecord,
    updateRecordsBatch,
    revertScoreSyncBatch,
    batchAddStudents,
    addTestSession,
    updateTestSession,
    patchTestSessionInternal,
    deleteTestSession,
    addGroupingVersion,
    updateGroupingVersion,
    applyPrearrangedImport,
  };
}

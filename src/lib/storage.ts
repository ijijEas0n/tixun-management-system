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
import {
  mergePrearrangedImportWithYearData,
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

function normalizeGroupingVersions(rawSession: any): Record<SportEventKey, TestSessionGroupingVersion[]> {
  const empty = createEmptyGroupingVersions();

  if (rawSession.groupingVersions) {
    EVENTS.forEach(event => {
      empty[event] = (rawSession.groupingVersions[event] || []).map((version: any, versionIndex: number) => ({
        id: version.id || `${event}-legacy-${versionIndex}`,
        name: version.name || `版本 ${versionIndex + 1}`,
        event,
        createdAt: version.createdAt || rawSession.date || new Date().toISOString(),
        source: version.source || 'generated',
        mode: version.mode || 'size',
        groupSize: version.groupSize,
        groupCount: version.groupCount,
        groups: (version.groups || []).map((group: any, groupIndex: number) => ({
          id: group.id || `${event}-legacy-group-${groupIndex}`,
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
        id: `${event}-legacy-version`,
        name: '版本 1',
        event,
        createdAt: rawSession.date || new Date().toISOString(),
        source: 'generated',
        mode: 'size',
        groups: groups.map((group: any, groupIndex: number) => ({
          id: group.id || `${event}-legacy-group-${groupIndex}`,
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
      id: session.id || Date.now().toString() + Math.random(),
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

export function useData() {
  const [data, setData] = useState<AppData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : DEFAULT_DATA;
    const testSessions = normalizeTestSessions(parsed.testSessions || parsed.phaseTests);
    
    // Data Migration: Ensure all students have a studentNo
    let modified = false;
    const migratedStudents = parsed.students.map((s: Student) => {
      if (!s.studentNo) {
        modified = true;
        const year = parsed.years.find((y: AcademicYear) => y.id === s.yearId);
        const yearPrefix = year ? year.name.slice(-2) : '00';
        // Simple assignment for legacy data
        const fallbackNo = `${yearPrefix}999`; 
        return { ...s, studentNo: fallbackNo };
      }
      return s;
    });

    const records = Object.fromEntries(
      Object.entries(parsed.records || {}).map(([studentId, studentRecords]) => {
        const student = migratedStudents.find((s: Student) => s.id === studentId);
        if (!student) return [studentId, studentRecords];

        return [
          studentId,
          (studentRecords as TestRecord[]).map(record => ({
            ...record,
            points: calculatePoints(record.scores, student.gender),
          })),
        ];
      })
    );

    if (modified) {
      return { ...parsed, students: migratedStudents, records, testSessions };
    }
    return { ...parsed, records, testSessions };
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
    const newYear: AcademicYear = { id: Date.now().toString(), name };
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
    const year = data.years.find(y => y.id === yearId);
    const yearPrefix = year ? year.name.slice(-2) : '00';
    const yearStudents = data.students.filter(s => s.yearId === yearId);
    
    let nextNum = 1;
    if (yearStudents.length > 0) {
      const maxNo = Math.max(...yearStudents.map(s => parseInt(s.studentNo.slice(-3))));
      nextNum = maxNo + 1;
    }
    
    const studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
    
    const newStudent: Student = { 
      id: Date.now().toString() + Math.random(), 
      studentNo,
      name, 
      gender, 
      yearId 
    };
    setData(prev => ({ ...prev, students: [...prev.students, newStudent] }));
    return newStudent;
  };

  const batchAddStudents = (studentList: { name: string; gender: 'male' | 'female'; studentNo?: string }[], yearId: string) => {
    setData(prev => {
      const year = prev.years.find(y => y.id === yearId);
      const yearPrefix = year ? year.name.slice(-2) : '00';
      const yearStudents = prev.students.filter(s => s.yearId === yearId);
      const usedStudentNos = new Set(yearStudents.map(student => student.studentNo).filter(Boolean));
      const existingKeys = new Set(yearStudents.map(student => `${student.studentNo || ''}:${student.name}`));
      const existingNames = new Set(yearStudents.map(student => student.name));
      const newStudents: Student[] = [];

      const numericSuffixes = yearStudents
        .map(student => parseInt((student.studentNo || '').slice(-3), 10))
        .filter(Number.isFinite);
      let nextNum = numericSuffixes.length > 0 ? Math.max(...numericSuffixes) + 1 : 1;

      const nextGeneratedNo = () => {
        let studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
        while (usedStudentNos.has(studentNo)) {
          nextNum += 1;
          studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
        }
        nextNum += 1;
        usedStudentNos.add(studentNo);
        return studentNo;
      };

      studentList.forEach(item => {
        const name = item.name.trim();
        if (!name) return;
        const providedNo = item.studentNo?.trim() || '';
        const duplicate = providedNo
          ? existingKeys.has(`${providedNo}:${name}`)
          : existingNames.has(name);
        if (duplicate) return;

        const studentNo = providedNo || nextGeneratedNo();
        existingKeys.add(`${studentNo}:${name}`);
        existingNames.add(name);
        if (studentNo) usedStudentNos.add(studentNo);
        newStudents.push({
          id: Date.now().toString() + Math.random(),
          studentNo,
          name,
          gender: item.gender,
          yearId,
        });
      });

      return { ...prev, students: [...prev.students, ...newStudents] };
    });
  };

  const updateStudent = (id: string, updates: Partial<Student>) => {
    setData(prev => ({
      ...prev,
      students: prev.students.map(student => student.id === id ? { ...student, ...updates } : student),
    }));
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

  const updateRecordsBatch = (updates: Array<{ studentId: string; scores: Partial<ScoreSet> } & RecordTarget>) => {
    setData(prev => {
      const newRecords = { ...prev.records };
      
      updates.forEach(({ studentId, date, testSessionId, testName, scores }) => {
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
            id: Date.now().toString() + Math.random(),
            date,
            testSessionId,
            testName,
            scores: fullScores,
            points,
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
      id: Date.now().toString() + Math.random(),
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

  const updateTestSession = (sessionId: string, updates: Partial<TestSession>) => {
    setData(prev => ({
      ...prev,
      testSessions: prev.testSessions.map(session => (
        session.id === sessionId ? { ...session, ...updates } : session
      )),
    }));
  };

  const deleteTestSession = (sessionId: string) => {
    setData(prev => ({
      ...prev,
      testSessions: prev.testSessions.filter(session => session.id !== sessionId),
    }));
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
    setData(prev => mergePrearrangedImportWithYearData(prev, yearId, importResult, mode));
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
    deleteTestSession,
    addGroupingVersion,
    updateGroupingVersion,
    applyPrearrangedImport,
  };
}

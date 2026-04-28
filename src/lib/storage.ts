import { useState, useEffect } from 'react';
import { AppData, AcademicYear, Student, TestRecord, ScoreSet } from '../types';
import { calculatePoints } from './scoring';

const STORAGE_KEY = 'fujian_sports_app_data';

const DEFAULT_DATA: AppData = {
  years: [{ id: 'y1', name: '2025' }],
  students: [],
  records: {},
};

export function useData() {
  const [data, setData] = useState<AppData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : DEFAULT_DATA;
    
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
      return { ...parsed, students: migratedStudents, records };
    }
    return { ...parsed, records };
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

  const batchAddStudents = (studentList: { name: string; gender: 'male' | 'female' }[], yearId: string) => {
    const year = data.years.find(y => y.id === yearId);
    const yearPrefix = year ? year.name.slice(-2) : '00';
    const yearStudents = data.students.filter(s => s.yearId === yearId);
    
    let nextNum = 1;
    if (yearStudents.length > 0) {
      const maxNo = Math.max(...yearStudents.map(s => parseInt(s.studentNo.slice(-3))));
      nextNum = maxNo + 1;
    }
    
    const newStudents: Student[] = studentList.map(item => {
      const studentNo = `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
      nextNum++;
      return {
        id: Date.now().toString() + Math.random(),
        studentNo,
        name: item.name,
        gender: item.gender,
        yearId
      };
    });

    setData(prev => ({ ...prev, students: [...prev.students, ...newStudents] }));
  };

  const batchDeleteStudents = (ids: string[]) => {
    setData(prev => {
      const newRecords = { ...prev.records };
      ids.forEach(id => delete newRecords[id]);
      return {
        ...prev,
        students: prev.students.filter(s => !ids.includes(s.id)),
        records: newRecords,
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

  const updateRecordsBatch = (updates: { studentId: string; date: string; scores: Partial<ScoreSet> }[]) => {
    setData(prev => {
      const newRecords = { ...prev.records };
      
      updates.forEach(({ studentId, date, scores }) => {
        const student = prev.students.find(s => s.id === studentId);
        if (!student) return;

        const studentRecords = [...(newRecords[studentId] || [])];
        const existingRecordIndex = studentRecords.findIndex(r => r.date === date);

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
            scores: fullScores,
            points,
          });
        }
        newRecords[studentId] = studentRecords;
      });
      
      return { ...prev, records: newRecords };
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
    deleteStudent,
    batchDeleteStudents,
    deleteRecord,
    updateRecordsBatch,
    batchAddStudents,
  };
}

import assert from 'node:assert/strict';
import { mergeStudentArchiveImport, parseStoredAppData } from './storage';

assert.equal(
  parseStoredAppData('{bad json').years[0].id,
  'y1',
  'bad saved app data falls back to default data instead of crashing',
);

const parsed = parseStoredAppData(JSON.stringify({
  years: [{ id: 'custom', name: '2026' }],
  students: [],
  records: {},
  testSessions: [],
}));

assert.equal(parsed.years[0].id, 'custom', 'valid saved app data is preserved');

const repairedGenderStudentNos = parseStoredAppData(JSON.stringify({
  years: [{ id: 'y26', name: '2026' }],
  students: [
    { id: 's1', name: '张诗雨', studentNo: '女', gender: 'male', yearId: 'y26' },
    { id: 's2', name: '叶子超', studentNo: '男', gender: 'female', yearId: 'y26' },
  ],
  records: {},
  testSessions: [],
}));

assert.deepEqual(
  repairedGenderStudentNos.students.map(student => ({
    name: student.name,
    studentNo: student.studentNo,
    gender: student.gender,
  })),
  [
    { name: '张诗雨', studentNo: '26001', gender: 'female' },
    { name: '叶子超', studentNo: '26002', gender: 'male' },
  ],
  'saved students imported from two-column gender sheets are repaired on load',
);

const mergedRosterAfterPrearrangedImport = mergeStudentArchiveImport({
  students: [
    { id: 'pre-1', name: '李雨珊', studentNo: '26001', gender: 'male', yearId: 'y26' },
    { id: 'pre-2', name: '叶子超', studentNo: '26002', gender: 'male', yearId: 'y26' },
  ],
  importedStudents: [
    { name: '李雨珊', gender: 'female' },
    { name: '叶子超', gender: 'male' },
    { name: '新女生', gender: 'female' },
  ],
  yearId: 'y26',
  years: [{ id: 'y26', name: '2026' }],
});

assert.equal(
  mergedRosterAfterPrearrangedImport.find(student => student.name === '李雨珊')?.id,
  'pre-1',
  'student archive import keeps the existing student id when correcting a matched profile',
);

assert.equal(
  mergedRosterAfterPrearrangedImport.find(student => student.name === '李雨珊')?.gender,
  'female',
  'student archive import updates gender for an existing no-number roster match',
);

assert.equal(
  mergedRosterAfterPrearrangedImport.filter(student => student.name === '李雨珊').length,
  1,
  'student archive import does not create a duplicate when correcting gender',
);

assert.deepEqual(
  mergedRosterAfterPrearrangedImport.find(student => student.name === '新女生'),
  { id: mergedRosterAfterPrearrangedImport.find(student => student.name === '新女生')?.id, name: '新女生', studentNo: '26003', gender: 'female', yearId: 'y26' },
  'student archive import still adds new students after correcting existing profiles',
);

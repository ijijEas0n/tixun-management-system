import assert from 'node:assert/strict';
import { parseStoredAppData } from './storage';

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

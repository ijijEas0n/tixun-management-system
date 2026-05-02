import assert from 'node:assert/strict';
import { buildGroupingImportPreview } from './groupImport';
import { Student } from '../types';

const students: Student[] = [
  { id: 's1', studentNo: '001', name: '张伟', gender: 'male', yearId: 'y1' },
  { id: 's2', studentNo: '002', name: '张伟', gender: 'male', yearId: 'y1' },
  { id: 's3', studentNo: '003', name: '李娜', gender: 'female', yearId: 'y1' },
];

const duplicateName = buildGroupingImportPreview({
  event: 'hundred',
  presentStudents: students,
  rows: [{ 组名: '第一组', 姓名: '张伟', 跑道: '1' }],
  versionName: '导入版本',
});
assert.equal(duplicateName.version, undefined, 'duplicate no-number names are not imported');
assert.equal(duplicateName.conflicts[0].type, 'DUPLICATE_NAME_WITHOUT_STUDENT_NO');

const differentName = buildGroupingImportPreview({
  event: 'hundred',
  presentStudents: students,
  rows: [{ 组名: '第一组', 姓名: '王强', 学号: '001', 跑道: '1' }],
  versionName: '导入版本',
});
assert.equal(differentName.version, undefined, 'same student number with different name is not imported');
assert.equal(differentName.conflicts[0].type, 'SAME_STUDENT_NO_DIFFERENT_NAME');

const duplicateStudent = buildGroupingImportPreview({
  event: 'shotPut',
  presentStudents: students,
  rows: [
    { 组名: '第一组', 姓名: '李娜', 学号: '003', 顺序: '1' },
    { 组名: '第二组', 姓名: '李娜', 学号: '003', 顺序: '1' },
  ],
  versionName: '导入版本',
});
assert.equal(duplicateStudent.version, undefined, 'same student cannot appear in multiple groups');
assert.equal(duplicateStudent.conflicts[0].type, 'DUPLICATE_STUDENT_IN_IMPORT');

const valid = buildGroupingImportPreview({
  event: 'hundred',
  presentStudents: students,
  rows: [
    { 组名: '第一组', 姓名: '李娜', 学号: '003', 跑道: '1' },
  ],
  versionName: '导入版本',
  now: '2026-05-02T08:00:00.000Z',
});
assert.equal(valid.conflicts.length, 0);
assert.equal(valid.errors.length, 0);
assert.equal(valid.version?.groups[0].members[0].studentId, 's3', 'valid imports use stable student ids');


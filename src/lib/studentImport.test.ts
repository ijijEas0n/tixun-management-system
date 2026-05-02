import assert from 'node:assert/strict';
import { buildStudentImportReport, parseStudentImportWorkbook } from './studentImport';

const students = parseStudentImportWorkbook({
  Sheet1: [
    ['林茂源', '4', '男'],
    ['齐林涛', '67', '0.8490985'],
    ['王丽', '8', '女'],
  ],
  花名册: [
    ['姓名', '序号', '性别'],
    ['何欣怡', '69', '女'],
    ['甘振豪', '29', '男'],
    ['甘振豪', '29', '男'],
  ],
  两列名单: [
    ['姓名', '性别'],
    ['张诗雨', '女'],
    ['张锦晨', '男'],
    ['姓名', '男'],
    ['何欣怡', '女'],
  ],
  无表头两列名单: [
    ['张海心', '女'],
  ],
});

assert.deepEqual(
  students,
  [
    { name: '林茂源', studentNo: '4', gender: 'male' },
    { name: '齐林涛', studentNo: '67', gender: 'male' },
    { name: '王丽', studentNo: '8', gender: 'female' },
    { name: '何欣怡', studentNo: '69', gender: 'female' },
    { name: '甘振豪', studentNo: '29', gender: 'male' },
    { name: '张诗雨', studentNo: undefined, gender: 'female' },
    { name: '张锦晨', studentNo: undefined, gender: 'male' },
    { name: '何欣怡', studentNo: undefined, gender: 'female' },
    { name: '张海心', studentNo: undefined, gender: 'female' },
  ],
  'student archive import supports no-header lists, two-column gender lists, headered lists, numbers, gender, reserved header-like names, and dedupe',
);

const conflictReport = buildStudentImportReport(
  [
    { id: 's1', studentNo: '001', name: '张伟', gender: 'male', yearId: 'y1' },
    { id: 's2', studentNo: '002', name: '李娜', gender: 'female', yearId: 'y1' },
  ],
  [
    { name: '王强', studentNo: '001', gender: 'male' },
    { name: '李娜', gender: 'female' },
    { name: '赵敏', studentNo: '003', gender: 'female' },
  ],
);

assert.deepEqual(
  conflictReport.conflicts.map(item => item.type),
  ['SAME_STUDENT_NO_DIFFERENT_NAME', 'DUPLICATE_NAME_WITHOUT_STUDENT_NO'],
  'student import reports conflicting number/name matches and no-number duplicate names',
);
assert.deepEqual(
  conflictReport.created,
  [{ name: '赵敏', studentNo: '003', gender: 'female' }],
  'student import report keeps non-conflicting rows ready to apply',
);

const duplicateNoReport = buildStudentImportReport(
  [],
  [
    { name: '张伟', studentNo: '001', gender: 'male' },
    { name: '王强', studentNo: '001', gender: 'male' },
  ],
);
assert.equal(
  duplicateNoReport.conflicts[0].type,
  'DUPLICATE_STUDENT_NO',
  'student import reports duplicate student numbers inside the imported file',
);

import assert from 'node:assert/strict';
import { parseStudentImportWorkbook } from './studentImport';

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
});

assert.deepEqual(
  students,
  [
    { name: '林茂源', studentNo: '4', gender: 'male' },
    { name: '齐林涛', studentNo: '67', gender: 'male' },
    { name: '王丽', studentNo: '8', gender: 'female' },
    { name: '何欣怡', studentNo: '69', gender: 'female' },
    { name: '甘振豪', studentNo: '29', gender: 'male' },
  ],
  'student archive import supports no-header lists, headered lists, numbers, gender, and dedupe',
);

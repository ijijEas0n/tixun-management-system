import assert from 'node:assert/strict';
import {
  objectRowsToSheetData,
  parseCsvMatrix,
  sheetMatrixToObjects,
} from './tableWorkbook';

assert.deepEqual(
  sheetMatrixToObjects([
    ['姓名', '学号'],
    ['张三', 1],
    ['', ''],
    ['李四', 2],
  ]),
  [
    { 姓名: '张三', 学号: 1 },
    { 姓名: '李四', 学号: 2 },
  ],
  'sheet matrix converts first row to object headers and skips empty rows',
);

assert.deepEqual(
  objectRowsToSheetData([
    { 姓名: '张三', 成绩: 12.3 },
    { 姓名: '李四', 成绩: 13.1 },
  ]),
  [
    ['姓名', '成绩'],
    ['张三', 12.3],
    ['李四', 13.1],
  ],
  'object rows convert to a stable worksheet matrix',
);

assert.deepEqual(
  parseCsvMatrix('姓名,成绩\n"张,三",12.3\n李四,13.1'),
  [
    ['姓名', '成绩'],
    ['张,三', '12.3'],
    ['李四', '13.1'],
  ],
  'csv parser handles quoted commas',
);

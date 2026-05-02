import assert from 'node:assert/strict';
import { parseScoreInput } from './scoreInput';

assert.deepEqual(parseScoreInput('hundred', ''), { value: null }, 'empty score input is null');
assert.deepEqual(parseScoreInput('hundred', '12.35'), { value: 12.35 }, 'hundred score parses decimals');
assert.deepEqual(parseScoreInput('eightHundred', '2:12.5'), { value: 132.5 }, '800m score parses minute-second format');
assert.equal(parseScoreInput('shotPut', '-1').error, '成绩不能为负数', 'negative distance is rejected');
assert.equal(parseScoreInput('hundred', 'abc').error, '成绩格式无效', 'non-numeric scores are rejected');
assert.equal(parseScoreInput('eightHundred', '99:99').error, '时间格式无效', 'invalid time is rejected');
assert.equal(parseScoreInput('hundred', '80').error, '成绩明显异常，请检查', 'obvious time outliers are rejected');


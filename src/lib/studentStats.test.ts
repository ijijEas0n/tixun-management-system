import assert from 'node:assert/strict';
import { TestRecord } from '../types';
import { getStudentBestScores } from './studentStats';

let recordId = 0;

function record(
  scores: Partial<TestRecord['scores']>,
  total = 0,
): TestRecord {
  return {
    id: `r${recordId++}`,
    date: '2026-04-30',
    scores: {
      hundred: null,
      shotPut: null,
      tripleJump: null,
      eightHundred: null,
      ...scores,
    },
    points: {
      hundred: 0,
      shotPut: 0,
      tripleJump: 0,
      eightHundred: 0,
      total,
    },
  };
}

assert.deepEqual(getStudentBestScores([]), {
  hundred: null,
  shotPut: null,
  tripleJump: null,
  eightHundred: null,
  total: null,
});

assert.deepEqual(
  getStudentBestScores([
    record({ hundred: 12.4 }, 20),
    record({ hundred: null, shotPut: 8.5, tripleJump: 6.2 }, 35),
    record({ hundred: 12.1, shotPut: 8.2, eightHundred: null }, 30),
  ]),
  {
    hundred: 12.1,
    shotPut: 8.5,
    tripleJump: 6.2,
    eightHundred: null,
    total: 35,
  },
);

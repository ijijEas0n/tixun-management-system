import { ScoreSet, ScorePoints, StudentGender } from '../types';
import { SCORE_TABLES, ScoreEventKey, ScoreTable } from './scoringTables';

function toHundredths(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function pointFromTable(value: number | null, table: ScoreTable): number {
  if (value === null || value <= 0 || Number.isNaN(value)) return 0;

  const normalizedValue = toHundredths(value);

  if (table.betterIsHigher) {
    if (normalizedValue >= table.max) return 25;
    if (normalizedValue < table.min) return 0;
  } else {
    if (normalizedValue <= table.min) return 25;
    if (normalizedValue > table.max) return 0;
  }

  const point = table.points[normalizedValue - table.min];
  return point === undefined ? 0 : Number((point / 100).toFixed(2));
}

export function calculatePoints(scores: ScoreSet, gender: StudentGender): ScorePoints {
  const genderTables = SCORE_TABLES[gender];

  const hundred = pointFromTable(scores.hundred, genderTables.hundred);
  const shotPut = pointFromTable(scores.shotPut, genderTables.shotPut);
  const tripleJump = pointFromTable(scores.tripleJump, genderTables.tripleJump);
  const eightHundred = pointFromTable(scores.eightHundred, genderTables.eightHundred);

  return {
    hundred,
    shotPut,
    tripleJump,
    eightHundred,
    total: Number((hundred + shotPut + tripleJump + eightHundred).toFixed(2)),
  };
}

export function calculateSingleEventPoint(
  value: number | null,
  gender: StudentGender,
  event: ScoreEventKey,
): number {
  return pointFromTable(value, SCORE_TABLES[gender][event]);
}

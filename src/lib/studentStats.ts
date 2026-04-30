import { TestRecord } from '../types';

export interface StudentBestScores {
  hundred: number | null;
  shotPut: number | null;
  tripleJump: number | null;
  eightHundred: number | null;
  total: number | null;
}

function validScore(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function minValid(values: Array<number | null>): number | null {
  const validValues = values.filter(validScore);
  return validValues.length > 0 ? Math.min(...validValues) : null;
}

function maxValid(values: Array<number | null>): number | null {
  const validValues = values.filter(validScore);
  return validValues.length > 0 ? Math.max(...validValues) : null;
}

export function getStudentBestScores(records: TestRecord[]): StudentBestScores {
  const validTotals = records
    .map(record => record.points.total)
    .filter(Number.isFinite);

  return {
    hundred: minValid(records.map(record => record.scores.hundred)),
    shotPut: maxValid(records.map(record => record.scores.shotPut)),
    tripleJump: maxValid(records.map(record => record.scores.tripleJump)),
    eightHundred: minValid(records.map(record => record.scores.eightHundred)),
    total: validTotals.length > 0 ? Math.max(...validTotals) : null,
  };
}

import assert from 'node:assert/strict';
import { calculatePoints } from './scoring';
import { ScoreSet, StudentGender } from '../types';

const emptyScores: ScoreSet = {
  hundred: null,
  shotPut: null,
  tripleJump: null,
  eightHundred: null,
};

function pointsFor(
  gender: StudentGender,
  scores: Partial<ScoreSet>,
) {
  return calculatePoints({ ...emptyScores, ...scores }, gender);
}

function assertEqual(actual: number, expected: number, label: string) {
  assert.equal(actual, expected, label);
}

assertEqual(pointsFor('male', { hundred: 11.54 }).hundred, 25, 'male 100m full-score line');
assertEqual(pointsFor('male', { hundred: 15.00 }).hundred, 2.04, 'male 100m lower table line');
assertEqual(pointsFor('female', { hundred: 18.00 }).hundred, 9.54, 'female 100m lower table line');

assertEqual(pointsFor('male', { tripleJump: 6.00 }).tripleJump, 2.25, 'male triple jump lower table line');
assertEqual(pointsFor('female', { tripleJump: 4.20 }).tripleJump, 0.34, 'female triple jump lower table line');

assertEqual(pointsFor('male', { shotPut: 5.00 }).shotPut, 3.88, 'male shot put lower table line');
assertEqual(pointsFor('female', { shotPut: 2.80 }).shotPut, 2.46, 'female shot put lower table line');

assertEqual(pointsFor('male', { eightHundred: 183.00 }).eightHundred, 3.67, 'male 800m lower table line');
assertEqual(pointsFor('female', { eightHundred: 236.00 }).eightHundred, 1.18, 'female 800m lower table line');

assertEqual(pointsFor('male', { hundred: 11.40 }).hundred, 25, 'better than full-score line keeps full score');
assertEqual(pointsFor('male', { hundred: 15.01 }).hundred, 0, 'worse than table floor scores zero');

const total = pointsFor('male', {
  hundred: 12.00,
  shotPut: 10.00,
  tripleJump: 8.00,
  eightHundred: 135.00,
}).total;
assertEqual(total, 77.98, 'total sums PDF table scores');

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StudentGender = 'male' | 'female';

export interface ScoreSet {
  hundred: number | null; // Best result
  hundredAttempts?: (number | null)[];
  shotPut: number | null; // Best result
  shotPutAttempts?: (number | null)[];
  tripleJump: number | null; // Best result
  tripleJumpAttempts?: (number | null)[];
  eightHundred: number | null; // Best result
  eightHundredAttempts?: (number | null)[];
}

export interface ScorePoints {
  hundred: number;
  shotPut: number;
  tripleJump: number;
  eightHundred: number;
  total: number;
}

export interface TestRecord {
  id: string;
  date: string; // YYYY-MM-DD
  scores: ScoreSet;
  points: ScorePoints;
}

export interface Student {
  id: string;
  studentNo: string;
  name: string;
  gender: StudentGender;
  yearId: string;
}

export interface AcademicYear {
  id: string;
  name: string; // e.g. "2025"
}

export interface AppData {
  years: AcademicYear[];
  students: Student[];
  records: Record<string, TestRecord[]>; // studentId -> records
}

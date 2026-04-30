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
  testSessionId?: string;
  testName?: string;
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

export type SportEventKey = 'hundred' | 'shotPut' | 'tripleJump' | 'eightHundred';

export type GroupingMode = 'size' | 'count';
export type TestSessionGroupGender = StudentGender | 'mixed';

export interface TestSessionGroupMember {
  studentId: string;
  lane?: number;
  order?: number;
  rank?: number;
  note?: string;
}

export interface TestSessionGroup {
  id: string;
  name: string;
  marker?: string;
  startTime?: string;
  gender: TestSessionGroupGender;
  members: TestSessionGroupMember[];
}

export interface TestSessionGroupingVersion {
  id: string;
  name: string;
  event: SportEventKey;
  createdAt: string;
  source: 'generated' | 'imported';
  mode: GroupingMode;
  groupSize?: number;
  groupCount?: number;
  groups: TestSessionGroup[];
}

export interface GroupScheduleConfig {
  startTime: string;
  intervalMinutes: number;
}

export interface TestSession {
  id: string;
  name: string;
  date: string;
  yearId: string;
  absentStudentIds?: string[];
  activeVersionIds: Partial<Record<SportEventKey, string>>;
  entryVersionIds: Partial<Record<SportEventKey, string>>;
  groupingVersions: Record<SportEventKey, TestSessionGroupingVersion[]>;
  trialConfigs: Record<SportEventKey, number>;
  groupScheduleConfigs: Partial<Record<SportEventKey, GroupScheduleConfig>>;
}

export interface AppData {
  years: AcademicYear[];
  students: Student[];
  records: Record<string, TestRecord[]>; // studentId -> records
  testSessions: TestSession[];
}

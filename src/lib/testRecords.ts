import { Student, TestRecord, TestSession } from '../types';

export interface RecordTarget {
  date: string;
  testSessionId?: string;
  testName?: string;
}

export interface RankTestOption {
  key: string;
  label: string;
  date: string;
  count: number;
}

export function getRecordTestKey(record: TestRecord): string {
  return record.testSessionId ? `session:${record.testSessionId}` : `date:${record.date}`;
}

export function isSameRecordTarget(record: TestRecord, target: RecordTarget): boolean {
  if (target.testSessionId) {
    return record.testSessionId === target.testSessionId;
  }
  if (record.testSessionId) return false;
  return record.date === target.date;
}

export function recordMatchesTestKey(record: TestRecord, key: string): boolean {
  return getRecordTestKey(record) === key;
}

export function buildRankTestOptions(
  records: Record<string, TestRecord[]>,
  students: Student[],
  testSessions: TestSession[] = [],
): RankTestOption[] {
  const studentIds = new Set(students.map(student => student.id));
  const sessionsById = new Map(testSessions.map(session => [session.id, session]));
  const options = new Map<string, RankTestOption>();
  const countedStudentIds = new Map<string, Set<string>>();

  Object.entries(records).forEach(([studentId, studentRecords]) => {
    if (!studentIds.has(studentId)) return;

    studentRecords.forEach(record => {
      const key = getRecordTestKey(record);
      const session = record.testSessionId ? sessionsById.get(record.testSessionId) : undefined;
      const label = session
        ? `${session.name} · ${session.date}`
        : record.testName
          ? `${record.testName} · ${record.date}`
          : `${record.date} 测试`;

      if (!options.has(key)) {
        options.set(key, {
          key,
          label,
          date: session?.date || record.date,
          count: 0,
        });
        countedStudentIds.set(key, new Set());
      }

      const counted = countedStudentIds.get(key)!;
      if (!counted.has(studentId)) {
        counted.add(studentId);
        options.get(key)!.count += 1;
      }
    });
  });

  return Array.from(options.values()).sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    return dateCompare !== 0 ? dateCompare : a.label.localeCompare(b.label);
  });
}

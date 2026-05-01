import {
  ScorePoints,
  ScoreSet,
  SportEventKey,
  Student,
  TestRecord,
  TestSession,
  TestSessionGroup,
} from '../types';
import { buildRankTestOptions, getRecordTestKey, isSameRecordTarget, RecordTarget } from './testRecords';

export const ANALYSIS_EVENTS: Array<{ id: SportEventKey; label: string; lowerBetter: boolean }> = [
  { id: 'hundred', label: '100米', lowerBetter: true },
  { id: 'shotPut', label: '铅球', lowerBetter: false },
  { id: 'tripleJump', label: '三级跳', lowerBetter: false },
  { id: 'eightHundred', label: '800米', lowerBetter: true },
];

export interface EventAnalysisStat {
  event: SportEventKey;
  label: string;
  completedCount: number;
  averageRaw: number | null;
  bestRaw: number | null;
  worstRaw: number | null;
  averagePoint: number;
}

export interface StudentChangeItem {
  student: Student;
  firstTotal: number;
  latestTotal: number;
  change: number;
}

export interface StudentVolatilityItem {
  student: Student;
  range: number;
  minTotal: number;
  maxTotal: number;
}

export interface StudentFastImproverItem {
  student: Student;
  change: number;
  fromDate: string;
  toDate: string;
}

export interface TestTrendPoint {
  key: string;
  label: string;
  date: string;
  averageTotal: number;
  average?: number;
  recordedCount: number;
}

export interface ScoreDistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface TestAnalysisSnapshot {
  key: string;
  label: string;
  date: string;
  recordedCount: number;
  average: number | null;
  max: number | null;
  min: number | null;
  mode: number | null;
  distribution: ScoreDistributionBucket[];
  progressBoard: StudentChangeItem[];
  regressionBoard: StudentChangeItem[];
}

export interface SingleEventPerformanceAnalysis {
  event: SportEventKey;
  label: string;
  trend: TestTrendPoint[];
  testAnalyses: TestAnalysisSnapshot[];
  fastestImprovers: StudentFastImproverItem[];
  continuousDeclines: StudentChangeItem[];
  highVolatility: StudentVolatilityItem[];
}

export interface OverallPerformanceAnalysis {
  summary: {
    studentCount: number;
    recordedStudentCount: number;
    recordCount: number;
    averageTotal: number | null;
    maxTotal: number | null;
    minTotal: number | null;
    modeTotal: number | null;
  };
  latestTest: TestTrendPoint | null;
  trend: TestTrendPoint[];
  testAnalyses: TestAnalysisSnapshot[];
  distribution: ScoreDistributionBucket[];
  eventStats: EventAnalysisStat[];
  allEventStats: EventAnalysisStat[];
  weakestEvent: EventAnalysisStat | null;
  overallWeakestEvent: EventAnalysisStat | null;
  progressLeaders: StudentChangeItem[];
  regressionLeaders: StudentChangeItem[];
  continuousDeclines: StudentChangeItem[];
  highVolatility: StudentVolatilityItem[];
  fastestImprovers: StudentFastImproverItem[];
}

export interface GroupPerformanceAnalysis {
  summary: {
    memberCount: number;
    recordedCount: number;
    averageTotal: number | null;
    maxTotal: number | null;
    minTotal: number | null;
    averageEventPoint: number | null;
  };
  eventStats: EventAnalysisStat[];
  weakestEvent: EventAnalysisStat | null;
  bestPerformer: { student: Student; record: TestRecord } | null;
  eventBest: { student: Student; record: TestRecord; value: number } | null;
  progressLeaders: StudentChangeItem[];
  regressionLeaders: StudentChangeItem[];
}

interface GroupAnalysisOptions {
  group: TestSessionGroup;
  students: Student[];
  records: Record<string, TestRecord[]>;
  target: RecordTarget;
  event: SportEventKey;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function isValidScore(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasRecordedScore(record: TestRecord): boolean {
  return ANALYSIS_EVENTS.some(event => isValidScore(record.scores[event.id]));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => {
    const countCompare = b[1] - a[1];
    return countCompare !== 0 ? countCompare : a[0] - b[0];
  })[0][0];
}

function getRecordSortValue(record: TestRecord, index: number): string {
  return `${record.date}#${record.testSessionId || ''}#${record.id || index}`;
}

function getSortedRecords(records: TestRecord[]): TestRecord[] {
  return [...records].sort((a, b) => getRecordSortValue(a, 0).localeCompare(getRecordSortValue(b, 0)));
}

function latestRecordsForKey(
  records: Record<string, TestRecord[]>,
  students: Student[],
  key: string,
): Array<{ student: Student; record: TestRecord }> {
  return students.flatMap(student => {
    const record = (records[student.id] || []).find(item => getRecordTestKey(item) === key);
    return record ? [{ student, record }] : [];
  });
}

function buildEventStats(items: Array<{ record: TestRecord }>): EventAnalysisStat[] {
  return ANALYSIS_EVENTS.map(event => {
    const rawValues = items
      .map(item => item.record.scores[event.id])
      .filter(isValidScore);
    const pointValues = items
      .map(item => item.record.points[event.id as keyof ScorePoints])
      .filter(value => Number.isFinite(value));

    let bestRaw: number | null = null;
    let worstRaw: number | null = null;
    if (rawValues.length > 0) {
      bestRaw = event.lowerBetter ? Math.min(...rawValues) : Math.max(...rawValues);
      worstRaw = event.lowerBetter ? Math.max(...rawValues) : Math.min(...rawValues);
    }

    return {
      event: event.id,
      label: event.label,
      completedCount: rawValues.length,
      averageRaw: average(rawValues),
      bestRaw,
      worstRaw,
      averagePoint: average(pointValues) ?? 0,
    };
  });
}

function weakestEvent(eventStats: EventAnalysisStat[]): EventAnalysisStat | null {
  if (eventStats.length === 0) return null;
  return [...eventStats].sort((a, b) => a.averagePoint - b.averagePoint)[0] || null;
}

function buildTrend(
  records: Record<string, TestRecord[]>,
  students: Student[],
  testSessions: TestSession[] = [],
): TestTrendPoint[] {
  return buildRankTestOptions(records, students, testSessions)
    .map(option => {
      const items = latestRecordsForKey(records, students, option.key)
        .filter(item => hasRecordedScore(item.record));
      const totals = items.map(item => item.record.points.total).filter(Number.isFinite);
      return {
        key: option.key,
        label: option.label,
        date: option.date,
        averageTotal: average(totals) ?? 0,
        recordedCount: totals.length,
      };
    })
    .filter(point => point.recordedCount > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

function buildDistribution(latestTotals: number[]): ScoreDistributionBucket[] {
  const buckets: ScoreDistributionBucket[] = [
    { label: '0-60', min: 0, max: 60, count: 0 },
    { label: '60-70', min: 60, max: 70, count: 0 },
    { label: '70-80', min: 70, max: 80, count: 0 },
    { label: '80-90', min: 80, max: 90, count: 0 },
    { label: '90-100', min: 90, max: 100, count: 0 },
  ];

  latestTotals.forEach(total => {
    const bucket = buckets.find(item => total >= item.min && (total < item.max || item.max === 100));
    if (bucket) bucket.count += 1;
  });

  return buckets;
}

function getSortedTestOptions(
  records: Record<string, TestRecord[]>,
  students: Student[],
  testSessions: TestSession[] = [],
) {
  return buildRankTestOptions(records, students, testSessions)
    .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

function valueFromRecord(record: TestRecord, event?: SportEventKey): number {
  return event ? round(record.points[event] * 4) : record.points.total;
}

function hasAnalysisValue(record: TestRecord, event?: SportEventKey): boolean {
  return event ? isValidScore(record.scores[event]) : hasRecordedScore(record);
}

function buildPerTestAnalyses(
  records: Record<string, TestRecord[]>,
  students: Student[],
  testSessions: TestSession[] = [],
  event?: SportEventKey,
): TestAnalysisSnapshot[] {
  const options = getSortedTestOptions(records, students, testSessions);

  return options.map((option, optionIndex) => {
    const items = latestRecordsForKey(records, students, option.key)
      .filter(item => hasAnalysisValue(item.record, event));
    const values = items
      .map(item => valueFromRecord(item.record, event))
      .filter(Number.isFinite);
    const previousOption = optionIndex > 0 ? options[optionIndex - 1] : null;
    const previousItems = previousOption
      ? latestRecordsForKey(records, students, previousOption.key).filter(item => hasAnalysisValue(item.record, event))
      : [];
    const previousByStudentId = new Map(previousItems.map(item => [item.student.id, item.record]));
    const changes = previousOption
      ? items.flatMap(item => {
          const previous = previousByStudentId.get(item.student.id);
          if (!previous) return [];
          return [{
            student: item.student,
            firstTotal: valueFromRecord(previous, event),
            latestTotal: valueFromRecord(item.record, event),
            change: round(valueFromRecord(item.record, event) - valueFromRecord(previous, event)),
          }];
        })
      : [];

    return {
      key: option.key,
      label: option.label,
      date: option.date,
      recordedCount: values.length,
      average: average(values),
      max: values.length > 0 ? Math.max(...values) : null,
      min: values.length > 0 ? Math.min(...values) : null,
      mode: mode(values),
      distribution: buildDistribution(values),
      progressBoard: changes.filter(item => item.change > 0).sort((a, b) => b.change - a.change).slice(0, 10),
      regressionBoard: changes.filter(item => item.change < 0).sort((a, b) => a.change - b.change).slice(0, 10),
    };
  }).filter(item => item.recordedCount > 0);
}

function buildOverallEventStats(
  records: Record<string, TestRecord[]>,
  students: Student[],
): EventAnalysisStat[] {
  const studentIds = new Set(students.map(student => student.id));
  const items = Object.entries(records).flatMap(([studentId, studentRecords]) => (
    studentIds.has(studentId) ? studentRecords.map(record => ({ record })) : []
  ));
  return buildEventStats(items);
}

function buildStudentChangesForEvent(
  students: Student[],
  records: Record<string, TestRecord[]>,
  event: SportEventKey,
): StudentChangeItem[] {
  return students.flatMap(student => {
    const studentRecords = getSortedRecords(records[student.id] || [])
      .filter(record => isValidScore(record.scores[event]) && Number.isFinite(record.points[event]));
    if (studentRecords.length < 2) return [];
    const first = studentRecords[0];
    const latest = studentRecords[studentRecords.length - 1];
    return [{
      student,
      firstTotal: round(first.points[event] * 4),
      latestTotal: round(latest.points[event] * 4),
      change: round((latest.points[event] - first.points[event]) * 4),
    }];
  });
}

function buildContinuousDeclinesForEvent(students: Student[], records: Record<string, TestRecord[]>, event: SportEventKey): StudentChangeItem[] {
  return students.flatMap(student => {
    const studentRecords = getSortedRecords(records[student.id] || [])
      .filter(record => isValidScore(record.scores[event]) && Number.isFinite(record.points[event]));
    if (studentRecords.length < 3) return [];
    const latestThree = studentRecords.slice(-3);
    const values = latestThree.map(record => round(record.points[event] * 4));
    const declined = values[0] > values[1] && values[1] > values[2];
    if (!declined) return [];
    return [{
      student,
      firstTotal: values[0],
      latestTotal: values[2],
      change: round(values[2] - values[0]),
    }];
  }).sort((a, b) => a.change - b.change);
}

function buildHighVolatilityForEvent(students: Student[], records: Record<string, TestRecord[]>, event: SportEventKey): StudentVolatilityItem[] {
  return students.flatMap(student => {
    const values = (records[student.id] || [])
      .filter(record => isValidScore(record.scores[event]))
      .map(record => round(record.points[event] * 4))
      .filter(Number.isFinite);
    if (values.length < 2) return [];
    const minTotal = Math.min(...values);
    const maxTotal = Math.max(...values);
    const range = round(maxTotal - minTotal);
    return range > 0 ? [{ student, range, minTotal, maxTotal }] : [];
  }).sort((a, b) => b.range - a.range).slice(0, 8);
}

function buildFastestImproversForEvent(students: Student[], records: Record<string, TestRecord[]>, event: SportEventKey): StudentFastImproverItem[] {
  return students.flatMap(student => {
    const studentRecords = getSortedRecords(records[student.id] || [])
      .filter(record => isValidScore(record.scores[event]) && Number.isFinite(record.points[event]));
    if (studentRecords.length < 2) return [];

    let best: StudentFastImproverItem | null = null;
    for (let index = 1; index < studentRecords.length; index += 1) {
      const previous = studentRecords[index - 1];
      const current = studentRecords[index];
      const change = round((current.points[event] - previous.points[event]) * 4);
      if (change <= 0) continue;
      if (!best || change > best.change) {
        best = {
          student,
          change,
          fromDate: previous.date,
          toDate: current.date,
        };
      }
    }
    return best ? [best] : [];
  }).sort((a, b) => b.change - a.change).slice(0, 8);
}

function buildStudentChanges(students: Student[], records: Record<string, TestRecord[]>): StudentChangeItem[] {
  return students.flatMap(student => {
    const studentRecords = getSortedRecords(records[student.id] || [])
      .filter(record => hasRecordedScore(record) && Number.isFinite(record.points.total));
    if (studentRecords.length < 2) return [];
    const first = studentRecords[0];
    const latest = studentRecords[studentRecords.length - 1];
    return [{
      student,
      firstTotal: first.points.total,
      latestTotal: latest.points.total,
      change: round(latest.points.total - first.points.total),
    }];
  });
}

function buildContinuousDeclines(students: Student[], records: Record<string, TestRecord[]>): StudentChangeItem[] {
  return students.flatMap(student => {
    const studentRecords = getSortedRecords(records[student.id] || [])
      .filter(record => hasRecordedScore(record) && Number.isFinite(record.points.total));
    if (studentRecords.length < 3) return [];
    const latestThree = studentRecords.slice(-3);
    const declined = latestThree[0].points.total > latestThree[1].points.total &&
      latestThree[1].points.total > latestThree[2].points.total;
    if (!declined) return [];
    return [{
      student,
      firstTotal: latestThree[0].points.total,
      latestTotal: latestThree[2].points.total,
      change: round(latestThree[2].points.total - latestThree[0].points.total),
    }];
  }).sort((a, b) => a.change - b.change);
}

function buildHighVolatility(students: Student[], records: Record<string, TestRecord[]>): StudentVolatilityItem[] {
  return students.flatMap(student => {
    const totals = (records[student.id] || [])
      .filter(hasRecordedScore)
      .map(record => record.points.total)
      .filter(Number.isFinite);
    if (totals.length < 2) return [];
    const minTotal = Math.min(...totals);
    const maxTotal = Math.max(...totals);
    const range = round(maxTotal - minTotal);
    return range > 0 ? [{ student, range, minTotal, maxTotal }] : [];
  }).sort((a, b) => b.range - a.range).slice(0, 8);
}

function buildFastestImprovers(students: Student[], records: Record<string, TestRecord[]>): StudentFastImproverItem[] {
  return students.flatMap(student => {
    const studentRecords = getSortedRecords(records[student.id] || [])
      .filter(record => hasRecordedScore(record) && Number.isFinite(record.points.total));
    if (studentRecords.length < 2) return [];

    let best: StudentFastImproverItem | null = null;
    for (let index = 1; index < studentRecords.length; index += 1) {
      const previous = studentRecords[index - 1];
      const current = studentRecords[index];
      const change = round(current.points.total - previous.points.total);
      if (change <= 0) continue;
      if (!best || change > best.change) {
        best = {
          student,
          change,
          fromDate: previous.date,
          toDate: current.date,
        };
      }
    }
    return best ? [best] : [];
  }).sort((a, b) => b.change - a.change).slice(0, 8);
}

export function buildOverallPerformanceAnalysis(
  students: Student[],
  records: Record<string, TestRecord[]>,
  testSessions: TestSession[] = [],
): OverallPerformanceAnalysis {
  const trend = buildTrend(records, students, testSessions);
  const testAnalyses = buildPerTestAnalyses(records, students, testSessions);
  const latestTest = trend[trend.length - 1] || null;
  const latestItems = latestTest ? latestRecordsForKey(records, students, latestTest.key).filter(item => hasRecordedScore(item.record)) : [];
  const latestTotals = latestItems.map(item => item.record.points.total).filter(Number.isFinite);
  const allRecordCount = students.reduce((count, student) => count + (records[student.id] || []).filter(hasRecordedScore).length, 0);
  const eventStats = buildEventStats(latestItems);
  const allEventStats = buildOverallEventStats(records, students);
  const changes = buildStudentChanges(students, records);

  return {
    summary: {
      studentCount: students.length,
      recordedStudentCount: latestItems.length,
      recordCount: allRecordCount,
      averageTotal: average(latestTotals),
      maxTotal: latestTotals.length > 0 ? Math.max(...latestTotals) : null,
      minTotal: latestTotals.length > 0 ? Math.min(...latestTotals) : null,
      modeTotal: mode(latestTotals),
    },
    latestTest,
    trend,
    testAnalyses,
    distribution: buildDistribution(latestTotals),
    eventStats,
    allEventStats,
    weakestEvent: weakestEvent(eventStats),
    overallWeakestEvent: weakestEvent(allEventStats),
    progressLeaders: changes.filter(item => item.change > 0).sort((a, b) => b.change - a.change).slice(0, 8),
    regressionLeaders: changes.filter(item => item.change < 0).sort((a, b) => a.change - b.change).slice(0, 8),
    continuousDeclines: buildContinuousDeclines(students, records),
    highVolatility: buildHighVolatility(students, records),
    fastestImprovers: buildFastestImprovers(students, records),
  };
}

export function buildSingleEventPerformanceAnalysis(
  students: Student[],
  records: Record<string, TestRecord[]>,
  event: SportEventKey,
  testSessions: TestSession[] = [],
): SingleEventPerformanceAnalysis {
  const eventConfig = ANALYSIS_EVENTS.find(item => item.id === event)!;
  const testAnalyses = buildPerTestAnalyses(records, students, testSessions, event);
  return {
    event,
    label: eventConfig.label,
    trend: testAnalyses.map(item => ({
      key: item.key,
      label: item.label,
      date: item.date,
      averageTotal: item.average ?? 0,
      average: item.average ?? 0,
      recordedCount: item.recordedCount,
    })),
    testAnalyses,
    fastestImprovers: buildFastestImproversForEvent(students, records, event),
    continuousDeclines: buildContinuousDeclinesForEvent(students, records, event),
    highVolatility: buildHighVolatilityForEvent(students, records, event),
  };
}

function findCurrentRecord(records: TestRecord[], target: RecordTarget): TestRecord | undefined {
  return records.find(record => isSameRecordTarget(record, target));
}

function findPreviousRecord(records: TestRecord[], target: RecordTarget): TestRecord | undefined {
  const sorted = getSortedRecords(records);
  const currentIndex = sorted.findIndex(record => isSameRecordTarget(record, target));
  if (currentIndex > 0) return sorted[currentIndex - 1];
  return [...sorted].reverse().find(record => !isSameRecordTarget(record, target) && record.date <= target.date);
}

export function buildGroupPerformanceAnalysis({
  group,
  students,
  records,
  target,
  event,
}: GroupAnalysisOptions): GroupPerformanceAnalysis {
  const studentsById = new Map(students.map(student => [student.id, student]));
  const memberItems = group.members.flatMap(member => {
    const student = studentsById.get(member.studentId);
    if (!student) return [];
    const record = findCurrentRecord(records[student.id] || [], target);
    return record && hasRecordedScore(record) ? [{ student, record }] : [];
  });
  const totals = memberItems.map(item => item.record.points.total).filter(Number.isFinite);
  const eventPoints = memberItems.map(item => item.record.points[event]).filter(Number.isFinite);
  const eventStats = buildEventStats(memberItems);
  const eventConfig = ANALYSIS_EVENTS.find(item => item.id === event)!;
  const eventValues = memberItems
    .map(item => ({ ...item, value: item.record.scores[event] }))
    .filter((item): item is { student: Student; record: TestRecord; value: number } => isValidScore(item.value));
  const eventBest = eventValues.length > 0
    ? [...eventValues].sort((a, b) => eventConfig.lowerBetter ? a.value - b.value : b.value - a.value)[0]
    : null;

  const changes = group.members.flatMap(member => {
    const student = studentsById.get(member.studentId);
    if (!student) return [];
    const studentRecords = records[student.id] || [];
    const current = findCurrentRecord(studentRecords, target);
    const previous = findPreviousRecord(studentRecords, target);
    if (!current || !previous || !hasRecordedScore(current) || !hasRecordedScore(previous)) return [];
    return [{
      student,
      firstTotal: previous.points.total,
      latestTotal: current.points.total,
      change: round(current.points.total - previous.points.total),
    }];
  });

  return {
    summary: {
      memberCount: group.members.length,
      recordedCount: memberItems.length,
      averageTotal: average(totals),
      maxTotal: totals.length > 0 ? Math.max(...totals) : null,
      minTotal: totals.length > 0 ? Math.min(...totals) : null,
      averageEventPoint: average(eventPoints),
    },
    eventStats,
    weakestEvent: weakestEvent(eventStats),
    bestPerformer: memberItems.length > 0
      ? [...memberItems].sort((a, b) => b.record.points.total - a.record.points.total)[0]
      : null,
    eventBest,
    progressLeaders: changes.filter(item => item.change > 0).sort((a, b) => b.change - a.change).slice(0, 5),
    regressionLeaders: changes.filter(item => item.change < 0).sort((a, b) => a.change - b.change).slice(0, 5),
  };
}

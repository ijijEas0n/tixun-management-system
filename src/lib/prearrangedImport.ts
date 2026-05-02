import {
  AppData,
  SportEventKey,
  Student,
  StudentGender,
  TestSession,
  TestSessionGroup,
  TestSessionGroupGender,
  TestSessionGroupingVersion,
} from '../types';
import { createDefaultTrialConfigs, createEmptyGroupingVersions, getEventLabel } from './grouping';

type SheetMatrix = unknown[][];
type WorkbookMatrices = Record<string, SheetMatrix>;

interface ParsePrearrangedWorkbookOptions {
  fileName: string;
  yearId: string;
  now?: string;
}

interface EventSummary {
  groups: number;
  students: number;
}

export interface PrearrangedImportResult {
  students: Student[];
  testSession: TestSession;
  summary: {
    fileName: string;
    sessionName: string;
    date: string;
    studentCount: number;
    eventSummaries: Partial<Record<SportEventKey, EventSummary>>;
    warnings: string[];
  };
}

export type PrearrangedStudentImportMode = 'appendMissing' | 'linkOnly' | 'replaceYear';

interface HeaderMap {
  time: number;
  laneOrArea?: number;
  order?: number;
  rank?: number;
  name: number;
  studentNo?: number;
  gender?: number;
}

const EVENT_ORDER: SportEventKey[] = ['hundred', 'shotPut', 'tripleJump', 'eightHundred'];

const CHINESE_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const hours = value.getUTCHours();
    const minutes = value.getUTCMinutes();
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return String(value).trim();
}

function normalizeTime(value: unknown): string {
  const text = cellText(value);
  if (!text || text === '时间') return '';
  const match = text.match(/(\d{1,2})[:：](\d{1,2})/);
  if (!match) return '';
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseNumber(value: unknown): number | undefined {
  const text = cellText(value);
  if (!text) return undefined;
  const numericText = text.replace(/[^\d.-]/g, '');
  if (!numericText) return undefined;
  const numeric = Number(numericText);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseLane(value: unknown): number | undefined {
  const text = cellText(value);
  const numeric = parseNumber(text);
  if (numeric !== undefined) return numeric;
  const match = text.match(/[一二三四五六七八九十]/);
  return match ? CHINESE_DIGITS[match[0]] : undefined;
}

function parseGender(value: unknown): StudentGender | undefined {
  const text = cellText(value);
  if (!text) return undefined;
  if (text.includes('女') || /^f(emale)?$/i.test(text)) return 'female';
  if (text.includes('男') || /^m(ale)?$/i.test(text)) return 'male';
  return undefined;
}

function getEventBySheetName(sheetName: string): SportEventKey | undefined {
  if (/百米|100/i.test(sheetName)) return 'hundred';
  if (/铅球/.test(sheetName)) return 'shotPut';
  if (/三级跳/.test(sheetName)) return 'tripleJump';
  if (/800|八百/i.test(sheetName)) return 'eightHundred';
  return undefined;
}

function findHeaderMap(row: unknown[]): HeaderMap | null {
  const labels = row.map(cellText);
  const time = labels.findIndex(label => label === '时间');
  const name = labels.findIndex(label => label === '姓名' || /^name$/i.test(label));
  if (time < 0 || name < 0) return null;

  return {
    time,
    name,
    laneOrArea: labels.findIndex(label => ['道次', '跑道', '投掷区', '区域'].includes(label)),
    order: labels.findIndex(label => ['顺序', '排序', '出场顺序'].includes(label)),
    rank: labels.findIndex(label => ['排名', '名次'].includes(label)),
    studentNo: labels.findIndex(label => ['序号', '编号', '学号', '学号/编号'].includes(label)),
    gender: labels.findIndex(label => ['性别', '男女'].includes(label)),
  };
}

function inferDateFromFileName(fileName: string): string {
  const match = fileName.match(/(20\d{2})[.\-_/年](\d{1,2})[.\-_/月](\d{1,2})/);
  if (!match) return new Date().toISOString().split('T')[0];
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || '导入测试';
}

function makeStudentKey(studentNo: string, name: string): string {
  return `${studentNo || 'no-number'}:${name || 'no-name'}`;
}

function makeStudentId(yearId: string, studentNo: string, name: string): string {
  const key = makeStudentKey(studentNo, name);
  return `import-${yearId}-${encodeURIComponent(key)}`;
}

function makeVersionId(event: SportEventKey, sessionId: string): string {
  return `${sessionId}-${event}-imported`;
}

function resolveGroupGender(event: SportEventKey, members: TestSessionGroup['members'], studentsById: Map<string, Student>): TestSessionGroupGender {
  if (event === 'eightHundred') return 'mixed';
  const genders = new Set(members.map(member => studentsById.get(member.studentId)?.gender).filter(Boolean));
  if (genders.size === 1) return Array.from(genders)[0] as StudentGender;
  return genders.size > 1 ? 'mixed' : 'male';
}

function minutesFromTime(time: string): number | null {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getUniformIntervalMinutes(groups: TestSessionGroup[]): number {
  if (groups.length < 2) return 0;
  const times = groups.map(group => minutesFromTime(group.startTime || ''));
  if (times.some(time => time === null)) return 0;
  const deltas = times.slice(1).map((time, index) => {
    const previous = times[index] as number;
    const current = time as number;
    return current >= previous ? current - previous : current + 1440 - previous;
  });
  return deltas.every(delta => delta === deltas[0]) ? deltas[0] : 0;
}

export function parsePrearrangedWorkbook(
  sheets: WorkbookMatrices,
  options: ParsePrearrangedWorkbookOptions,
): PrearrangedImportResult {
  const now = options.now || new Date().toISOString();
  const sessionName = stripExtension(options.fileName);
  const sessionDate = inferDateFromFileName(options.fileName);
  const sessionId = `prearranged-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const studentsByKey = new Map<string, Student>();
  const warnings: string[] = [];
  const groupingVersions = createEmptyGroupingVersions();
  const activeVersionIds: Partial<Record<SportEventKey, string>> = {};
  const entryVersionIds: Partial<Record<SportEventKey, string>> = {};
  const groupScheduleConfigs: TestSession['groupScheduleConfigs'] = {};

  Object.entries(sheets).forEach(([sheetName, rows]) => {
    if (getEventBySheetName(sheetName)) return;
    rows.forEach(row => {
      const name = cellText(row[0]);
      const studentNo = cellText(row[1]);
      if (!name || !studentNo || name === '姓名') return;
      const key = makeStudentKey(studentNo, name);
      if (studentsByKey.has(key)) return;
      studentsByKey.set(key, {
        id: makeStudentId(options.yearId, studentNo, name),
        studentNo,
        name,
        gender: 'male',
        yearId: options.yearId,
      });
    });
  });

  Object.entries(sheets).forEach(([sheetName, rows]) => {
    const event = getEventBySheetName(sheetName);
    if (!event) return;

    let header: HeaderMap | null = null;
    let currentGroup: TestSessionGroup | null = null;
    const groups: TestSessionGroup[] = [];

    rows.forEach((row, rowIndex) => {
      const nextHeader = findHeaderMap(row);
      if (nextHeader) {
        header = nextHeader;
        currentGroup = null;
        return;
      }
      if (!header) return;

      const name = cellText(row[header.name]);
      const studentNo = header.studentNo === undefined || header.studentNo < 0 ? '' : cellText(row[header.studentNo]);
      if (!name && !studentNo) return;

      const startTime = normalizeTime(row[header.time]);
      const marker = header.laneOrArea === undefined || header.laneOrArea < 0 ? '' : cellText(row[header.laneOrArea]);
      if (startTime || !currentGroup) {
        currentGroup = {
          id: `${event}-import-group-${groups.length + 1}`,
          name: `${getEventLabel(event)}第${groups.length + 1}组`,
          marker,
          startTime,
          gender: event === 'eightHundred' ? 'mixed' : 'male',
          members: [],
        };
        groups.push(currentGroup);
      } else if (!currentGroup.marker && marker) {
        currentGroup.marker = marker;
      }

      const gender = header.gender === undefined || header.gender < 0
        ? undefined
        : parseGender(row[header.gender]);
      const studentKey = makeStudentKey(studentNo, name);
      const existingStudent = studentsByKey.get(studentKey);
      const student = existingStudent
        ? (gender && existingStudent.gender !== gender ? { ...existingStudent, gender } : existingStudent)
        : {
            id: makeStudentId(options.yearId, studentNo, name),
            studentNo,
            name,
            gender: gender || 'male',
            yearId: options.yearId,
          };
      if (!existingStudent || student !== existingStudent) studentsByKey.set(studentKey, student);

      const order = header.order === undefined || header.order < 0
        ? event === 'hundred' ? parseLane(marker) : currentGroup.members.length + 1
        : parseNumber(row[header.order]);
      const rank = header.rank === undefined || header.rank < 0 ? undefined : parseNumber(row[header.rank]);
      currentGroup.members.push({
        studentId: student.id,
        lane: event === 'hundred' ? parseLane(marker) ?? currentGroup.members.length + 1 : undefined,
        order,
        rank,
      });

      if (!name) {
        warnings.push(`${sheetName} 第 ${rowIndex + 1} 行缺少姓名，已按编号导入。`);
      }
    });

    if (groups.length === 0) return;
    const studentsById = new Map(Array.from(studentsByKey.values()).map(student => [student.id, student]));
    const normalizedGroups = groups.map(group => ({
      ...group,
      gender: resolveGroupGender(event, group.members, studentsById),
    }));
    const versionId = makeVersionId(event, sessionId);
    const version: TestSessionGroupingVersion = {
      id: versionId,
      name: '预排导入版',
      event,
      createdAt: now,
      source: 'imported',
      mode: 'size',
      groups: normalizedGroups,
    };
    groupingVersions[event] = [version];
    activeVersionIds[event] = versionId;
    entryVersionIds[event] = versionId;
    groupScheduleConfigs[event] = {
      startTime: normalizedGroups[0].startTime || '',
      intervalMinutes: getUniformIntervalMinutes(normalizedGroups),
    };
  });

  const students = Array.from(studentsByKey.values()).sort((a, b) => {
    const noA = Number(a.studentNo);
    const noB = Number(b.studentNo);
    if (Number.isFinite(noA) && Number.isFinite(noB)) return noA - noB;
    return (a.studentNo || a.name).localeCompare(b.studentNo || b.name, 'zh-Hans-CN');
  });

  const eventSummaries = Object.fromEntries(EVENT_ORDER.flatMap(event => {
    const version = groupingVersions[event][0];
    if (!version) return [];
    return [[event, {
      groups: version.groups.length,
      students: version.groups.reduce((sum, group) => sum + group.members.length, 0),
    }]];
  })) as Partial<Record<SportEventKey, EventSummary>>;

  const testSession: TestSession = {
    id: sessionId,
    name: sessionName,
    date: sessionDate,
    yearId: options.yearId,
    absentStudentIds: [],
    activeVersionIds,
    entryVersionIds,
    groupingVersions,
    trialConfigs: createDefaultTrialConfigs(),
    groupScheduleConfigs,
  };

  return {
    students,
    testSession,
    summary: {
      fileName: options.fileName,
      sessionName,
      date: sessionDate,
      studentCount: students.length,
      eventSummaries,
      warnings,
    },
  };
}

export function replaceYearDataWithPrearrangedImport(
  data: AppData,
  yearId: string,
  importResult: PrearrangedImportResult,
): AppData {
  const removedStudentIds = new Set(data.students.filter(student => student.yearId === yearId).map(student => student.id));
  const records = { ...data.records };
  removedStudentIds.forEach(studentId => {
    delete records[studentId];
  });

  return {
    ...data,
    students: [
      ...data.students.filter(student => student.yearId !== yearId),
      ...importResult.students,
    ],
    records,
    testSessions: [
      ...data.testSessions.filter(session => session.yearId !== yearId),
      importResult.testSession,
    ],
  };
}

function findMatchingStudent(imported: Student, existingStudents: Student[]): Student | undefined {
  const exactMatch = existingStudents.find(student => (
    student.studentNo === imported.studentNo && student.name === imported.name
  ));
  if (exactMatch) return exactMatch;
  if (imported.studentNo) return undefined;

  const nameMatches = existingStudents.filter(student => student.name === imported.name);
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

function rewriteImportedSessionStudentIds(
  session: TestSession,
  idMap: Map<string, string>,
): TestSession {
  const groupingVersions = Object.fromEntries(EVENT_ORDER.map(event => [
    event,
    session.groupingVersions[event].map(version => ({
      ...version,
      groups: version.groups.map(group => ({
        ...group,
        members: group.members
          .map(member => {
            const studentId = idMap.get(member.studentId);
            return studentId ? { ...member, studentId } : null;
          })
          .filter((member): member is NonNullable<typeof member> => Boolean(member)),
      })),
    })),
  ])) as TestSession['groupingVersions'];

  return {
    ...session,
    groupingVersions,
  };
}

export function mergePrearrangedImportWithYearData(
  data: AppData,
  yearId: string,
  importResult: PrearrangedImportResult,
  mode: PrearrangedStudentImportMode = 'appendMissing',
): AppData {
  if (mode === 'replaceYear') {
    return replaceYearDataWithPrearrangedImport(data, yearId, importResult);
  }

  const existingYearStudents = data.students.filter(student => student.yearId === yearId);
  const idMap = new Map<string, string>();
  const newStudents: Student[] = [];

  importResult.students.forEach(importedStudent => {
    const matchingStudent = findMatchingStudent(importedStudent, existingYearStudents);
    if (matchingStudent) {
      idMap.set(importedStudent.id, matchingStudent.id);
      return;
    }

    if (mode === 'appendMissing') {
      idMap.set(importedStudent.id, importedStudent.id);
      newStudents.push(importedStudent);
    }
  });

  const rewrittenSession = rewriteImportedSessionStudentIds(importResult.testSession, idMap);

  return {
    ...data,
    students: [...data.students, ...newStudents],
    testSessions: [...data.testSessions, rewrittenSession],
  };
}

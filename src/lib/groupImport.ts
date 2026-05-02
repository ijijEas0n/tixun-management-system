import {
  SportEventKey,
  Student,
  TestSessionGroup,
  TestSessionGroupingVersion,
} from '../types';
import { generateId } from './id';

export interface GroupImportIssue {
  row: number;
  type: string;
  message: string;
  raw: unknown;
}

export interface GroupImportPreview {
  version?: TestSessionGroupingVersion;
  conflicts: GroupImportIssue[];
  errors: GroupImportIssue[];
  unmatched: GroupImportIssue[];
  lowConfidenceMatches: Array<{ row: number; studentId: string; name: string }>;
}

interface BuildGroupingImportPreviewOptions {
  event: SportEventKey;
  presentStudents: Student[];
  rows: Array<Record<string, unknown>>;
  versionName: string;
  now?: string;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function parsePositiveInteger(value: unknown): number | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function getRowValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return '';
}

function resolveStudent(
  row: Record<string, unknown>,
  rowNumber: number,
  studentsByNo: Map<string, Student>,
  studentsByName: Map<string, Student[]>,
  preview: Pick<GroupImportPreview, 'conflicts' | 'unmatched' | 'lowConfidenceMatches'>,
): Student | null {
  const studentNo = getRowValue(row, ['学号/编号', '学号', '编号']);
  const name = getRowValue(row, ['姓名', 'Name']);

  if (studentNo) {
    const student = studentsByNo.get(studentNo);
    if (!student) {
      preview.unmatched.push({
        row: rowNumber,
        type: 'STUDENT_NOT_FOUND',
        message: `未找到学号 ${studentNo} 对应的学生`,
        raw: row,
      });
      return null;
    }
    if (name && student.name !== name) {
      preview.conflicts.push({
        row: rowNumber,
        type: 'SAME_STUDENT_NO_DIFFERENT_NAME',
        message: `学号 ${studentNo} 对应 ${student.name}，导入行姓名为 ${name}`,
        raw: row,
      });
      return null;
    }
    return student;
  }

  if (!name) {
    preview.unmatched.push({
      row: rowNumber,
      type: 'MISSING_STUDENT_IDENTITY',
      message: '缺少姓名或学号',
      raw: row,
    });
    return null;
  }

  const matches = studentsByName.get(name) || [];
  if (matches.length === 0) {
    preview.unmatched.push({
      row: rowNumber,
      type: 'STUDENT_NOT_FOUND',
      message: `未找到姓名 ${name} 对应的学生`,
      raw: row,
    });
    return null;
  }
  if (matches.length > 1) {
    preview.conflicts.push({
      row: rowNumber,
      type: 'DUPLICATE_NAME_WITHOUT_STUDENT_NO',
      message: `姓名 ${name} 有多个学生，必须提供学号`,
      raw: row,
    });
    return null;
  }

  preview.lowConfidenceMatches.push({ row: rowNumber, studentId: matches[0].id, name });
  return matches[0];
}

export function buildGroupingImportPreview({
  event,
  presentStudents,
  rows,
  versionName,
  now = new Date().toISOString(),
}: BuildGroupingImportPreviewOptions): GroupImportPreview {
  const preview: GroupImportPreview = {
    conflicts: [],
    errors: [],
    unmatched: [],
    lowConfidenceMatches: [],
  };
  const studentsByNo = new Map(presentStudents.filter(student => student.studentNo).map(student => [student.studentNo, student]));
  const studentsByName = new Map<string, Student[]>();
  presentStudents.forEach(student => {
    studentsByName.set(student.name, [...(studentsByName.get(student.name) || []), student]);
  });

  const groups = new Map<string, TestSessionGroup>();
  const seenStudents = new Map<string, { groupName: string; row: number }>();
  const seenStudentsInGroup = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const groupName = getRowValue(row, ['组名', '组别', 'Group']);
    if (!groupName) {
      preview.errors.push({ row: rowNumber, type: 'MISSING_GROUP_NAME', message: '分组名不能为空', raw: row });
      return;
    }

    const student = resolveStudent(row, rowNumber, studentsByNo, studentsByName, preview);
    if (!student) return;

    const existingStudent = seenStudents.get(student.id);
    if (existingStudent) {
      preview.conflicts.push({
        row: rowNumber,
        type: 'DUPLICATE_STUDENT_IN_IMPORT',
        message: `${student.name} 已在第 ${existingStudent.row} 行导入到 ${existingStudent.groupName}`,
        raw: row,
      });
      return;
    }

    const groupKey = event === 'eightHundred' ? groupName : `${student.gender}:${groupName}`;
    const group = groups.get(groupKey) || {
      id: generateId('group'),
      name: groupName,
      marker: text(row['标记']),
      gender: event === 'eightHundred' ? 'mixed' : student.gender,
      members: [],
    };

    const inGroupKey = `${groupKey}:${student.id}`;
    if (seenStudentsInGroup.has(inGroupKey)) {
      preview.conflicts.push({
        row: rowNumber,
        type: 'DUPLICATE_STUDENT_IN_GROUP',
        message: `${student.name} 在同一分组中重复出现`,
        raw: row,
      });
      return;
    }

    const lane = parsePositiveInteger(row['跑道'] || row['道次']);
    const order = parsePositiveInteger(row['顺序'] || row['排序'] || row['出场顺序']);
    if (event === 'hundred' && lane !== undefined && !Number.isFinite(lane)) {
      preview.errors.push({ row: rowNumber, type: 'INVALID_LANE', message: '道次必须是正整数', raw: row });
      return;
    }
    if (event !== 'hundred' && order !== undefined && !Number.isFinite(order)) {
      preview.errors.push({ row: rowNumber, type: 'INVALID_ORDER', message: '顺序必须是正整数', raw: row });
      return;
    }

    group.members.push({
      studentId: student.id,
      lane: event === 'hundred' ? lane ?? group.members.length + 1 : undefined,
      order: event === 'hundred' ? group.members.length + 1 : order ?? group.members.length + 1,
    });
    groups.set(groupKey, group);
    seenStudents.set(student.id, { groupName, row: rowNumber });
    seenStudentsInGroup.add(inGroupKey);
  });

  if (preview.conflicts.length === 0 && preview.errors.length === 0 && preview.unmatched.length === 0 && groups.size > 0) {
    preview.version = {
      id: generateId('grouping'),
      name: versionName,
      event,
      createdAt: now,
      source: 'imported',
      mode: 'size',
      groups: Array.from(groups.values()),
    };
  }

  return preview;
}


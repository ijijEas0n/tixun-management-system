import { Student, StudentGender } from '../types';

type SheetMatrix = unknown[][];
type WorkbookMatrices = Record<string, SheetMatrix>;

export interface StudentImportRow {
  name: string;
  gender: StudentGender;
  studentNo?: string;
}

export type StudentImportConflictType =
  | 'DUPLICATE_STUDENT_NO'
  | 'DUPLICATE_NAME_WITHOUT_STUDENT_NO'
  | 'SAME_STUDENT_NO_DIFFERENT_NAME'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_GENDER';

export interface StudentImportReport {
  created: StudentImportRow[];
  updated: StudentImportRow[];
  skipped: Array<{ row: number; reason: string; raw: unknown }>;
  conflicts: Array<{ row: number; type: StudentImportConflictType; message: string; raw: unknown }>;
  errors: Array<{ row: number; message: string; raw: unknown }>;
}

const STUDENT_NO_HEADER_LABELS = ['序号', '编号', '学号', '学号/编号'];
const GENDER_HEADER_LABELS = ['性别', '男女', '男/女', '性别(男/女)'];

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isNameHeaderLabel(value: string): boolean {
  return value === '姓名' || /^name$/i.test(value);
}

function isReservedStudentName(value: string): boolean {
  return isNameHeaderLabel(value);
}

function parseGender(value: unknown): StudentGender | undefined {
  const text = cellText(value);
  if (text.includes('女') || /^f(emale)?$/i.test(text)) return 'female';
  if (text.includes('男') || /^m(ale)?$/i.test(text)) return 'male';
  return undefined;
}

function findHeaderIndexes(row: unknown[]) {
  const labels = row.map(cellText);
  const name = labels.findIndex(isNameHeaderLabel);
  if (name < 0) return null;
  const studentNo = labels.findIndex(label => STUDENT_NO_HEADER_LABELS.includes(label));
  const gender = labels.findIndex(label => GENDER_HEADER_LABELS.includes(label) || /^gender$/i.test(label));
  if (studentNo < 0 && gender < 0) return null;
  return {
    name,
    studentNo,
    gender,
  };
}

function looksLikeNoHeaderStudentRow(row: unknown[]): boolean {
  const name = cellText(row[0]);
  const secondCell = cellText(row[1]);
  if (!name || !secondCell) return false;
  if (isReservedStudentName(name)) return false;
  if ([...STUDENT_NO_HEADER_LABELS, ...GENDER_HEADER_LABELS].includes(secondCell)) return false;
  return /[\u4e00-\u9fa5A-Za-z]/.test(name);
}

export function parseStudentImportWorkbook(sheets: WorkbookMatrices): StudentImportRow[] {
  const seen = new Set<string>();
  const rows: StudentImportRow[] = [];

  Object.values(sheets).forEach(sheetRows => {
    let header: ReturnType<typeof findHeaderIndexes> = null;

    sheetRows.forEach(row => {
      const nextHeader = findHeaderIndexes(row);
      if (nextHeader) {
        header = nextHeader;
        return;
      }

      const name = header ? cellText(row[header.name]) : cellText(row[0]);
      const noHeaderSecondColumnGender = header ? undefined : parseGender(row[1]);
      const studentNo = header
        ? header.studentNo >= 0 ? cellText(row[header.studentNo]) : ''
        : noHeaderSecondColumnGender ? '' : cellText(row[1]);
      const parsedGender = header
        ? header.gender >= 0 ? parseGender(row[header.gender]) : undefined
        : noHeaderSecondColumnGender || parseGender(row[2]);
      const gender = parsedGender || 'male';
      if (header ? !name || isReservedStudentName(name) : !looksLikeNoHeaderStudentRow(row)) return;

      const key = `${studentNo || 'no-number'}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        name,
        studentNo: studentNo || undefined,
        gender,
      });
    });
  });

  return rows;
}

export function buildStudentImportReport(
  existingStudents: Student[],
  importedStudents: StudentImportRow[],
): StudentImportReport {
  const report: StudentImportReport = {
    created: [],
    updated: [],
    skipped: [],
    conflicts: [],
    errors: [],
  };
  const existingByNo = new Map(existingStudents.filter(student => student.studentNo).map(student => [student.studentNo, student]));
  const existingByName = new Map<string, Student[]>();
  existingStudents.forEach(student => {
    existingByName.set(student.name, [...(existingByName.get(student.name) || []), student]);
  });
  const seenImportNos = new Map<string, StudentImportRow>();
  const seenNoNumberNames = new Set<string>();

  importedStudents.forEach((row, index) => {
    const rowNumber = index + 1;
    const name = row.name.trim();
    const studentNo = row.studentNo?.trim() || '';
    if (!name) {
      report.conflicts.push({
        row: rowNumber,
        type: 'MISSING_REQUIRED_FIELD',
        message: '缺少学生姓名',
        raw: row,
      });
      return;
    }
    if (row.gender !== 'male' && row.gender !== 'female') {
      report.conflicts.push({
        row: rowNumber,
        type: 'INVALID_GENDER',
        message: '性别无效',
        raw: row,
      });
      return;
    }

    if (studentNo) {
      const previousImport = seenImportNos.get(studentNo);
      if (previousImport && previousImport.name !== name) {
        report.conflicts.push({
          row: rowNumber,
          type: 'DUPLICATE_STUDENT_NO',
          message: `导入表内学号 ${studentNo} 对应多个姓名`,
          raw: row,
        });
        return;
      }
      seenImportNos.set(studentNo, row);

      const existing = existingByNo.get(studentNo);
      if (existing && existing.name !== name) {
        report.conflicts.push({
          row: rowNumber,
          type: 'SAME_STUDENT_NO_DIFFERENT_NAME',
          message: `学号 ${studentNo} 已属于 ${existing.name}，不能导入为 ${name}`,
          raw: row,
        });
        return;
      }
      if (existing) {
        if (existing.gender !== row.gender) report.updated.push(row);
        else report.skipped.push({ row: rowNumber, reason: '学生已存在且信息一致', raw: row });
        return;
      }
      report.created.push(row);
      return;
    }

    if (seenNoNumberNames.has(name) || (existingByName.get(name) || []).length > 0) {
      report.conflicts.push({
        row: rowNumber,
        type: 'DUPLICATE_NAME_WITHOUT_STUDENT_NO',
        message: `无学号学生 ${name} 存在重名，不能自动合并`,
        raw: row,
      });
      return;
    }
    seenNoNumberNames.add(name);
    report.created.push(row);
  });

  return report;
}

import { StudentGender } from '../types';

type SheetMatrix = unknown[][];
type WorkbookMatrices = Record<string, SheetMatrix>;

export interface StudentImportRow {
  name: string;
  gender: StudentGender;
  studentNo?: string;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseGender(value: unknown): StudentGender | undefined {
  const text = cellText(value);
  if (text.includes('女') || /^f(emale)?$/i.test(text)) return 'female';
  if (text.includes('男') || /^m(ale)?$/i.test(text)) return 'male';
  return undefined;
}

function findHeaderIndexes(row: unknown[]) {
  const labels = row.map(cellText);
  const name = labels.findIndex(label => label === '姓名' || /^name$/i.test(label));
  if (name < 0) return null;
  return {
    name,
    studentNo: labels.findIndex(label => ['序号', '编号', '学号', '学号/编号'].includes(label)),
    gender: labels.findIndex(label => ['性别', '男女', '男/女', '性别(男/女)'].includes(label) || /^gender$/i.test(label)),
  };
}

function looksLikeNoHeaderStudentRow(row: unknown[]): boolean {
  const name = cellText(row[0]);
  const studentNo = cellText(row[1]);
  if (!name || !studentNo) return false;
  if (name === '姓名' || studentNo === '序号') return false;
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
      const studentNo = header && header.studentNo >= 0 ? cellText(row[header.studentNo]) : cellText(row[1]);
      const parsedGender = header && header.gender >= 0 ? parseGender(row[header.gender]) : parseGender(row[2]);
      const gender = parsedGender || 'male';
      if (header ? !name : !looksLikeNoHeaderStudentRow(row)) return;

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

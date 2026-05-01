import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile, { SheetData } from 'write-excel-file/browser';

export type WorkbookMatrices = Record<string, unknown[][]>;
export type WorkbookObjectRow = Record<string, unknown>;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || 'Sheet1';
}

function sanitizeSheetName(sheetName: string) {
  const clean = (sheetName || 'Sheet1').replace(/[\[\]\/\\:*?]/g, '').slice(0, 31);
  return clean || 'Sheet1';
}

function normalizeMatrix(rows: unknown[][]): unknown[][] {
  return rows.map(row => row.map(cell => cell ?? ''));
}

export function sheetMatrixToObjects(rows: unknown[][]): WorkbookObjectRow[] {
  const [headerRow, ...bodyRows] = rows;
  if (!headerRow) return [];

  const headers = headerRow.map(cellText);
  return bodyRows.flatMap(row => {
    if (row.every(cell => cellText(cell) === '')) return [];
    const item: WorkbookObjectRow = {};
    headers.forEach((header, index) => {
      if (!header) return;
      item[header] = row[index] ?? '';
    });
    return [item];
  });
}

export function objectRowsToSheetData(rows: WorkbookObjectRow[]): SheetData {
  if (rows.length === 0) return [['暂无数据']];
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set<string>()));
  return [
    headers,
    ...rows.map(row => headers.map(header => row[header] as string | number | boolean | Date | null | undefined)),
  ];
}

export function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some(value => value !== '') || rows.length === 0) rows.push(row);
  return rows;
}

export async function readWorkbookMatrices(file: File): Promise<WorkbookMatrices> {
  if (/\.csv$/i.test(file.name)) {
    return { [stripExtension(file.name)]: parseCsvMatrix(await file.text()) };
  }

  const sheets = await readXlsxFile(file);
  return Object.fromEntries(sheets.map(({ sheet, data }) => [sheet, normalizeMatrix(data)]));
}

export async function readFirstSheetObjects(file: File): Promise<WorkbookObjectRow[]> {
  const matrices = await readWorkbookMatrices(file);
  const firstSheet = Object.values(matrices)[0] || [];
  return sheetMatrixToObjects(firstSheet);
}

export async function writeObjectRowsFile(
  rows: WorkbookObjectRow[],
  sheetName: string,
  fileName: string,
) {
  await writeXlsxFile([{
    sheet: sanitizeSheetName(sheetName),
    data: objectRowsToSheetData(rows),
  }]).toFile(fileName);
}

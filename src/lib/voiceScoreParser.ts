import { SportEventKey, Student, TestSessionGroup } from '../types';
import { parseTime800m } from './utils';

export interface VoiceScoreAssignment {
  studentId: string;
  value: string;
  trialIndex: number | null;
  sourceText: string;
  confidence: 'high' | 'medium';
}

export interface VoiceNoteAssignment {
  studentId: string;
  note: string;
  sourceText: string;
}

export interface VoiceScoreParseResult {
  assignments: VoiceScoreAssignment[];
  notes: VoiceNoteAssignment[];
  unmatchedSegments: string[];
}

interface ParseOptions {
  text: string;
  students: Student[];
  group: TestSessionGroup;
  event: SportEventKey;
  trialCount: number;
}

const DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function roundScore(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function parseSimpleChineseInteger(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return parseInt(text, 10);
  if (/^[零〇一二两三四五六七八九]+$/.test(text) && text.length > 1) {
    return parseInt(text.split('').map(char => DIGITS[char]).join(''), 10);
  }
  if (text.includes('百')) {
    const [hundredPart, restPart = ''] = text.split('百');
    const hundred = hundredPart ? DIGITS[hundredPart] ?? parseInt(hundredPart, 10) : 1;
    if (!Number.isFinite(hundred)) return null;
    const rest = restPart.replace(/^零|〇/, '');
    return hundred * 100 + (rest ? parseSimpleChineseInteger(rest) ?? 0 : 0);
  }
  if (text.includes('十')) {
    const [tenPart, onePart = ''] = text.split('十');
    const tens = tenPart ? DIGITS[tenPart] ?? parseInt(tenPart, 10) : 1;
    const ones = onePart ? DIGITS[onePart] ?? parseInt(onePart, 10) : 0;
    if (!Number.isFinite(tens) || !Number.isFinite(ones)) return null;
    return tens * 10 + ones;
  }
  if (text.length === 1) return DIGITS[text] ?? null;
  return null;
}

function parseChineseDecimal(input: string): number | null {
  const match = input.match(/([零〇一二两三四五六七八九十百\d]+)\s*(?:点|\.)\s*([零〇一二两三四五六七八九\d]+)/);
  if (!match) return null;
  const integer = parseSimpleChineseInteger(match[1]);
  const decimal = match[2].split('').map(char => {
    if (/\d/.test(char)) return char;
    return DIGITS[char]?.toString() ?? '';
  }).join('');
  if (integer === null || !decimal) return null;
  return parseFloat(`${integer}.${decimal}`);
}

function parseNumberish(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return parseFloat(text);
  const decimal = parseChineseDecimal(text);
  if (decimal !== null) return decimal;
  return parseSimpleChineseInteger(text);
}

function addImplicitSegmentBreaks(text: string): string {
  const positionPattern = /(\d{1,2}|[一二三四五六七八九]|十[一二三四五六七八九]?|[二三]十[一二三四五六七八九]?)\s*(?:道|到|号|顺序|位)/g;
  return text.replace(positionPattern, (match, _position, offset, fullText) => {
    if (offset === 0) return match;
    const previous = fullText[offset - 1];
    if (/\d/.test(previous) && fullText[offset - 2] !== '.') return match;
    if (/[，,。；;\n]/.test(previous)) return match;
    return `，${match}`;
  });
}

function splitSegments(text: string): string[] {
  return addImplicitSegmentBreaks(text)
    .split(/[，,。；;\n]/)
    .map(segment => segment.trim())
    .filter(Boolean);
}

function groupStudents(options: ParseOptions): Student[] {
  const groupIds = new Set(options.group.members.map(member => member.studentId));
  return options.students
    .filter(student => groupIds.has(student.id))
    .sort((a, b) => b.name.length - a.name.length);
}

function findStudentByText(segment: string, options: ParseOptions): { student: Student; confidence: 'high' | 'medium' } | null {
  const students = groupStudents(options);
  const byName = students.find(student => segment.includes(student.name));
  if (byName) return { student: byName, confidence: 'high' };

  const byNo = students.find(student => student.studentNo && segment.includes(student.studentNo));
  if (byNo) return { student: byNo, confidence: 'high' };

  const positionMatch = segment.match(/([零〇一二两三四五六七八九十\d]+)\s*(?:道|到|号|顺序|位)/);
  if (!positionMatch) return null;
  const position = parseSimpleChineseInteger(positionMatch[1]);
  if (!position) return null;
  const member = options.group.members.find(item => {
    const memberPosition = options.event === 'hundred'
      ? item.lane ?? item.order
      : item.order ?? item.lane;
    return memberPosition === position;
  });
  const student = member ? students.find(item => item.id === member.studentId) : undefined;
  return student ? { student, confidence: 'medium' } : null;
}

function extractTrialIndex(segment: string, trialCount: number): number | null {
  const match = segment.match(/第\s*([零〇一二两三四五六七八九十\d]+)\s*次/);
  if (!match) return null;
  const trialNumber = parseSimpleChineseInteger(match[1]);
  if (!trialNumber || trialNumber < 1 || trialNumber > trialCount) return null;
  return trialNumber - 1;
}

function stripKnownWords(segment: string, student?: Student): string {
  let text = segment;
  if (student) {
    text = text.replaceAll(student.name, ' ');
    if (student.studentNo) text = text.replaceAll(student.studentNo, ' ');
  }
  return text
    .replace(/第\s*[零〇一二两三四五六七八九十\d]+\s*次/g, ' ')
    .replace(/[零〇一二两三四五六七八九十\d]+\s*(?:道|到|号|顺序|位)/g, ' ')
    .replace(/成绩|录入|结果|是|为/g, ' ')
    .trim();
}

function extractEightHundredScore(text: string): string | null {
  const colonMatch = text.match(/(\d+)\s*[:：]\s*(\d+(?:\.\d+)?)/);
  if (colonMatch) {
    const parsed = parseTime800m(`${colonMatch[1]}:${colonMatch[2]}`);
    return parsed === null ? null : roundScore(parsed);
  }

  const minuteMatch = text.match(/([零〇一二两三四五六七八九十\d]+)\s*分\s*([零〇一二两三四五六七八九十\d]+)(?:\s*秒)?/);
  if (minuteMatch) {
    const minutes = parseSimpleChineseInteger(minuteMatch[1]);
    const seconds = parseSimpleChineseInteger(minuteMatch[2]);
    if (minutes !== null && seconds !== null) return roundScore(minutes * 60 + seconds);
  }

  const secondsMatch = text.match(/(\d+(?:\.\d+)?)\s*秒?/);
  if (secondsMatch) return secondsMatch[1];

  const chineseSecondsMatch = text.match(/([零〇一二两三四五六七八九十百]+)\s*秒/);
  if (chineseSecondsMatch) {
    const seconds = parseSimpleChineseInteger(chineseSecondsMatch[1]);
    return seconds === null ? null : roundScore(seconds);
  }

  return null;
}

function extractStandardScore(text: string): string | null {
  const rawDecimalMatch = text.match(/\d+\.\d+/);
  if (rawDecimalMatch) return rawDecimalMatch[0];

  const chineseDecimal = parseChineseDecimal(text);
  if (chineseDecimal !== null) return roundScore(chineseDecimal);

  const unitDecimalMatch = text.match(/([零〇一二两三四五六七八九十百\d]+)\s*(?:秒|米)\s*([零〇一二两三四五六七八九\d])/);
  if (unitDecimalMatch) {
    const integer = parseNumberish(unitDecimalMatch[1]);
    const decimal = parseNumberish(unitDecimalMatch[2]);
    if (integer !== null && decimal !== null) return `${integer}.${decimal}`;
  }

  const rawIntegerMatch = text.match(/\d+/);
  if (rawIntegerMatch) return rawIntegerMatch[0];

  const chineseNumberMatch = text.match(/[零〇一二两三四五六七八九十百]+/);
  if (chineseNumberMatch) {
    const value = parseNumberish(chineseNumberMatch[0]);
    return value === null ? null : roundScore(value);
  }

  return null;
}

function extractScoreValue(segment: string, options: ParseOptions, student?: Student): string | null {
  const text = stripKnownWords(segment, student);
  return options.event === 'eightHundred'
    ? extractEightHundredScore(text) || extractStandardScore(text)
    : extractStandardScore(text);
}

function extractNote(segment: string, student?: Student): string | null {
  const noteIndex = segment.indexOf('备注');
  if (noteIndex < 0) return null;
  let note = segment.slice(noteIndex + 2).trim();
  if (student) {
    note = note.replace(student.name, '').replace(student.studentNo, '').trim();
  }
  return note || null;
}

export function parseVoiceScoreText(options: ParseOptions): VoiceScoreParseResult {
  const assignments: VoiceScoreAssignment[] = [];
  const notes: VoiceNoteAssignment[] = [];
  const unmatchedSegments: string[] = [];

  splitSegments(options.text).forEach(segment => {
    const match = findStudentByText(segment, options);
    if (!match) {
      unmatchedSegments.push(segment);
      return;
    }

    const note = extractNote(segment, match.student);
    if (note) {
      notes.push({
        studentId: match.student.id,
        note,
        sourceText: segment,
      });
      return;
    }

    const value = extractScoreValue(segment, options, match.student);
    if (!value) {
      unmatchedSegments.push(segment);
      return;
    }

    assignments.push({
      studentId: match.student.id,
      value,
      trialIndex: extractTrialIndex(segment, options.trialCount),
      sourceText: segment,
      confidence: match.confidence,
    });
  });

  return { assignments, notes, unmatchedSegments };
}

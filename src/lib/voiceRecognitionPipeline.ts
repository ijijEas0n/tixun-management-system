import { SportEventKey, Student, TestSessionGroup } from '../types';
import { parseVoiceScoreText } from './voiceScoreParser';

export type VoiceCandidateConfidence = 'high' | 'medium' | 'low';
export type VoiceRecognitionMode = 'score' | 'note';

export interface VoiceRecognitionBaseCandidate {
  id: string;
  studentId: string;
  sourceText: string;
  confidence: VoiceCandidateConfidence;
  requiresReview: boolean;
  reviewReason: string | null;
}

export interface VoiceScoreCandidate extends VoiceRecognitionBaseCandidate {
  type: 'score';
  value: string;
  trialIndex: number | null;
}

export interface VoiceNoteCandidate extends VoiceRecognitionBaseCandidate {
  type: 'note';
  note: string;
}

export type VoiceRecognitionCandidate = VoiceScoreCandidate | VoiceNoteCandidate;

export interface BuildVoiceRecognitionReviewOptions {
  text: string;
  students: Student[];
  group: TestSessionGroup;
  event: SportEventKey;
  trialCount: number;
  mode?: VoiceRecognitionMode;
}

export interface BuildVoiceContextTermsOptions {
  students: Student[];
  group: TestSessionGroup;
  event: SportEventKey;
}

export interface VoiceRecognitionReview {
  rawText: string;
  normalizedText: string;
  contextTerms: string[];
  candidates: VoiceRecognitionCandidate[];
  autoApplicableCandidates: VoiceRecognitionCandidate[];
  reviewRequiredCandidates: VoiceRecognitionCandidate[];
  unmatchedSegments: string[];
  humanTrainingMaterialNotice: string;
}

const EVENT_TERMS: Record<SportEventKey, string[]> = {
  hundred: ['100米', '百米', '一道', '二道', '三道', '起跑', '压线'],
  shotPut: ['铅球', '第一投', '第二投', '第三投', '犯规', '米'],
  tripleJump: ['三级跳', '第一跳', '第二跳', '第三跳', '犯规', '米'],
  eightHundred: ['800米', '八百米', '分', '秒', '冲刺'],
};

const REVIEW_REASON_BY_CONFIDENCE: Record<VoiceCandidateConfidence, string | null> = {
  high: null,
  medium: '只按道次或顺序匹配到学生，录入前需要确认',
  low: '识别结果不完整，录入前需要人工确认',
};

function normalizeSpaces(text: string) {
  return text.replace(/\s+/g, '').trim();
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

export function normalizeVoiceTranscript(rawText: string) {
  const normalized = normalizeSpaces(rawText)
    .replace(/[、。；;]+/g, '，')
    .replace(/,/g, '，')
    .replace(/([一二三四五六七八九十\d]+)[到档挡](?=[零〇一二两三四五六七八九十百\d])/g, '$1道')
    .replace(/([一二三四五六七八九十\d]+)导(?=[零〇一二两三四五六七八九十百\d])/g, '$1道')
    .replace(/第([一二三四五六七八九十\d]+)投/g, '第$1次')
    .replace(/成绩为/g, '成绩')
    .replace(/结果为/g, '成绩')
    .replace(/，，+/g, '，');
  return normalized.replace(/^，|，$/g, '');
}

function getGroupStudents(students: Student[], group: TestSessionGroup) {
  const byId = new Map(students.map(student => [student.id, student]));
  return group.members
    .map((member, index) => ({
      student: byId.get(member.studentId),
      member,
      index,
    }))
    .filter((item): item is { student: Student; member: TestSessionGroup['members'][number]; index: number } => Boolean(item.student));
}

function parseSimpleChineseInteger(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return parseInt(text, 10);
  if (text.length === 1) return DIGITS[text] ?? null;
  if (text.includes('十')) {
    const [tenPart, onePart = ''] = text.split('十');
    const tens = tenPart ? DIGITS[tenPart] ?? parseInt(tenPart, 10) : 1;
    const ones = onePart ? DIGITS[onePart] ?? parseInt(onePart, 10) : 0;
    if (!Number.isFinite(tens) || !Number.isFinite(ones)) return null;
    return tens * 10 + ones;
  }
  return null;
}

export function buildVoiceContextTerms(options: BuildVoiceContextTermsOptions) {
  const terms = new Set<string>(['成绩', '备注', '第一次', '第二次', '第三次', ...EVENT_TERMS[options.event]]);
  getGroupStudents(options.students, options.group).forEach(({ student, member, index }) => {
    terms.add(student.name);
    if (student.studentNo) terms.add(student.studentNo);
    const lane = member.lane ?? index + 1;
    const order = member.order ?? index + 1;
    terms.add(`${lane}道`);
    terms.add(`${lane}号`);
    terms.add(`顺序${order}`);
  });
  return Array.from(terms);
}

export function getHumanTrainingMaterialNotice() {
  return '需要人工补充：真实操场录音、同一批录音的人工正确文本、常见误识别词、学生姓名读法和每个项目的高频口令。';
}

function shouldRequireReview(confidence: VoiceCandidateConfidence) {
  return confidence !== 'high';
}

function splitVoiceSegments(text: string) {
  return text
    .split(/[，,。；;\n]/)
    .map(segment => segment.trim())
    .filter(Boolean);
}

function findVoiceStudentMatch(segment: string, options: BuildVoiceRecognitionReviewOptions) {
  const groupStudents = getGroupStudents(options.students, options.group)
    .sort((a, b) => b.student.name.length - a.student.name.length);
  const nameMatch = groupStudents.find(item => segment.includes(item.student.name));
  if (nameMatch) return { ...nameMatch, confidence: 'high' as const, matchedText: nameMatch.student.name };

  const noMatch = groupStudents.find(item => item.student.studentNo && segment.includes(item.student.studentNo));
  if (noMatch) return { ...noMatch, confidence: 'high' as const, matchedText: noMatch.student.studentNo };

  const positionMatch = segment.match(/([零〇一二两三四五六七八九十\d]+)\s*(?:道|到|号|顺序|位)/);
  if (!positionMatch) return null;
  const position = parseSimpleChineseInteger(positionMatch[1]);
  if (!position) return null;
  const matched = groupStudents.find(item => {
    const memberPosition = options.event === 'hundred'
      ? item.member.lane ?? item.member.order ?? item.index + 1
      : item.member.order ?? item.member.lane ?? item.index + 1;
    return memberPosition === position;
  });
  return matched ? { ...matched, confidence: 'medium' as const, matchedText: positionMatch[0] } : null;
}

function stripNotePromptWords(segment: string, matchedText: string, student: Student) {
  return segment
    .replace(student.name, ' ')
    .replace(student.studentNo, ' ')
    .replace(matchedText, ' ')
    .replace(/备注|批注|技术|问题|表现|记录|是|为/g, ' ')
    .trim();
}

function buildNoteModeCandidates(options: BuildVoiceRecognitionReviewOptions, normalizedText: string) {
  const candidates: VoiceNoteCandidate[] = [];
  const unmatchedSegments: string[] = [];
  splitVoiceSegments(normalizedText).forEach((segment, index) => {
    const match = findVoiceStudentMatch(segment, options);
    if (!match) {
      unmatchedSegments.push(segment);
      return;
    }
    const note = stripNotePromptWords(segment, match.matchedText, match.student);
    if (!note) {
      unmatchedSegments.push(segment);
      return;
    }
    const requiresReview = shouldRequireReview(match.confidence);
    candidates.push({
      id: `note-mode-${index}-${match.student.id}`,
      type: 'note',
      studentId: match.student.id,
      note,
      sourceText: segment,
      confidence: match.confidence,
      requiresReview,
      reviewReason: requiresReview ? REVIEW_REASON_BY_CONFIDENCE[match.confidence] : null,
    });
  });
  return { candidates, unmatchedSegments };
}

export function buildVoiceRecognitionReview(options: BuildVoiceRecognitionReviewOptions): VoiceRecognitionReview {
  const normalizedText = normalizeVoiceTranscript(options.text);
  if (options.mode === 'note') {
    const { candidates, unmatchedSegments } = buildNoteModeCandidates(options, normalizedText);
    return {
      rawText: options.text,
      normalizedText,
      contextTerms: buildVoiceContextTerms(options),
      candidates,
      autoApplicableCandidates: candidates.filter(candidate => !candidate.requiresReview),
      reviewRequiredCandidates: candidates.filter(candidate => candidate.requiresReview),
      unmatchedSegments,
      humanTrainingMaterialNotice: getHumanTrainingMaterialNotice(),
    };
  }

  const parsed = parseVoiceScoreText({ ...options, text: normalizedText });
  const scoreCandidates: VoiceScoreCandidate[] = parsed.assignments.map((assignment, index) => {
    const confidence = assignment.confidence;
    const requiresReview = shouldRequireReview(confidence);
    return {
      id: `score-${index}-${assignment.studentId}-${assignment.value}`,
      type: 'score',
      studentId: assignment.studentId,
      value: assignment.value,
      trialIndex: assignment.trialIndex,
      sourceText: assignment.sourceText,
      confidence,
      requiresReview,
      reviewReason: requiresReview ? REVIEW_REASON_BY_CONFIDENCE[confidence] : null,
    };
  });
  const noteCandidates: VoiceNoteCandidate[] = parsed.notes.map((note, index) => {
    const confidence = note.confidence;
    const requiresReview = shouldRequireReview(confidence);
    return {
      id: `note-${index}-${note.studentId}`,
      type: 'note',
      studentId: note.studentId,
      note: note.note,
      sourceText: note.sourceText,
      confidence,
      requiresReview,
      reviewReason: requiresReview ? REVIEW_REASON_BY_CONFIDENCE[confidence] : null,
    };
  });
  const candidates = [...scoreCandidates, ...noteCandidates];

  return {
    rawText: options.text,
    normalizedText,
    contextTerms: buildVoiceContextTerms(options),
    candidates,
    autoApplicableCandidates: candidates.filter(candidate => !candidate.requiresReview),
    reviewRequiredCandidates: candidates.filter(candidate => candidate.requiresReview),
    unmatchedSegments: parsed.unmatchedSegments,
    humanTrainingMaterialNotice: getHumanTrainingMaterialNotice(),
  };
}

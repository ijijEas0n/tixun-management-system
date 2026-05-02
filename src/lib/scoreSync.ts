import { ScoreSet, SportEventKey, Student, TestRecord, TestSessionGroup } from '../types';
import { calculatePoints } from './scoring';
import { isSameRecordTarget, RecordTarget } from './testRecords';
import { parseScoreInput } from './scoreInput';

const EVENTS: SportEventKey[] = ['hundred', 'shotPut', 'tripleJump', 'eightHundred'];

const ATTEMPT_KEYS: Record<SportEventKey, keyof ScoreSet> = {
  hundred: 'hundredAttempts',
  shotPut: 'shotPutAttempts',
  tripleJump: 'tripleJumpAttempts',
  eightHundred: 'eightHundredAttempts',
};

export interface ScoreSyncUpdate extends RecordTarget {
  studentId: string;
  groupId: string;
  groupName: string;
  scores: Partial<ScoreSet>;
  comments?: Partial<Record<SportEventKey, string>>;
}

export interface ScoreSyncUndoSnapshot {
  studentId: string;
  groupId: string;
  groupName: string;
  hadRecord: boolean;
  previousValue: number | null;
  previousAttempts?: (number | null)[];
  previousComment?: string;
}

interface BuildScoreSyncUpdatesOptions {
  groups: TestSessionGroup[];
  event: SportEventKey;
  trialCount: number;
  target: RecordTarget;
  draft: Record<string, string[]>;
  comments?: Record<string, string>;
}

interface BuildUndoSnapshotsOptions {
  records: Record<string, TestRecord[]>;
  target: RecordTarget;
  event: SportEventKey;
  updates: ScoreSyncUpdate[];
}

interface ApplyUndoSnapshotsOptions {
  records: Record<string, TestRecord[]>;
  students: Student[];
  target: RecordTarget;
  event: SportEventKey;
  snapshots: ScoreSyncUndoSnapshot[];
}

function parseEventScore(event: SportEventKey, value: string) {
  const parsed = parseScoreInput(event, value);
  return 'error' in parsed ? Number.NaN : parsed.value;
}

function isLowerBetter(event: SportEventKey) {
  return event === 'hundred' || event === 'eightHundred';
}

function hasAnyScore(scores: ScoreSet) {
  return EVENTS.some(event => {
    const value = scores[event];
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  });
}

function cloneRecord(record: TestRecord): TestRecord {
  return {
    ...record,
    scores: {
      ...record.scores,
      hundredAttempts: record.scores.hundredAttempts ? [...record.scores.hundredAttempts] : undefined,
      shotPutAttempts: record.scores.shotPutAttempts ? [...record.scores.shotPutAttempts] : undefined,
      tripleJumpAttempts: record.scores.tripleJumpAttempts ? [...record.scores.tripleJumpAttempts] : undefined,
      eightHundredAttempts: record.scores.eightHundredAttempts ? [...record.scores.eightHundredAttempts] : undefined,
    },
    points: { ...record.points },
  };
}

export function getAttemptKey(event: SportEventKey): keyof ScoreSet {
  return ATTEMPT_KEYS[event];
}

export function buildScoreSyncUpdates({
  groups,
  event,
  trialCount,
  target,
  draft,
  comments,
}: BuildScoreSyncUpdatesOptions): ScoreSyncUpdate[] {
  const attemptKey = getAttemptKey(event);
  const updates: ScoreSyncUpdate[] = [];

  groups.forEach(group => {
    group.members.forEach(member => {
      const values = (draft[member.studentId] || []).slice(0, trialCount);
      const attempts = values.map(value => {
        const parsed = parseEventScore(event, value);
        return parsed === null || Number.isNaN(parsed) ? null : parsed;
      });
      const validScores = attempts.filter((value): value is number => (
        typeof value === 'number' && Number.isFinite(value) && value > 0
      ));
      const hasCommentDraft = comments ? Object.prototype.hasOwnProperty.call(comments, member.studentId) : false;
      const comment = hasCommentDraft ? comments?.[member.studentId]?.trim() ?? '' : undefined;
      if (validScores.length === 0 && !hasCommentDraft) return;

      const best = validScores.length > 0
        ? isLowerBetter(event) ? Math.min(...validScores) : Math.max(...validScores)
        : undefined;
      updates.push({
        ...target,
        studentId: member.studentId,
        groupId: group.id,
        groupName: group.name,
        scores: best === undefined ? {} : {
          [event]: best,
          [attemptKey]: attempts,
        } as Partial<ScoreSet>,
        comments: hasCommentDraft ? {
          [event]: comment,
        } : undefined,
      });
    });
  });

  return updates;
}

export function buildScoreSyncUndoSnapshots({
  records,
  target,
  event,
  updates,
}: BuildUndoSnapshotsOptions): ScoreSyncUndoSnapshot[] {
  const attemptKey = getAttemptKey(event);

  return updates.map(update => {
    const record = (records[update.studentId] || []).find(item => isSameRecordTarget(item, target));
    const previousAttempts = record?.scores[attemptKey];

    return {
      studentId: update.studentId,
      groupId: update.groupId,
      groupName: update.groupName,
      hadRecord: Boolean(record),
      previousValue: record?.scores[event] ?? null,
      previousAttempts: Array.isArray(previousAttempts) ? [...previousAttempts] : undefined,
      previousComment: record?.comments?.[event],
    };
  });
}

export function applyScoreSyncUndoSnapshots({
  records,
  students,
  target,
  event,
  snapshots,
}: ApplyUndoSnapshotsOptions): Record<string, TestRecord[]> {
  const nextRecords: Record<string, TestRecord[]> = { ...records };
  const studentsById = new Map(students.map(student => [student.id, student]));
  const attemptKey = getAttemptKey(event);

  snapshots.forEach(snapshot => {
    const existingRecords = nextRecords[snapshot.studentId] || [];
    const studentRecords = existingRecords.map(cloneRecord);
    const recordIndex = studentRecords.findIndex(record => isSameRecordTarget(record, target));
    if (recordIndex < 0) return;

    const record = studentRecords[recordIndex];
    const scores = { ...record.scores };
    const comments = { ...(record.comments || {}) };
    scores[event] = snapshot.hadRecord ? snapshot.previousValue : null;
    (scores as Record<string, unknown>)[attemptKey] = snapshot.previousAttempts ? [...snapshot.previousAttempts] : undefined;
    if (snapshot.previousComment === undefined) {
      delete comments[event];
    } else {
      comments[event] = snapshot.previousComment;
    }

    if (!snapshot.hadRecord && !hasAnyScore(scores)) {
      studentRecords.splice(recordIndex, 1);
      nextRecords[snapshot.studentId] = studentRecords;
      return;
    }

    const student = studentsById.get(snapshot.studentId);
    if (!student) return;

    studentRecords[recordIndex] = {
      ...record,
      scores,
      points: calculatePoints(scores, student.gender),
      comments,
    };
    nextRecords[snapshot.studentId] = studentRecords;
  });

  return nextRecords;
}

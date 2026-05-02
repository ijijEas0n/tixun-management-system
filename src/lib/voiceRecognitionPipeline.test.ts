import assert from 'node:assert/strict';
import { Student, TestSessionGroup } from '../types';
import {
  buildVoiceContextTerms,
  buildVoiceRecognitionReview,
  getHumanTrainingMaterialNotice,
} from './voiceRecognitionPipeline';

const students: Student[] = [
  { id: 's1', studentNo: '25001', name: '赵明轩', gender: 'male', yearId: 'y1' },
  { id: 's2', studentNo: '25002', name: '李承泽', gender: 'male', yearId: 'y1' },
];

const group: TestSessionGroup = {
  id: 'g1',
  name: '男生第1组',
  gender: 'male',
  members: [
    { studentId: 's1', lane: 1, order: 1 },
    { studentId: 's2', lane: 2, order: 2 },
  ],
};

const laneReview = buildVoiceRecognitionReview({
  text: '一到十二秒八二到十二秒六',
  students,
  group,
  event: 'hundred',
  trialCount: 3,
});

assert.equal(laneReview.normalizedText.includes('一道'), true);
assert.deepEqual(
  laneReview.candidates.map(item => ({
    type: item.type,
    studentId: item.studentId,
    confidence: item.confidence,
    requiresReview: item.requiresReview,
    value: item.type === 'score' ? item.value : item.note,
  })),
  [
    { type: 'score', studentId: 's1', confidence: 'medium', requiresReview: true, value: '12.8' },
    { type: 'score', studentId: 's2', confidence: 'medium', requiresReview: true, value: '12.6' },
  ],
);

const nameReview = buildVoiceRecognitionReview({
  text: '赵明轩十二秒八',
  students,
  group,
  event: 'hundred',
  trialCount: 3,
});

assert.deepEqual(
  nameReview.autoApplicableCandidates.map(item => ({
    type: item.type,
    studentId: item.studentId,
    requiresReview: item.requiresReview,
    value: item.type === 'score' ? item.value : item.note,
  })),
  [
    { type: 'score', studentId: 's1', requiresReview: false, value: '12.8' },
  ],
);

const noteModeReview = buildVoiceRecognitionReview({
  text: '赵明轩起跑慢，二道摆臂紧',
  students,
  group,
  event: 'hundred',
  trialCount: 3,
  mode: 'note',
});

assert.deepEqual(
  noteModeReview.candidates.map(item => ({
    type: item.type,
    studentId: item.studentId,
    value: item.type === 'note' ? item.note : item.value,
    requiresReview: item.requiresReview,
  })),
  [
    { type: 'note', studentId: 's1', value: '起跑慢', requiresReview: false },
    { type: 'note', studentId: 's2', value: '摆臂紧', requiresReview: true },
  ],
);

const contextTerms = buildVoiceContextTerms({ students, group, event: 'hundred' });
assert.ok(contextTerms.includes('赵明轩'));
assert.ok(contextTerms.includes('一道'));
assert.ok(contextTerms.includes('第一次'));

assert.match(getHumanTrainingMaterialNotice(), /需要人工补充/);

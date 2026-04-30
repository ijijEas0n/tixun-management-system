import assert from 'node:assert/strict';
import { Student, TestSessionGroup } from '../types';
import { parseVoiceScoreText } from './voiceScoreParser';

const students: Student[] = [
  { id: 's1', studentNo: '25001', name: '赵明轩', gender: 'male', yearId: 'y1' },
  { id: 's2', studentNo: '25002', name: '李承泽', gender: 'male', yearId: 'y1' },
  { id: 's3', studentNo: '25003', name: '周子昂', gender: 'male', yearId: 'y1' },
];

const group: TestSessionGroup = {
  id: 'g1',
  name: '男生第1组',
  gender: 'male',
  members: [
    { studentId: 's1', lane: 1, order: 1 },
    { studentId: 's2', lane: 2, order: 2 },
    { studentId: 's3', lane: 3, order: 3 },
  ],
};

const sprintResult = parseVoiceScoreText({
  text: '一道 赵明轩 十二秒八，二道李承泽12.40，周子昂 第2次 十二点六',
  students,
  group,
  event: 'hundred',
  trialCount: 3,
});

assert.deepEqual(
  sprintResult.assignments.map(item => ({
    studentId: item.studentId,
    trialIndex: item.trialIndex,
    value: item.value,
  })),
  [
    { studentId: 's1', trialIndex: null, value: '12.8' },
    { studentId: 's2', trialIndex: null, value: '12.40' },
    { studentId: 's3', trialIndex: 1, value: '12.6' },
  ],
);

const eightHundredResult = parseVoiceScoreText({
  text: '一号 二分十二，三号 132秒',
  students,
  group,
  event: 'eightHundred',
  trialCount: 1,
});

assert.deepEqual(
  eightHundredResult.assignments.map(item => ({ studentId: item.studentId, value: item.value })),
  [
    { studentId: 's1', value: '132' },
    { studentId: 's3', value: '132' },
  ],
);

const noteResult = parseVoiceScoreText({
  text: '赵明轩备注 起跑慢，李承泽 备注 第二次犯规',
  students,
  group,
  event: 'hundred',
  trialCount: 3,
});

assert.deepEqual(
  noteResult.notes.map(item => ({ studentId: item.studentId, note: item.note })),
  [
    { studentId: 's1', note: '起跑慢' },
    { studentId: 's2', note: '第二次犯规' },
  ],
);

const continuousSpeechResult = parseVoiceScoreText({
  text: '一道十二点八二道十二点六三道十二点九',
  students,
  group,
  event: 'hundred',
  trialCount: 3,
});

assert.deepEqual(
  continuousSpeechResult.assignments.map(item => ({ studentId: item.studentId, value: item.value })),
  [
    { studentId: 's1', value: '12.8' },
    { studentId: 's2', value: '12.6' },
    { studentId: 's3', value: '12.9' },
  ],
);

const homophoneLaneResult = parseVoiceScoreText({
  text: '一到12.8，二到12.6',
  students,
  group,
  event: 'hundred',
  trialCount: 3,
});

assert.deepEqual(
  homophoneLaneResult.assignments.map(item => ({ studentId: item.studentId, value: item.value })),
  [
    { studentId: 's1', value: '12.8' },
    { studentId: 's2', value: '12.6' },
  ],
);

const continuousDigitResult = parseVoiceScoreText({
  text: '一道12.8二道12.6',
  students,
  group,
  event: 'hundred',
  trialCount: 3,
});

assert.deepEqual(
  continuousDigitResult.assignments.map(item => ({ studentId: item.studentId, value: item.value })),
  [
    { studentId: 's1', value: '12.8' },
    { studentId: 's2', value: '12.6' },
  ],
);

const shortStudentNoStudents: Student[] = [
  { id: 'short-1', studentNo: '1', name: '叶子超', gender: 'male', yearId: 'y1' },
];

const shortStudentNoGroup: TestSessionGroup = {
  id: 'short-g1',
  name: '男生第1组',
  gender: 'male',
  members: [
    { studentId: 'short-1', lane: 4, order: 4 },
  ],
};

const shortStudentNoResult = parseVoiceScoreText({
  text: '叶子超第三次12.8',
  students: shortStudentNoStudents,
  group: shortStudentNoGroup,
  event: 'hundred',
  trialCount: 3,
});

assert.deepEqual(
  shortStudentNoResult.assignments.map(item => ({
    studentId: item.studentId,
    trialIndex: item.trialIndex,
    value: item.value,
  })),
  [
    { studentId: 'short-1', trialIndex: 2, value: '12.8' },
  ],
);

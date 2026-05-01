import assert from 'node:assert/strict';
import {
  canEditGroupSchedule,
  createGroupingVersion,
  getDefaultGroupSize,
  getEntryVersionId,
  getEntryViewVersionId,
  getDisplayGroupStartTime,
  isGroupingLocked,
  getLatestGroupingVersion,
  getGroupStartTime,
  getPresentStudentsForSession,
  getTileScaleConfig,
  getUnlockedEntryVersionIds,
  nextTrialCount,
  previousTrialCount,
  removeGroupById,
  reorderGroupMembers,
  swapGroupMembers,
} from './grouping';
import { Student, TestSession, TestSessionGroup } from '../types';

const students: Student[] = [
  { id: 'm1', studentNo: '25001', name: '男一', gender: 'male', yearId: 'y1' },
  { id: 'm2', studentNo: '25002', name: '男二', gender: 'male', yearId: 'y1' },
  { id: 'm3', studentNo: '25003', name: '男三', gender: 'male', yearId: 'y1' },
  { id: 'm4', studentNo: '25004', name: '男四', gender: 'male', yearId: 'y1' },
  { id: 'm5', studentNo: '25005', name: '男五', gender: 'male', yearId: 'y1' },
  { id: 'f1', studentNo: '25006', name: '女一', gender: 'female', yearId: 'y1' },
  { id: 'f2', studentNo: '25007', name: '女二', gender: 'female', yearId: 'y1' },
  { id: 'f3', studentNo: '25008', name: '女三', gender: 'female', yearId: 'y1' },
];

function noShuffle() {
  return 0.99;
}

assert.equal(getDefaultGroupSize('hundred'), 4, '100m default group size');
assert.equal(getDefaultGroupSize('shotPut'), 15, 'shot put default group size');
assert.equal(getDefaultGroupSize('tripleJump'), 15, 'triple jump default group size');
assert.equal(getDefaultGroupSize('eightHundred'), 15, '800m default group size');
assert.equal(nextTrialCount(3), 4, 'trial count can increase');
assert.equal(nextTrialCount(10), 10, 'trial count does not exceed 10');
assert.equal(previousTrialCount(3), 2, 'trial count can decrease');
assert.equal(previousTrialCount(1), 1, 'trial count does not go below 1');

const hundredVersion = createGroupingVersion({
  event: 'hundred',
  students,
  mode: 'size',
  groupSize: 4,
  existingVersionCount: 0,
  now: '2026-04-30T08:00:00.000Z',
  rng: noShuffle,
});

assert.equal(hundredVersion.name, '版本 1');
assert.equal(hundredVersion.groups.length, 3, '100m separates genders and chunks by size');
assert.deepEqual(
  hundredVersion.groups.map(group => group.gender),
  ['male', 'male', 'female'],
  'groups remain separated by gender',
);
assert.deepEqual(
  hundredVersion.groups[0].members.map(member => member.lane),
  [1, 2, 3, 4],
  '100m members receive lanes from lane 1',
);
assert.deepEqual(
  hundredVersion.groups[1].members.map(member => member.lane),
  [1],
  '100m lanes reset for each group',
);

const totalCountVersion = createGroupingVersion({
  event: 'shotPut',
  students,
  mode: 'count',
  groupCount: 4,
  existingVersionCount: 1,
  now: '2026-04-30T09:00:00.000Z',
  rng: noShuffle,
});

assert.equal(totalCountVersion.name, '版本 2');
assert.equal(totalCountVersion.groups.length, 4, 'count mode creates the requested total group count');
assert.deepEqual(
  totalCountVersion.groups.map(group => group.gender),
  ['male', 'male', 'female', 'female'],
  'count mode allocates total groups without mixing genders',
);
assert.ok(
  totalCountVersion.groups.every(group => group.members.every(member => member.lane === undefined)),
  'non-100m events do not assign lanes',
);

const eightHundredVersion = createGroupingVersion({
  event: 'eightHundred',
  students,
  mode: 'size',
  groupSize: 4,
  existingVersionCount: 2,
  now: '2026-04-30T10:00:00.000Z',
  rng: noShuffle,
});

assert.equal(eightHundredVersion.groups.length, 2, '800m groups can mix genders by size');
assert.deepEqual(
  eightHundredVersion.groups.map(group => group.gender),
  ['mixed', 'mixed'],
  '800m generated groups are marked as mixed groups',
);
assert.ok(
  eightHundredVersion.groups.some(group => {
    const memberIds = group.members.map(member => member.studentId);
    return memberIds.some(id => id.startsWith('m')) && memberIds.some(id => id.startsWith('f'));
  }),
  '800m generated groups include both male and female students when possible',
);

const latest = getLatestGroupingVersion([hundredVersion, totalCountVersion]);
assert.equal(latest?.id, totalCountVersion.id, 'latest version is chosen by creation time');
assert.equal(
  getEntryVersionId(
    {
      activeVersionIds: { hundred: hundredVersion.id },
      entryVersionIds: { hundred: totalCountVersion.id },
    },
    'hundred',
    [hundredVersion, totalCountVersion],
  ),
  totalCountVersion.id,
  'entry uses the confirmed version instead of the viewed version',
);
assert.equal(
  getEntryVersionId(
    {
      activeVersionIds: { hundred: hundredVersion.id },
      entryVersionIds: { hundred: 'missing-version' },
    },
    'hundred',
    [hundredVersion, totalCountVersion],
  ),
  undefined,
  'entry has no confirmed version when the stored version is stale',
);
assert.equal(
  getEntryVersionId(
    {
      activeVersionIds: { hundred: hundredVersion.id },
      entryVersionIds: {},
    },
    'hundred',
    [hundredVersion, totalCountVersion],
  ),
  undefined,
  'entry requires an explicitly confirmed version',
);
assert.equal(
  getEntryViewVersionId({
    entryVersionId: hundredVersion.id,
    selectedEntryVersionId: totalCountVersion.id,
    viewVersionId: hundredVersion.id,
  }),
  totalCountVersion.id,
  'entry view keeps the manually selected version visible before confirmation',
);

const hundredGroup: TestSessionGroup = {
  id: 'g1',
  name: '男生第1组',
  gender: 'male',
  members: [
    { studentId: 'm1', lane: 1 },
    { studentId: 'm2', lane: 2 },
    { studentId: 'm3', lane: 3 },
  ],
};

const reorderedHundredGroup = reorderGroupMembers(hundredGroup, 0, 2, 'hundred');
assert.deepEqual(
  reorderedHundredGroup.members.map(member => member.studentId),
  ['m2', 'm3', 'm1'],
  'drag reorder moves a member to the dropped position',
);
assert.deepEqual(
  reorderedHundredGroup.members.map(member => member.lane),
  [1, 2, 3],
  '100m lanes are recalculated after drag reorder',
);
assert.deepEqual(
  hundredGroup.members.map(member => member.studentId),
  ['m1', 'm2', 'm3'],
  'drag reorder does not mutate the original group',
);

const reorderedFieldGroup = reorderGroupMembers(
  { ...hundredGroup, members: hundredGroup.members.map(member => ({ studentId: member.studentId })) },
  2,
  0,
  'shotPut',
);
assert.deepEqual(
  reorderedFieldGroup.members.map(member => member.lane),
  [undefined, undefined, undefined],
  'non-100m events do not add lanes after drag reorder',
);
assert.deepEqual(
  removeGroupById([
    { ...hundredGroup, id: 'g1' },
    { ...hundredGroup, id: 'g2' },
  ], 'g1').map(group => group.id),
  ['g2'],
  'group delete removes only the selected group',
);

const crossGroupSwap = swapGroupMembers(
  [
    {
      id: 'g1',
      name: '男生第1组',
      gender: 'male',
      members: [
        { studentId: 'm1', lane: 1 },
        { studentId: 'm2', lane: 2 },
      ],
    },
    {
      id: 'g2',
      name: '男生第2组',
      gender: 'male',
      members: [
        { studentId: 'm3', lane: 1 },
        { studentId: 'm4', lane: 2 },
      ],
    },
  ],
  { groupId: 'g1', studentId: 'm1' },
  { groupId: 'g2', studentId: 'm4' },
  'hundred',
);

assert.deepEqual(
  crossGroupSwap.map(group => group.members.map(member => member.studentId)),
  [['m4', 'm2'], ['m3', 'm1']],
  'single-click selection can swap students across groups',
);
assert.deepEqual(
  crossGroupSwap.flatMap(group => group.members.map(member => member.lane)),
  [1, 2, 1, 2],
  '100m lanes are recalculated after cross-group swap',
);

const lockedSession: TestSession = {
  id: 't1',
  name: '测试1',
  date: '2026-04-30',
  yearId: 'y1',
  activeVersionIds: { hundred: hundredVersion.id },
  entryVersionIds: { hundred: hundredVersion.id },
  groupingVersions: {
    hundred: [hundredVersion],
    shotPut: [],
    tripleJump: [],
    eightHundred: [],
  },
  trialConfigs: {
    hundred: 3,
    shotPut: 3,
    tripleJump: 3,
    eightHundred: 1,
  },
  groupScheduleConfigs: {},
};

assert.equal(isGroupingLocked(lockedSession, 'hundred'), true, 'confirmed grouping locks regeneration');
assert.equal(isGroupingLocked(lockedSession, 'shotPut'), false, 'unconfirmed event can still generate grouping');
assert.equal(canEditGroupSchedule(true), false, 'confirmed grouping also locks schedule editing');
assert.equal(canEditGroupSchedule(false), true, 'unconfirmed grouping can edit schedule');

const sessionWithAbsences: TestSession = {
  ...lockedSession,
  absentStudentIds: ['m2', 'f1'],
};

assert.deepEqual(
  getPresentStudentsForSession(students, sessionWithAbsences).map(student => student.id),
  ['m1', 'm3', 'm4', 'm5', 'f2', 'f3'],
  'students marked absent are excluded before grouping',
);

assert.deepEqual(
  getUnlockedEntryVersionIds({
    ...lockedSession,
    entryVersionIds: {
      hundred: 'confirmed-hundred',
      shotPut: 'confirmed-shot',
    },
  }, 'hundred'),
  { shotPut: 'confirmed-shot' },
  'unlocking one event keeps other confirmed events untouched',
);

const compactTile = getTileScaleConfig(45);
const expandedTile = getTileScaleConfig(160);
assert.ok(
  expandedTile.gridMinWidth - compactTile.gridMinWidth >= 300,
  'tile scale has a visibly larger layout range',
);
assert.ok(
  expandedTile.avatarSize > compactTile.avatarSize && expandedTile.nameFontSize > compactTile.nameFontSize,
  'tile scale changes inner card density, not only column width',
);

assert.equal(
  getGroupStartTime({ startTime: '08:30', intervalMinutes: 12 }, 0),
  '08:30',
  'first group uses the configured start time',
);
assert.equal(
  getGroupStartTime({ startTime: '08:30', intervalMinutes: 12 }, 3),
  '09:06',
  'later groups add the interval by group order',
);
assert.equal(
  getGroupStartTime({ startTime: '23:50', intervalMinutes: 15 }, 1),
  '次日 00:05',
  'schedule labels next-day times when the time crosses midnight',
);
assert.equal(
  getGroupStartTime({ startTime: '', intervalMinutes: 15 }, 1),
  '',
  'groups have no schedule label until a first start time is set',
);
assert.equal(
  getDisplayGroupStartTime({ ...hundredGroup, startTime: '10:02' }, { startTime: '08:30', intervalMinutes: 12 }, 2),
  '10:02',
  'imported group start time takes priority over generated schedule',
);

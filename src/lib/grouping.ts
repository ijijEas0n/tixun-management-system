import {
  GroupScheduleConfig,
  GroupingMode,
  SportEventKey,
  Student,
  StudentGender,
  TestSessionGroup,
  TestSession,
  TestSessionGroupGender,
  TestSessionGroupingVersion,
} from '../types';

interface CreateGroupingVersionOptions {
  event: SportEventKey;
  students: Student[];
  mode: GroupingMode;
  groupSize?: number;
  groupCount?: number;
  existingVersionCount: number;
  now?: string;
  rng?: () => number;
  source?: 'generated' | 'imported';
}

const EVENT_LABELS: Record<SportEventKey, string> = {
  hundred: '100米',
  shotPut: '铅球',
  tripleJump: '三级跳',
  eightHundred: '800米',
};

export function getEventLabel(event: SportEventKey): string {
  return EVENT_LABELS[event];
}

export function getDefaultGroupSize(event: SportEventKey): number {
  return event === 'hundred' ? 4 : 15;
}

export function getDefaultTrialCount(event: SportEventKey): number {
  return event === 'eightHundred' ? 1 : 3;
}

export function nextTrialCount(current: number): number {
  return Math.min(10, Math.max(1, Math.floor(current) + 1));
}

export function previousTrialCount(current: number): number {
  return Math.max(1, Math.floor(current) - 1);
}

export function createEmptyGroupingVersions(): Record<SportEventKey, TestSessionGroupingVersion[]> {
  return {
    hundred: [],
    shotPut: [],
    tripleJump: [],
    eightHundred: [],
  };
}

export function createDefaultTrialConfigs(): Record<SportEventKey, number> {
  return {
    hundred: getDefaultTrialCount('hundred'),
    shotPut: getDefaultTrialCount('shotPut'),
    tripleJump: getDefaultTrialCount('tripleJump'),
    eightHundred: getDefaultTrialCount('eightHundred'),
  };
}

export function getLatestGroupingVersion(
  versions: TestSessionGroupingVersion[],
): TestSessionGroupingVersion | undefined {
  return [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function getEntryVersionId(
  session: {
    activeVersionIds?: Partial<Record<SportEventKey, string>>;
    entryVersionIds?: Partial<Record<SportEventKey, string>>;
  },
  event: SportEventKey,
  versions: TestSessionGroupingVersion[],
): string | undefined {
  const versionIds = new Set(versions.map(version => version.id));
  const entryVersionId = session.entryVersionIds?.[event];
  if (entryVersionId && versionIds.has(entryVersionId)) return entryVersionId;
  return undefined;
}

export function getEntryViewVersionId({
  entryVersionId,
  selectedEntryVersionId,
  viewVersionId,
}: {
  entryVersionId?: string;
  selectedEntryVersionId?: string;
  viewVersionId?: string;
}): string | undefined {
  return selectedEntryVersionId || entryVersionId || viewVersionId;
}

export function isGroupingLocked(session: TestSession, event: SportEventKey): boolean {
  const versionId = session.entryVersionIds?.[event];
  if (!versionId) return false;
  return session.groupingVersions[event]?.some(version => version.id === versionId) ?? false;
}

export function canEditGroupSchedule(groupingLocked: boolean): boolean {
  return !groupingLocked;
}

export function getPresentStudentsForSession(students: Student[], session?: Pick<TestSession, 'absentStudentIds'> | null): Student[] {
  const absentStudentIds = new Set(session?.absentStudentIds || []);
  if (absentStudentIds.size === 0) return students;
  return students.filter(student => !absentStudentIds.has(student.id));
}

export function getUnlockedEntryVersionIds(
  session: Pick<TestSession, 'entryVersionIds'>,
  event: SportEventKey,
): Partial<Record<SportEventKey, string>> {
  const nextEntryVersionIds = { ...session.entryVersionIds };
  delete nextEntryVersionIds[event];
  return nextEntryVersionIds;
}

export function getTileScaleConfig(scale: number) {
  const normalizedScale = Math.min(160, Math.max(45, Math.round(scale)));
  const ratio = (normalizedScale - 45) / 115;

  return {
    normalizedScale,
    gridMinWidth: Math.round(120 + normalizedScale * 3.45),
    cardPadding: Math.round(8 + ratio * 12),
    headerPadding: Math.round(10 + ratio * 10),
    rowPaddingX: Math.round(8 + ratio * 10),
    rowPaddingY: Math.round(6 + ratio * 8),
    rowGap: Math.round(6 + ratio * 8),
    avatarSize: Math.round(30 + ratio * 28),
    badgeFontSize: Number((10 + ratio * 3).toFixed(1)),
    nameFontSize: Number((12 + ratio * 5).toFixed(1)),
    metaFontSize: Number((10 + ratio * 2).toFixed(1)),
    iconSize: Number((14 + ratio * 4).toFixed(1)),
    maxMembersHeight: Math.round(360 + ratio * 260),
  };
}

export function getGroupStartTime(
  config: Pick<GroupScheduleConfig, 'startTime' | 'intervalMinutes'> | undefined,
  groupIndex: number,
): string {
  if (!config?.startTime) return '';
  const [hourText, minuteText] = config.startTime.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';

  const intervalMinutes = Math.max(0, Math.floor(config.intervalMinutes || 0));
  const baseMinutes = hour * 60 + minute;
  const totalMinutes = baseMinutes + Math.max(0, groupIndex) * intervalMinutes;
  const dayOffset = Math.floor(totalMinutes / 1440);
  const minutesInDay = ((totalMinutes % 1440) + 1440) % 1440;
  const scheduledHour = Math.floor(minutesInDay / 60);
  const scheduledMinute = minutesInDay % 60;
  const label = `${String(scheduledHour).padStart(2, '0')}:${String(scheduledMinute).padStart(2, '0')}`;
  return dayOffset > 0 ? `次日 ${label}` : label;
}

export function getDisplayGroupStartTime(
  group: Pick<TestSessionGroup, 'startTime'>,
  config: Pick<GroupScheduleConfig, 'startTime' | 'intervalMinutes'> | undefined,
  groupIndex: number,
): string {
  return group.startTime || getGroupStartTime(config, groupIndex);
}

export function reorderGroupMembers(
  group: TestSessionGroup,
  fromIndex: number,
  toIndex: number,
  event: SportEventKey,
): TestSessionGroup {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= group.members.length ||
    toIndex >= group.members.length ||
    fromIndex === toIndex
  ) {
    return group;
  }

  const members = group.members.map(member => ({ ...member }));
  const [moved] = members.splice(fromIndex, 1);
  members.splice(toIndex, 0, moved);

  return {
    ...group,
    members: members.map((member, index) => ({
      ...member,
      lane: event === 'hundred' ? index + 1 : undefined,
    })),
  };
}

export function removeGroupById(groups: TestSessionGroup[], groupId: string): TestSessionGroup[] {
  return groups.filter(group => group.id !== groupId);
}

export function swapGroupMembers(
  groups: TestSessionGroup[],
  first: { groupId: string; studentId: string },
  second: { groupId: string; studentId: string },
  event: SportEventKey,
): TestSessionGroup[] {
  if (first.studentId === second.studentId) return groups;

  let firstGroupIndex = -1;
  let firstMemberIndex = -1;
  let secondGroupIndex = -1;
  let secondMemberIndex = -1;

  groups.forEach((group, groupIndex) => {
    group.members.forEach((member, memberIndex) => {
      if (group.id === first.groupId && member.studentId === first.studentId) {
        firstGroupIndex = groupIndex;
        firstMemberIndex = memberIndex;
      }
      if (group.id === second.groupId && member.studentId === second.studentId) {
        secondGroupIndex = groupIndex;
        secondMemberIndex = memberIndex;
      }
    });
  });

  if (firstGroupIndex < 0 || secondGroupIndex < 0 || firstMemberIndex < 0 || secondMemberIndex < 0) {
    return groups;
  }

  const nextGroups = groups.map(group => ({
    ...group,
    members: group.members.map(member => ({ ...member })),
  }));
  const firstMember = nextGroups[firstGroupIndex].members[firstMemberIndex];
  const secondMember = nextGroups[secondGroupIndex].members[secondMemberIndex];

  nextGroups[firstGroupIndex].members[firstMemberIndex] = {
    ...firstMember,
    studentId: secondMember.studentId,
  };
  nextGroups[secondGroupIndex].members[secondMemberIndex] = {
    ...secondMember,
    studentId: firstMember.studentId,
  };

  return nextGroups.map(group => ({
    ...group,
    members: group.members.map((member, index) => ({
      ...member,
      lane: event === 'hundred' ? index + 1 : undefined,
    })),
  }));
}

function shuffleStudents(students: Student[], rng: () => number): Student[] {
  const shuffled = [...students].sort((a, b) => (a.studentNo || '').localeCompare(b.studentNo || ''));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function chunkBySize(students: Student[], size: number): Student[][] {
  const normalizedSize = Math.max(1, Math.floor(size));
  const groups: Student[][] = [];
  for (let i = 0; i < students.length; i += normalizedSize) {
    groups.push(students.slice(i, i + normalizedSize));
  }
  return groups;
}

function splitByCount(students: Student[], count: number): Student[][] {
  if (students.length === 0) return [];
  const normalizedCount = Math.min(students.length, Math.max(1, Math.floor(count)));
  const result: Student[][] = Array.from({ length: normalizedCount }, () => []);
  students.forEach((student, index) => {
    result[index % normalizedCount].push(student);
  });
  return result.filter(group => group.length > 0);
}

function allocateCountsByGender(studentsByGender: Record<StudentGender, Student[]>, requestedTotal: number) {
  const activeGenders = (['male', 'female'] as const).filter(gender => studentsByGender[gender].length > 0);
  const totalStudents = activeGenders.reduce((sum, gender) => sum + studentsByGender[gender].length, 0);
  const totalGroups = Math.max(activeGenders.length, Math.floor(requestedTotal));
  const counts: Record<StudentGender, number> = { male: 0, female: 0 };

  activeGenders.forEach(gender => {
    counts[gender] = 1;
  });

  let remaining = totalGroups - activeGenders.length;
  while (remaining > 0) {
    const nextGender = activeGenders
      .map(gender => ({
        gender,
        deficit: (studentsByGender[gender].length / totalStudents) * totalGroups - counts[gender],
      }))
      .sort((a, b) => {
        if (b.deficit !== a.deficit) return b.deficit - a.deficit;
        return counts[a.gender] - counts[b.gender];
      })[0].gender;
    counts[nextGender] += 1;
    remaining -= 1;
  }

  return counts;
}

function toGroup(
  event: SportEventKey,
  gender: TestSessionGroupGender,
  students: Student[],
  groupNumber: number,
): TestSessionGroup {
  const genderLabel = gender === 'male' ? '男生' : gender === 'female' ? '女生' : '混合';
  return {
    id: `${event}-${gender}-${groupNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${genderLabel}第${groupNumber}组`,
    marker: '',
    gender,
    members: students.map((student, index) => ({
      studentId: student.id,
      lane: event === 'hundred' ? index + 1 : undefined,
    })),
  };
}

export function createGroupingVersion({
  event,
  students,
  mode,
  groupSize = getDefaultGroupSize(event),
  groupCount = 1,
  existingVersionCount,
  now = new Date().toISOString(),
  rng = Math.random,
  source = 'generated',
}: CreateGroupingVersionOptions): TestSessionGroupingVersion {
  if (event === 'eightHundred') {
    const allStudents = shuffleStudents(students, rng);
    const chunks = mode === 'size'
      ? chunkBySize(allStudents, groupSize)
      : splitByCount(allStudents, groupCount);

    return {
      id: `${event}-v${existingVersionCount + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `版本 ${existingVersionCount + 1}`,
      event,
      createdAt: now,
      source,
      mode,
      groupSize: mode === 'size' ? Math.max(1, Math.floor(groupSize)) : undefined,
      groupCount: mode === 'count' ? Math.max(1, Math.floor(groupCount)) : undefined,
      groups: chunks.map((chunk, index) => toGroup(event, 'mixed', chunk, index + 1)),
    };
  }

  const byGender: Record<StudentGender, Student[]> = {
    male: shuffleStudents(students.filter(student => student.gender === 'male'), rng),
    female: shuffleStudents(students.filter(student => student.gender === 'female'), rng),
  };

  const chunksByGender: Record<StudentGender, Student[][]> = { male: [], female: [] };
  if (mode === 'size') {
    chunksByGender.male = chunkBySize(byGender.male, groupSize);
    chunksByGender.female = chunkBySize(byGender.female, groupSize);
  } else {
    const counts = allocateCountsByGender(byGender, groupCount);
    chunksByGender.male = splitByCount(byGender.male, counts.male);
    chunksByGender.female = splitByCount(byGender.female, counts.female);
  }

  const groups: TestSessionGroup[] = [];
  (['male', 'female'] as const).forEach(gender => {
    chunksByGender[gender].forEach(chunk => {
      groups.push(toGroup(event, gender, chunk, groups.length + 1));
    });
  });

  return {
    id: `${event}-v${existingVersionCount + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `版本 ${existingVersionCount + 1}`,
    event,
    createdAt: now,
    source,
    mode,
    groupSize: mode === 'size' ? Math.max(1, Math.floor(groupSize)) : undefined,
    groupCount: mode === 'count' ? Math.max(1, Math.floor(groupCount)) : undefined,
    groups,
  };
}

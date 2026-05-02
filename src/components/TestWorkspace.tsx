import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  ChevronDown,
  CheckCircle,
  Clock,
  Download,
  Edit3,
  FileUp,
  Filter,
  Flag,
  LayoutGrid,
  List,
  LockKeyhole,
  Minus,
  Plus,
  Save,
  SaveAll,
  Search,
  Mic,
  MicOff,
  MessageSquare,
  SlidersHorizontal,
  Shuffle,
  Target,
  Trash2,
  Trophy,
  Undo2,
  Users,
  Zap,
  Ruler,
} from 'lucide-react';
import type WebAudioSpeechRecognizer from 'tencentcloud-speech-sdk-js/app/webaudiospeechrecognizer.js';
import {
  GroupingMode,
  ScoreSet,
  SportEventKey,
  Student,
  TestRecord,
  TestSession,
  TestSessionGroup,
  TestSessionGroupingVersion,
} from '../types';
import {
  canEditGroupSchedule,
  createGroupingVersion,
  getDefaultGroupSize,
  getDefaultTrialCount,
  getDisplayGroupStartTime,
  getEntryViewVersionId,
  getEntryVersionId,
  getEventLabel,
  getLatestGroupingVersion,
  getPresentStudentsForSession,
  getTileScaleConfig,
  getUnlockedEntryVersionIds,
  isGroupingLocked,
  nextTrialCount,
  previousTrialCount,
  removeGroupById,
  swapGroupMembers,
} from '../lib/grouping';
import { RecordTarget } from '../lib/testRecords';
import {
  buildScoreSyncUndoSnapshots,
  buildScoreSyncUpdates,
  ScoreSyncUndoSnapshot,
} from '../lib/scoreSync';
import {
  ENTRY_DRAFTS_STORAGE_KEY,
  ENTRY_DRAFT_COMMENTS_STORAGE_KEY,
  EntryDraftComments,
  EntryDraftInputs,
  getEntryDraftKey,
  removeEntryDraftCommentsForSessions,
  removeEntryDraftsForSessions,
  safeParseEntryDraftComments,
  safeParseEntryDrafts,
} from '../lib/entryDrafts';
import { formatTencentVoiceError, isTencentVoiceCloseCode } from '../lib/tencentVoiceError';
import {
  getDefaultVoiceApiSettings,
  loadVoiceApiSettings,
  normalizeVoiceApiSettings,
  VOICE_API_SETTINGS_KEY,
  VoiceApiSettings,
} from '../lib/tencentVoiceSettings';
import {
  BrowserVoiceActivityController,
  DEFAULT_VOICE_ACTIVITY_CONFIG,
  startBrowserVoiceActivityDetector,
  VoiceAutoStopReason,
} from '../lib/voiceActivityDetector';
import {
  buildVoiceContextTerms,
  buildVoiceRecognitionReview,
  VoiceNoteCandidate,
  VoiceRecognitionCandidate,
  VoiceRecognitionMode,
  VoiceRecognitionReview,
  VoiceScoreCandidate,
} from '../lib/voiceRecognitionPipeline';
import { createEmptyVoiceSessionState } from '../lib/voiceSessionState';
import {
  parsePrearrangedWorkbook,
  PrearrangedImportResult,
  PrearrangedStudentImportMode,
} from '../lib/prearrangedImport';
import {
  readFirstSheetObjects,
  readWorkbookMatrices,
  writeObjectRowsFile,
} from '../lib/tableWorkbook';
import { cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';

interface TestWorkspaceProps {
  view: 'grouping' | 'entry';
  students: Student[];
  records: Record<string, TestRecord[]>;
  testSessions: TestSession[];
  currentYearId: string;
  onAddTestSession: (name: string, date: string, yearId: string, absentStudentIds?: string[]) => TestSession;
  onUpdateTestSession: (sessionId: string, updates: Partial<TestSession>) => void;
  onDeleteTestSession: (sessionId: string) => void;
  onAddGroupingVersion: (sessionId: string, event: SportEventKey, version: TestSessionGroupingVersion) => void;
  onUpdateGroupingVersion: (
    sessionId: string,
    event: SportEventKey,
    versionId: string,
    updates: Partial<TestSessionGroupingVersion>,
  ) => void;
  onUpdateStudent: (id: string, updates: Partial<Student>) => void;
  onSaveBatch: (
    updates: Array<{
      studentId: string;
      scores: Partial<ScoreSet>;
      comments?: Partial<Record<SportEventKey, string>>;
    } & RecordTarget>,
  ) => void;
  onRevertScoreSync: (
    target: RecordTarget,
    event: SportEventKey,
    snapshots: ScoreSyncUndoSnapshot[],
  ) => void;
  onApplyPrearrangedImport: (
    yearId: string,
    importResult: PrearrangedImportResult,
    mode?: PrearrangedStudentImportMode,
  ) => void;
}

const EVENT_CONFIG = [
  { id: 'hundred', label: '100米', icon: Zap, unit: '秒', type: 'min', color: 'text-orange-500' },
  { id: 'shotPut', label: '铅球', icon: Target, unit: '米', type: 'max', color: 'text-green-500' },
  { id: 'tripleJump', label: '三级跳', icon: Ruler, unit: '米', type: 'max', color: 'text-purple-500' },
  { id: 'eightHundred', label: '800米', icon: Trophy, unit: '秒', type: 'min', color: 'text-blue-500' },
] as const;

const today = () => new Date().toISOString().split('T')[0];

interface ScoreSyncHistoryItem {
  id: string;
  sessionId: string;
  versionId: string;
  event: SportEventKey;
  target: RecordTarget;
  scopeLabel: string;
  syncedAt: string;
  snapshots: ScoreSyncUndoSnapshot[];
}

type VoiceMessageTone = 'info' | 'success' | 'error';
type VoiceStopReason = 'manual' | 'timeout' | 'cleanup' | 'auto-silence' | 'no-speech';

const SCORE_SYNC_HISTORY_KEY = 'testing_group_score_sync_history';
const ENTRY_VERSION_SELECTIONS_KEY = 'testing_group_entry_version_selections';
const VOICE_MAX_RECOGNITION_MS = 55_000;

interface TencentCryptoWordArray {
  words: number[];
  sigBytes: number;
}

interface TencentCryptoJs {
  HmacSHA1: (message: string, key: string) => TencentCryptoWordArray;
}

function getMicrophoneAccessErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '麦克风权限被浏览器拦截，请允许麦克风后重试；也可以直接粘贴文本后点填入';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '没有找到可用麦克风，请检查设备后重试';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '麦克风正在被占用或系统权限未打开，请关闭占用后重试';
  }
  return '无法启动麦克风，请检查浏览器或系统权限；也可以直接粘贴文本后点填入';
}

function getTencentCryptoJs() {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { CryptoJSTest?: TencentCryptoJs }).CryptoJSTest || null;
}

function cryptoWordArrayToBytes(wordArray: TencentCryptoWordArray) {
  const bytes = new Uint8Array(wordArray.sigBytes);
  for (let index = 0; index < wordArray.sigBytes; index += 1) {
    bytes[index] = (wordArray.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
  }
  return bytes;
}

function bytesToBinaryString(bytes: Uint8Array) {
  let result = '';
  bytes.forEach(byte => {
    result += String.fromCharCode(byte);
  });
  return result;
}

function createTencentSignCallback(secretKey: string) {
  return (signStr: string) => {
    const cryptoJs = getTencentCryptoJs();
    if (!cryptoJs) throw new Error('腾讯云签名组件未加载，请刷新页面后重试');
    const hash = cryptoJs.HmacSHA1(signStr, secretKey);
    return btoa(bytesToBinaryString(cryptoWordArrayToBytes(hash)));
  };
}

function formatTencentSdkError(error: unknown) {
  if (typeof error === 'string') return error;
  if (error instanceof DOMException) return getMicrophoneAccessErrorMessage(error);
  return formatTencentVoiceError(error);
}

function getStudentLabel(student?: Student) {
  if (!student) return '未知学生';
  return `${student.name} #${student.studentNo}`;
}

function getGroupTone(gender: TestSessionGroup['gender']) {
  if (gender === 'male') return 'blue';
  if (gender === 'female') return 'pink';
  return 'emerald';
}

function getGroupLabel(gender: TestSessionGroup['gender'], long = false) {
  if (gender === 'male') return long ? '男运动员' : '男';
  if (gender === 'female') return long ? '女运动员' : '女';
  return long ? '混合组' : '混合';
}

function getMemberPositionLabel(event: SportEventKey, member: TestSessionGroup['members'][number], index: number) {
  if (event === 'hundred') return `${member.lane || index + 1}道`;
  return `顺序${member.order || index + 1}`;
}

function getImportEventSummaryText(importResult: PrearrangedImportResult) {
  const eventText = EVENT_CONFIG
    .map(event => {
      const summary = importResult.summary.eventSummaries[event.id];
      return summary ? `${event.label}${summary.groups}组/${summary.students}人` : '';
    })
    .filter(Boolean)
    .join('，');
  return eventText || '未识别项目';
}

function safeParseStringRecord(saved: string | null): Record<string, string> {
  if (!saved) return {};
  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function safeParseSyncHistory(saved: string | null): ScoreSyncHistoryItem[] {
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function TestWorkspace({
  view,
  students,
  records,
  testSessions,
  currentYearId,
  onAddTestSession,
  onUpdateTestSession,
  onDeleteTestSession,
  onAddGroupingVersion,
  onUpdateGroupingVersion,
  onUpdateStudent,
  onSaveBatch,
  onRevertScoreSync,
  onApplyPrearrangedImport,
}: TestWorkspaceProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<SportEventKey>('hundred');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [mode, setMode] = useState<GroupingMode>('size');
  const [groupSize, setGroupSize] = useState(getDefaultGroupSize('hundred'));
  const [groupCount, setGroupCount] = useState(4);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [newSessionDraft, setNewSessionDraft] = useState({
    name: '',
    date: today(),
    absentStudentIds: [] as string[],
    search: '',
  });
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [confirmUnlockGrouping, setConfirmUnlockGrouping] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savedToastText, setSavedToastText] = useState('');
  const [isUndoSyncOpen, setIsUndoSyncOpen] = useState(false);
  const [undoStudentIds, setUndoStudentIds] = useState<string[]>([]);
  const [entryVersionSelections, setEntryVersionSelections] = useState<Record<string, string>>(() => (
    safeParseStringRecord(localStorage.getItem(ENTRY_VERSION_SELECTIONS_KEY))
  ));
  const [groupingDisplayMode, setGroupingDisplayMode] = useState<'detail' | 'tile'>('detail');
  const [tileScale, setTileScale] = useState(80);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [pendingPrearrangedImport, setPendingPrearrangedImport] = useState<PrearrangedImportResult | null>(null);
  const [prearrangedStudentMode, setPrearrangedStudentMode] = useState<PrearrangedStudentImportMode>('appendMissing');
  const [swapSelection, setSwapSelection] = useState<{ groupId: string; studentId: string } | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [voiceMessageTone, setVoiceMessageTone] = useState<VoiceMessageTone>('info');
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);
  const [isVoiceModeMenuOpen, setIsVoiceModeMenuOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceRecognitionMode>('score');
  const [voiceSettings, setVoiceSettings] = useState<VoiceApiSettings>(() => loadVoiceApiSettings());
  const [voiceSettingsDraft, setVoiceSettingsDraft] = useState<VoiceApiSettings>(() => loadVoiceApiSettings());
  const [pendingVoiceReviewItems, setPendingVoiceReviewItems] = useState<VoiceRecognitionCandidate[]>([]);
  const [voiceUnmatchedSegments, setVoiceUnmatchedSegments] = useState<string[]>([]);
  const [voiceContextTermCount, setVoiceContextTermCount] = useState(0);
  const voiceRecognizerRef = useRef<WebAudioSpeechRecognizer | null>(null);
  const voiceActivityDetectorRef = useRef<BrowserVoiceActivityController | null>(null);
  const voiceResultTextRef = useRef('');
  const voiceModeRef = useRef<VoiceRecognitionMode>('score');
  const voiceMaxTimerRef = useRef<number | null>(null);
  const voiceStopReasonRef = useRef<VoiceStopReason | null>(null);
  const voiceStartTokenRef = useRef(0);
  const [syncHistory, setSyncHistory] = useState<ScoreSyncHistoryItem[]>(() => {
    return safeParseSyncHistory(localStorage.getItem(SCORE_SYNC_HISTORY_KEY));
  });

  const [draftInputs, setDraftInputs] = useState<EntryDraftInputs>(() => {
    return safeParseEntryDrafts(localStorage.getItem(ENTRY_DRAFTS_STORAGE_KEY));
  });
  const [draftComments, setDraftComments] = useState<EntryDraftComments>(() => {
    return safeParseEntryDraftComments(localStorage.getItem(ENTRY_DRAFT_COMMENTS_STORAGE_KEY));
  });

  useEffect(() => {
    localStorage.setItem(ENTRY_DRAFTS_STORAGE_KEY, JSON.stringify(draftInputs));
  }, [draftInputs]);

  useEffect(() => {
    localStorage.setItem(ENTRY_DRAFT_COMMENTS_STORAGE_KEY, JSON.stringify(draftComments));
  }, [draftComments]);

  useEffect(() => {
    localStorage.setItem(SCORE_SYNC_HISTORY_KEY, JSON.stringify(syncHistory));
  }, [syncHistory]);

  useEffect(() => {
    localStorage.setItem(ENTRY_VERSION_SELECTIONS_KEY, JSON.stringify(entryVersionSelections));
  }, [entryVersionSelections]);

  const showVoiceMessage = (message: string, tone: VoiceMessageTone = 'info') => {
    setVoiceMessage(message);
    setVoiceMessageTone(tone);
  };

  const hasSavedVoiceSettings = Boolean(
    voiceSettings.appId.trim() &&
    voiceSettings.secretId.trim() &&
    voiceSettings.secretKey.trim(),
  );

  const openVoiceSettings = () => {
    setVoiceSettingsDraft(voiceSettings);
    setIsVoiceSettingsOpen(true);
  };

  const saveVoiceSettings = () => {
    const nextSettings = normalizeVoiceApiSettings(voiceSettingsDraft);
    localStorage.setItem(VOICE_API_SETTINGS_KEY, JSON.stringify(nextSettings));
    setVoiceSettings(nextSettings);
    setIsVoiceSettingsOpen(false);
    showVoiceMessage('语音 API 设置已保存到当前浏览器', 'success');
  };

  const clearVoiceSettings = () => {
    localStorage.removeItem(VOICE_API_SETTINGS_KEY);
    const emptySettings = getDefaultVoiceApiSettings();
    setVoiceSettings(emptySettings);
    setVoiceSettingsDraft(emptySettings);
    showVoiceMessage('已清空当前浏览器里的语音 API 设置', 'info');
  };

  const clearVoiceTimers = () => {
    if (voiceMaxTimerRef.current !== null) {
      window.clearTimeout(voiceMaxTimerRef.current);
      voiceMaxTimerRef.current = null;
    }
  };

  const stopVoiceActivityDetector = () => {
    const detector = voiceActivityDetectorRef.current;
    voiceActivityDetectorRef.current = null;
    detector?.stop();
  };

  const resetVoiceRecognizer = (shouldStop = true) => {
    clearVoiceTimers();
    stopVoiceActivityDetector();
    const recognizer = voiceRecognizerRef.current;
    voiceRecognizerRef.current = null;
    if (!shouldStop) return;
    try {
      recognizer?.stop();
    } catch {
      // Tencent SDK may throw if websocket has not been established yet.
    }
  };

  useEffect(() => {
    return () => {
      voiceStopReasonRef.current = 'cleanup';
      resetVoiceRecognizer();
    };
  }, []);

  const sortedSessions = useMemo(
    () => [...testSessions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [testSessions],
  );

  useEffect(() => {
    if (sortedSessions.length === 0) {
      setActiveSessionId(null);
      return;
    }
    if (!activeSessionId || !sortedSessions.some(session => session.id === activeSessionId)) {
      setActiveSessionId(sortedSessions[0].id);
    }
  }, [sortedSessions, activeSessionId]);

  useEffect(() => {
    setGroupSize(getDefaultGroupSize(activeEvent));
    setSelectedGroupId(null);
    setSwapSelection(null);
  }, [activeEvent]);

  const activeSession = sortedSessions.find(session => session.id === activeSessionId) || null;
  const isGroupingView = view === 'grouping';
  const isEntryView = view === 'entry';
  const versions = activeSession?.groupingVersions[activeEvent] || [];
  const entrySelectionKey = activeSession ? `${activeSession.id}:${activeEvent}` : '';
  const entryVersionId = activeSession ? getEntryVersionId(activeSession, activeEvent, versions) : undefined;
  const groupingLocked = activeSession ? isGroupingLocked(activeSession, activeEvent) : false;
  const viewVersionId = groupingLocked
    ? entryVersionId
    : activeSession?.activeVersionIds[activeEvent] || getLatestGroupingVersion(versions)?.id;
  const selectedEntryVersionId = entrySelectionKey ? entryVersionSelections[entrySelectionKey] : undefined;
  const activeVersionId = isEntryView
    ? getEntryViewVersionId({ entryVersionId, selectedEntryVersionId, viewVersionId })
    : viewVersionId;
  const activeVersion = versions.find(version => version.id === activeVersionId) || getLatestGroupingVersion(versions);
  const isActiveVersionEntryVersion = Boolean(
    activeVersion && activeSession?.entryVersionIds?.[activeEvent] === activeVersion.id,
  );
  const entryVersion = versions.find(version => version.id === entryVersionId) || null;
  const canSaveEntryScores = isEntryView && Boolean(activeVersion && activeVersion.id === entryVersionId);
  const selectedGroup = activeVersion?.groups.find(group => group.id === selectedGroupId) || activeVersion?.groups[0] || null;
  const eventConfig = EVENT_CONFIG.find(event => event.id === activeEvent)!;
  const draftKey = activeSession && activeVersion ? getEntryDraftKey(activeSession.id, activeEvent, activeVersion.id) : '';
  const trialCount = activeSession?.trialConfigs[activeEvent] || getDefaultTrialCount(activeEvent);
  const groupScheduleConfig = activeSession?.groupScheduleConfigs?.[activeEvent] || { startTime: '', intervalMinutes: 0 };
  const scheduleIntervalHours = Math.floor((groupScheduleConfig.intervalMinutes || 0) / 60);
  const scheduleIntervalMinutes = (groupScheduleConfig.intervalMinutes || 0) % 60;
  const canEditCurrentGroupSchedule = canEditGroupSchedule(groupingLocked);
  const presentStudents = useMemo(
    () => getPresentStudentsForSession(students, activeSession),
    [students, activeSession],
  );
  const canModifyGrouping = isGroupingView && !groupingLocked;
  const tileConfig = useMemo(() => getTileScaleConfig(tileScale), [tileScale]);
  const newSessionAbsentIds = useMemo(
    () => new Set(newSessionDraft.absentStudentIds),
    [newSessionDraft.absentStudentIds],
  );
  const filteredCreateSessionStudents = useMemo(() => {
    const keyword = newSessionDraft.search.trim().toLowerCase();
    return [...students]
      .sort((a, b) => (a.studentNo || '').localeCompare(b.studentNo || ''))
      .filter(student => {
        if (!keyword) return true;
        return (
          student.name.toLowerCase().includes(keyword) ||
          student.studentNo.toLowerCase().includes(keyword) ||
          (student.gender === 'female' ? '女生' : '男生').includes(keyword)
        );
    });
  }, [students, newSessionDraft.search]);
  const canConfirmCreateSession = newSessionDraft.name.trim().length > 0 && newSessionDraft.date.trim().length > 0;
  const activeRecordTarget = activeSession ? {
    date: activeSession.date,
    testSessionId: activeSession.id,
    testName: activeSession.name,
  } : null;
  const latestSyncHistoryItem = useMemo(() => {
    if (!activeSession || !activeVersion) return null;
    return syncHistory.find(item => (
      item.sessionId === activeSession.id &&
      item.versionId === activeVersion.id &&
      item.event === activeEvent &&
      item.snapshots.length > 0
    )) || null;
  }, [activeSession, activeVersion, activeEvent, syncHistory]);
  const undoSelection = useMemo(() => new Set(undoStudentIds), [undoStudentIds]);
  const selectedGroupIndex = activeVersion && selectedGroup
    ? activeVersion.groups.findIndex(group => group.id === selectedGroup.id)
    : -1;
  const selectedGroupStartTime = selectedGroupIndex >= 0 && selectedGroup
    ? getDisplayGroupStartTime(selectedGroup, groupScheduleConfig, selectedGroupIndex)
    : '';
  useEffect(() => {
    if (!activeVersion || activeVersion.groups.length === 0) {
      setSelectedGroupId(null);
      return;
    }
    if (!selectedGroupId || !activeVersion.groups.some(group => group.id === selectedGroupId)) {
      setSelectedGroupId(activeVersion.groups[0].id);
    }
  }, [activeVersion, selectedGroupId]);

  const studentsById = useMemo(
    () => new Map(students.map(student => [student.id, student])),
    [students],
  );

  const openCreateSessionModal = () => {
    setNewSessionDraft({
      name: `测试${testSessions.length + 1}`,
      date: today(),
      absentStudentIds: [],
      search: '',
    });
    setIsCreateSessionOpen(true);
  };

  const handleCreateSession = () => {
    if (!canConfirmCreateSession) return;
    const session = onAddTestSession(
      newSessionDraft.name.trim(),
      newSessionDraft.date,
      currentYearId,
      newSessionDraft.absentStudentIds,
    );
    setActiveSessionId(session.id);
    setSelectedGroupId(null);
    setIsCreateSessionOpen(false);
  };

  const toggleNewSessionAbsence = (studentId: string) => {
    setNewSessionDraft(prev => {
      const selected = new Set(prev.absentStudentIds);
      if (selected.has(studentId)) {
        selected.delete(studentId);
      } else {
        selected.add(studentId);
      }
      return {
        ...prev,
        absentStudentIds: Array.from(selected),
      };
    });
  };

  const handleUnlockGrouping = () => {
    if (!activeSession) return;
    onUpdateTestSession(activeSession.id, {
      activeVersionIds: activeVersion ? {
        ...activeSession.activeVersionIds,
        [activeEvent]: activeVersion.id,
      } : activeSession.activeVersionIds,
      entryVersionIds: getUnlockedEntryVersionIds(activeSession, activeEvent),
    });
    setSwapSelection(null);
  };

  const updateActiveSession = (updates: Partial<TestSession>) => {
    if (!activeSession) return;
    onUpdateTestSession(activeSession.id, updates);
  };

  const handleSelectVersion = (versionId: string) => {
    if (!activeSession) return;
    if (isGroupingView && groupingLocked) return;
    if (isEntryView) {
      setEntryVersionSelections(prev => ({
        ...prev,
        [`${activeSession.id}:${activeEvent}`]: versionId,
      }));
      setSelectedGroupId(null);
      return;
    }

    onUpdateTestSession(activeSession.id, {
      activeVersionIds: {
        ...activeSession.activeVersionIds,
        [activeEvent]: versionId,
      },
    });
    setSelectedGroupId(null);
  };

  const handleSetEntryVersion = () => {
    if (!activeSession || !activeVersion) return;
    onUpdateTestSession(activeSession.id, {
      activeVersionIds: {
        ...activeSession.activeVersionIds,
        [activeEvent]: activeVersion.id,
      },
      entryVersionIds: {
        ...activeSession.entryVersionIds,
        [activeEvent]: activeVersion.id,
      },
    });
  };

  const updateGroupScheduleConfig = (updates: { startTime?: string; intervalMinutes?: number }) => {
    if (!activeSession || !canEditCurrentGroupSchedule) return;
    const nextIntervalMinutes = updates.intervalMinutes ?? groupScheduleConfig.intervalMinutes ?? 0;
    onUpdateTestSession(activeSession.id, {
      groupScheduleConfigs: {
        ...(activeSession.groupScheduleConfigs || {}),
        [activeEvent]: {
          startTime: updates.startTime ?? groupScheduleConfig.startTime ?? '',
          intervalMinutes: Math.max(0, Math.floor(nextIntervalMinutes)),
        },
      },
    });
  };

  const updateGroupScheduleInterval = (hours: number, minutes: number) => {
    const normalizedHours = Math.max(0, Math.floor(hours) || 0);
    const normalizedMinutes = Math.min(59, Math.max(0, Math.floor(minutes) || 0));
    updateGroupScheduleConfig({ intervalMinutes: normalizedHours * 60 + normalizedMinutes });
  };

  const handleGenerateVersion = () => {
    if (!activeSession || groupingLocked || presentStudents.length === 0) return;
    const version = createGroupingVersion({
      event: activeEvent,
      students: presentStudents,
      mode,
      groupSize,
      groupCount,
      existingVersionCount: versions.length,
    });
    onAddGroupingVersion(activeSession.id, activeEvent, version);
    setSelectedGroupId(version.groups[0]?.id || null);
  };

  const updateGroups = (groups: TestSessionGroup[]) => {
    if (!activeSession || !activeVersion || groupingLocked) return;
    onUpdateGroupingVersion(activeSession.id, activeEvent, activeVersion.id, { groups });
  };

  const updateGroup = (groupId: string, updates: Partial<TestSessionGroup>) => {
    if (!activeVersion) return;
    updateGroups(activeVersion.groups.map(group => (
      group.id === groupId ? { ...group, ...updates } : group
    )));
  };

  const handleDeleteSession = () => {
    if (!activeSession) return;
    const remainingSessions = sortedSessions.filter(session => session.id !== activeSession.id);
    onDeleteTestSession(activeSession.id);
    setActiveSessionId(remainingSessions[0]?.id || null);
    setSelectedGroupId(null);
  };

  const handleDeleteSelectedGroup = () => {
    if (!activeVersion || !selectedGroup || groupingLocked) return;
    const nextGroups = removeGroupById(activeVersion.groups, selectedGroup.id);
    updateGroups(nextGroups);
    setSelectedGroupId(nextGroups[0]?.id || null);
  };

  const handleMemberSwapClick = (groupId: string, studentId: string) => {
    if (!isGroupingView || !activeVersion || groupingLocked) return;
    if (!swapSelection) {
      setSwapSelection({ groupId, studentId });
      return;
    }
    if (swapSelection.groupId === groupId && swapSelection.studentId === studentId) {
      setSwapSelection(null);
      return;
    }

    updateGroups(swapGroupMembers(
      activeVersion.groups,
      swapSelection,
      { groupId, studentId },
      activeEvent,
    ));
    setSwapSelection(null);
  };

  const startEditingStudentName = (studentId: string, name: string) => {
    if (groupingLocked) return;
    setEditingStudentId(studentId);
    setEditingName(name);
    setSwapSelection(null);
  };

  const handleStudentNameCommit = (studentId: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onUpdateStudent(studentId, { name: trimmed });
    }
    setEditingStudentId(null);
    setEditingName('');
  };

  const handleDraftChange = (studentId: string, trialIndex: number, value: string) => {
    if (!draftKey) return;
    setDraftInputs(prev => {
      const versionDraft = prev[draftKey] || {};
      const current = [...(versionDraft[studentId] || [])];
      while (current.length <= trialIndex) current.push('');
      current[trialIndex] = value;
      return {
        ...prev,
        [draftKey]: {
          ...versionDraft,
          [studentId]: current,
        },
      };
    });
  };

  const handleDraftCommentChange = (studentId: string, value: string) => {
    if (!draftKey) return;
    setDraftComments(prev => {
      const versionComments = prev[draftKey] || {};
      return {
        ...prev,
        [draftKey]: {
          ...versionComments,
          [studentId]: value,
        },
      };
    });
  };

  const updateDraftCommentsFromVoice = (notes: Array<Pick<VoiceNoteCandidate, 'studentId' | 'note'>>) => {
    if (!draftKey || notes.length === 0) return;
    setDraftComments(prev => {
      const versionComments = { ...(prev[draftKey] || {}) };
      notes.forEach(note => {
        versionComments[note.studentId] = note.note;
      });
      return { ...prev, [draftKey]: versionComments };
    });
  };

  const applyVoiceScoreCandidatesToDraft = (scoreCandidates: VoiceScoreCandidate[]) => {
    if (!draftKey || scoreCandidates.length === 0) return;
    setDraftInputs(prev => {
      const versionDraft = { ...(prev[draftKey] || {}) };
      scoreCandidates.forEach(candidate => {
        const current = [...(versionDraft[candidate.studentId] || [])];
        while (current.length < trialCount) current.push('');
        const firstEmptyIndex = current.findIndex(value => !value);
        const index = candidate.trialIndex ?? (firstEmptyIndex >= 0 ? firstEmptyIndex : 0);
        current[index] = candidate.value;
        versionDraft[candidate.studentId] = current;
      });
      return { ...prev, [draftKey]: versionDraft };
    });
  };

  const applyVoiceCandidatesToDraft = (candidates: VoiceRecognitionCandidate[]) => {
    const scoreCandidates = candidates.filter((candidate): candidate is VoiceScoreCandidate => candidate.type === 'score');
    const noteCandidates = candidates.filter((candidate): candidate is VoiceNoteCandidate => candidate.type === 'note');
    applyVoiceScoreCandidatesToDraft(scoreCandidates);
    updateDraftCommentsFromVoice(noteCandidates);
  };

  const applyVoiceReviewToDraft = (review: VoiceRecognitionReview, shouldKeepText: boolean) => {
    setVoiceText(shouldKeepText ? review.normalizedText : '');
    setVoiceContextTermCount(review.contextTerms.length);
    setPendingVoiceReviewItems(review.reviewRequiredCandidates);
    setVoiceUnmatchedSegments(review.unmatchedSegments);

    if (review.autoApplicableCandidates.length > 0) {
      applyVoiceCandidatesToDraft(review.autoApplicableCandidates);
    }

    const hasAppliedItems = review.autoApplicableCandidates.length > 0;
    const parts = [
      hasAppliedItems ? `已自动填入 ${review.autoApplicableCandidates.length} 条` : '',
      review.reviewRequiredCandidates.length > 0 ? `${review.reviewRequiredCandidates.length} 条需要确认` : '',
      review.unmatchedSegments.length > 0 ? `${review.unmatchedSegments.length} 句未识别` : '',
    ].filter(Boolean);
    showVoiceMessage(parts.join('，') || '没有识别到成绩', hasAppliedItems ? 'success' : review.reviewRequiredCandidates.length > 0 ? 'info' : 'error');
  };

  const buildCurrentVoiceReview = (text: string, mode: VoiceRecognitionMode = voiceModeRef.current) => {
    if (!selectedGroup || !draftKey || !text.trim()) return null;
    return buildVoiceRecognitionReview({
      text,
      students,
      group: selectedGroup,
      event: activeEvent,
      trialCount,
      mode,
    });
  };

  const applyVoiceTextToDraft = () => {
    const review = buildCurrentVoiceReview(voiceText);
    if (!review) return;
    applyVoiceReviewToDraft(review, true);
  };

  const finishRecognizedVoiceResult = () => {
    const recognizedText = voiceResultTextRef.current.trim();
    voiceResultTextRef.current = '';
    if (!recognizedText) {
      const emptyVoiceState = createEmptyVoiceSessionState();
      setVoiceText(emptyVoiceState.text);
      setPendingVoiceReviewItems(emptyVoiceState.reviewItems);
      setVoiceUnmatchedSegments(emptyVoiceState.unmatchedSegments);
      setVoiceContextTermCount(emptyVoiceState.contextTermCount);
      return false;
    }

    const review = buildCurrentVoiceReview(recognizedText);
    if (!review) {
      setVoiceText('');
      return false;
    }
    applyVoiceReviewToDraft(review, false);
    return true;
  };

  const confirmVoiceReviewItem = (candidate: VoiceRecognitionCandidate) => {
    applyVoiceCandidatesToDraft([candidate]);
    setPendingVoiceReviewItems(prev => prev.filter(item => item.id !== candidate.id));
    showVoiceMessage('已确认并填入 1 条语音结果', 'success');
  };

  const confirmAllVoiceReviewItems = () => {
    if (pendingVoiceReviewItems.length === 0) return;
    applyVoiceCandidatesToDraft(pendingVoiceReviewItems);
    setPendingVoiceReviewItems([]);
    showVoiceMessage(`已确认并填入 ${pendingVoiceReviewItems.length} 条语音结果`, 'success');
  };

  const ignoreVoiceReviewItem = (candidate: VoiceRecognitionCandidate) => {
    setPendingVoiceReviewItems(prev => prev.filter(item => item.id !== candidate.id));
    showVoiceMessage('已忽略 1 条待确认结果', 'info');
  };

  const clearVoiceInput = () => {
    const emptyVoiceState = createEmptyVoiceSessionState();
    setVoiceText(emptyVoiceState.text);
    setPendingVoiceReviewItems(emptyVoiceState.reviewItems);
    setVoiceUnmatchedSegments(emptyVoiceState.unmatchedSegments);
    setVoiceContextTermCount(emptyVoiceState.contextTermCount);
    voiceResultTextRef.current = '';
    showVoiceMessage('');
  };

  const handleVoiceTextChange = (value: string) => {
    setVoiceText(value);
    setPendingVoiceReviewItems([]);
    setVoiceUnmatchedSegments([]);
    if (!value.trim()) setVoiceContextTermCount(0);
  };

  const getVoiceReviewItemStudentLabel = (candidate: VoiceRecognitionCandidate) => (
    getStudentLabel(studentsById.get(candidate.studentId))
  );

  const getVoiceReviewItemValueLabel = (candidate: VoiceRecognitionCandidate) => {
    if (candidate.type === 'note') return `批注：${candidate.note}`;
    const trialText = candidate.trialIndex === null ? '自动选择空位' : `第 ${candidate.trialIndex + 1} 次`;
    return `${trialText}：${candidate.value}`;
  };

  const stopVoiceListening = (reason: VoiceStopReason = 'manual') => {
    if (!isListening && !isProcessingVoice && reason !== 'cleanup') return;
    voiceStopReasonRef.current = reason;
    voiceStartTokenRef.current += 1;
    const hasProcessedResult = reason === 'cleanup' ? false : finishRecognizedVoiceResult();
    resetVoiceRecognizer();
    setIsListening(false);
    setIsProcessingVoice(false);
    if (hasProcessedResult) return;
    if (reason === 'manual') {
      showVoiceMessage('已结束，没有收到识别文本', 'info');
    } else if (reason === 'auto-silence') {
      showVoiceMessage('检测到说话结束，但没有收到文本', 'info');
    } else if (reason === 'no-speech') {
      showVoiceMessage('长时间没有听到有效语音，已自动结束', 'info');
    } else if (reason === 'timeout') {
      showVoiceMessage('已达到最长识别时间，系统已自动结束', 'info');
    }
  };

  const startLocalVoiceActivityDetection = async (startToken: number) => {
    try {
      const detector = await startBrowserVoiceActivityDetector(DEFAULT_VOICE_ACTIVITY_CONFIG, {
        onAutoStop: (reason: VoiceAutoStopReason) => {
          if (voiceStartTokenRef.current !== startToken) return;
          stopVoiceListening(reason === 'no-speech' ? 'no-speech' : 'auto-silence');
        },
      });
      if (voiceStartTokenRef.current !== startToken) {
        detector.stop();
        return;
      }
      voiceActivityDetectorRef.current = detector;
    } catch (error) {
      if (error instanceof DOMException) throw error;
      showVoiceMessage('本地语音结束检测不可用，仍可手动结束录入', 'info');
    }
  };

  const startVoiceListening = async (mode: VoiceRecognitionMode) => {
    if (!selectedGroup) {
      showVoiceMessage('请先选择一个分组，再使用语音录入', 'error');
      return;
    }
    if (isProcessingVoice) return;
    if (!hasSavedVoiceSettings) {
      showVoiceMessage('请先填写并保存 AppId、SecretId、SecretKey', 'error');
      openVoiceSettings();
      return;
    }

    const startToken = voiceStartTokenRef.current + 1;
    const emptyVoiceState = createEmptyVoiceSessionState();
    voiceModeRef.current = mode;
    voiceStartTokenRef.current = startToken;
    voiceResultTextRef.current = '';
    setVoiceText(emptyVoiceState.text);
    setPendingVoiceReviewItems(emptyVoiceState.reviewItems);
    setVoiceUnmatchedSegments(emptyVoiceState.unmatchedSegments);
    setVoiceContextTermCount(emptyVoiceState.contextTermCount);
    setIsProcessingVoice(true);
    setIsListening(false);
    setVoiceMode(mode);
    setIsVoiceModeMenuOpen(false);
    showVoiceMessage('正在加载腾讯云语音组件...', 'info');

    try {
      await startLocalVoiceActivityDetection(startToken);
      if (voiceStartTokenRef.current !== startToken) return;

      const { default: WebAudioSpeechRecognizerClass } = await import('tencentcloud-speech-sdk-js/app/webaudiospeechrecognizer.js');
      if (voiceStartTokenRef.current !== startToken) return;
      const contextTerms = buildVoiceContextTerms({
        students,
        group: selectedGroup,
        event: activeEvent,
      });
      setVoiceContextTermCount(contextTerms.length);

      const recognizer = new WebAudioSpeechRecognizerClass({
        appid: voiceSettings.appId,
        secretid: voiceSettings.secretId,
        signCallback: createTencentSignCallback(voiceSettings.secretKey),
        engine_model_type: voiceSettings.engine,
        voice_format: 1,
        ...(voiceSettings.hotwordId ? { hotword_id: voiceSettings.hotwordId } : {}),
        needvad: 1,
        filter_dirty: 0,
        filter_modal: 1,
        filter_punc: 1,
        convert_num_mode: 1,
        word_info: 0,
        vad_silence_time: 1600,
      });
      voiceRecognizerRef.current = recognizer;
      voiceResultTextRef.current = '';
      voiceStopReasonRef.current = null;
      showVoiceMessage('正在连接腾讯云实时识别...', 'info');

      recognizer.OnRecognitionStart = () => {
        if (voiceRecognizerRef.current !== recognizer) return;
        setIsProcessingVoice(false);
        setIsListening(true);
        showVoiceMessage(
          mode === 'note'
            ? '技术批注录入中：可说“姓名/道次 + 批注内容”，系统会尝试自动结束'
            : '成绩录入中：可说“道次/姓名 + 成绩”，系统会尝试自动结束',
          'info',
        );
      };
      recognizer.OnSentenceBegin = () => {
        if (voiceRecognizerRef.current !== recognizer) return;
        setIsProcessingVoice(false);
        setIsListening(true);
      };
      recognizer.OnRecognitionResultChange = res => {
        if (voiceRecognizerRef.current !== recognizer) return;
        const text = (res.voice_text_str || '').trim();
        if (text) showVoiceMessage(`正在识别：${voiceResultTextRef.current}${text}`, 'info');
      };
      recognizer.OnSentenceEnd = res => {
        if (voiceRecognizerRef.current !== recognizer) return;
        const text = (res.voice_text_str || '').trim();
        if (!text) return;
        voiceResultTextRef.current += text;
        setVoiceText(prev => prev ? `${prev}，${text}` : text);
        showVoiceMessage(`已识别：${text}`, 'success');
      };
      recognizer.OnRecognitionComplete = () => {
        if (voiceRecognizerRef.current !== recognizer) return;
        const hasProcessedResult = finishRecognizedVoiceResult();
        resetVoiceRecognizer(false);
        setIsListening(false);
        setIsProcessingVoice(false);
        if (!hasProcessedResult) {
          showVoiceMessage('识别结束，没有收到文本', 'error');
        }
      };
      let hasShownSdkError = false;
      recognizer.OnError = error => {
        if (voiceRecognizerRef.current !== recognizer && voiceStopReasonRef.current === 'manual') return;
        if (hasShownSdkError && isTencentVoiceCloseCode(error, 1006)) return;
        hasShownSdkError = true;
        resetVoiceRecognizer(false);
        setIsListening(false);
        setIsProcessingVoice(false);
        showVoiceMessage(formatTencentSdkError(error), 'error');
      };
      voiceMaxTimerRef.current = window.setTimeout(() => {
        stopVoiceListening('timeout');
      }, VOICE_MAX_RECOGNITION_MS);
      recognizer.start();
    } catch (error) {
      if (voiceStartTokenRef.current !== startToken) return;
      resetVoiceRecognizer();
      setIsListening(false);
      setIsProcessingVoice(false);
      showVoiceMessage(formatTencentSdkError(error), 'error');
    }
  };

  const toggleVoiceListening = () => {
    if (isListening || isProcessingVoice) {
      stopVoiceListening('manual');
      return;
    }
    setIsVoiceModeMenuOpen(prev => !prev);
  };

  const startVoiceListeningWithMode = (mode: VoiceRecognitionMode) => {
    void startVoiceListening(mode);
  };

  const handleAddTrial = () => {
    if (!activeSession || trialCount >= 10) return;
    onUpdateTestSession(activeSession.id, {
      trialConfigs: {
        ...activeSession.trialConfigs,
        [activeEvent]: nextTrialCount(trialCount),
      },
    });
  };

  const handleRemoveTrial = () => {
    if (!activeSession || trialCount <= 1) return;
    onUpdateTestSession(activeSession.id, {
      trialConfigs: {
        ...activeSession.trialConfigs,
        [activeEvent]: previousTrialCount(trialCount),
      },
    });
  };

  const showSyncToast = (message: string) => {
    setSavedToastText(message);
    window.setTimeout(() => setSavedToastText(''), 1800);
  };

  const handleSaveScoresForGroups = (groupsToSync: TestSessionGroup[], scopeLabel: string) => {
    if (!activeSession || !activeVersion || !activeRecordTarget || !draftKey || !canSaveEntryScores) return;
    const versionDraft = draftInputs[draftKey] || {};
    const versionComments = draftComments[draftKey] || {};
    const updates = buildScoreSyncUpdates({
      groups: groupsToSync,
      event: activeEvent,
      trialCount,
      target: activeRecordTarget,
      draft: versionDraft,
      comments: versionComments,
    });

    if (updates.length === 0) return;
    const snapshots = buildScoreSyncUndoSnapshots({
      records,
      target: activeRecordTarget,
      event: activeEvent,
      updates,
    });

    onSaveBatch(updates);
    setSyncHistory(prev => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: activeSession.id,
      versionId: activeVersion.id,
      event: activeEvent,
      target: activeRecordTarget,
      scopeLabel,
      syncedAt: new Date().toISOString(),
      snapshots,
    }, ...prev].slice(0, 50));
    showSyncToast(`${scopeLabel}已同步 ${updates.length} 人`);
  };

  const handleSaveGroupScores = () => {
    if (!selectedGroup) return;
    handleSaveScoresForGroups([selectedGroup], '本组成绩');
  };

  const handleSaveAllGroupScores = () => {
    if (!activeVersion) return;
    handleSaveScoresForGroups(activeVersion.groups, '所有组成绩');
  };

  const openUndoSync = () => {
    if (!latestSyncHistoryItem) return;
    setUndoStudentIds(latestSyncHistoryItem.snapshots.map(snapshot => snapshot.studentId));
    setIsUndoSyncOpen(true);
  };

  const toggleUndoStudent = (studentId: string) => {
    setUndoStudentIds(prev => (
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    ));
  };

  const handleUndoScoreSync = () => {
    if (!latestSyncHistoryItem || undoStudentIds.length === 0) return;
    const selectedIds = new Set(undoStudentIds);
    const selectedSnapshots = latestSyncHistoryItem.snapshots.filter(snapshot => selectedIds.has(snapshot.studentId));
    if (selectedSnapshots.length === 0) return;

    onRevertScoreSync(latestSyncHistoryItem.target, activeEvent, selectedSnapshots);
    setSyncHistory(prev => prev.flatMap(item => {
      if (item.id !== latestSyncHistoryItem.id) return [item];
      const remainingSnapshots = item.snapshots.filter(snapshot => !selectedIds.has(snapshot.studentId));
      return remainingSnapshots.length > 0 ? [{ ...item, snapshots: remainingSnapshots }] : [];
    }));
    setIsUndoSyncOpen(false);
    setUndoStudentIds([]);
    showSyncToast(`已撤销 ${selectedSnapshots.length} 人同步`);
  };

  const handleExport = async () => {
    if (!activeSession || !activeVersion) return;
    const rows = activeVersion.groups.flatMap((group, groupIndex) => group.members.map(member => {
      const student = studentsById.get(member.studentId);
      const groupStartTime = getDisplayGroupStartTime(group, groupScheduleConfig, groupIndex);
      return {
        '测试名称': activeSession.name,
        '测试日期': activeSession.date,
        '项目': getEventLabel(activeEvent),
        '版本': activeVersion.name,
        '组名': group.name,
        '组开始时间': groupStartTime,
        '标记': group.marker || '',
        '跑道': member.lane || '',
        '顺序': member.order || '',
        '排名': member.rank || '',
        '姓名': student?.name || '',
        '学号/编号': student?.studentNo || '',
        '性别': student?.gender === 'female' ? '女' : '男',
      };
    }));
    await writeObjectRowsFile(
      rows,
      '分组名单',
      `${activeSession.name}_${getEventLabel(activeEvent)}_${activeVersion.name}_分组名单.xlsx`,
    );
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSession || groupingLocked) return;
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await readFirstSheetObjects(file);
      const grouped = new Map<string, TestSessionGroup>();

      rows.forEach((row, index) => {
        const studentNo = String(row['学号/编号'] || row['学号'] || row['编号'] || '').trim();
        const name = String(row['姓名'] || row['Name'] || '').trim();
        const student = presentStudents.find(item => (
          (studentNo && item.studentNo === studentNo) || (!studentNo && item.name === name)
        ));
        if (!student) return;

        const groupName = String(row['组名'] || row['组别'] || row['Group'] || `${student.gender === 'male' ? '男生' : '女生'}第1组`).trim();
        const key = activeEvent === 'eightHundred' ? groupName : `${student.gender}:${groupName}`;
        const group = grouped.get(key) || {
          id: `import-${Date.now()}-${index}`,
          name: groupName,
          marker: String(row['标记'] || '').trim(),
          gender: activeEvent === 'eightHundred' ? 'mixed' : student.gender,
          members: [],
        };
        const lane = parseInt(String(row['跑道'] || ''), 10);
        group.members.push({
          studentId: student.id,
          lane: activeEvent === 'hundred' ? (Number.isFinite(lane) ? lane : group.members.length + 1) : undefined,
          order: group.members.length + 1,
        });
        grouped.set(key, group);
      });

      const importedVersion: TestSessionGroupingVersion = {
        id: `${activeEvent}-import-${Date.now()}`,
        name: `导入版本 ${versions.length + 1}`,
        event: activeEvent,
        createdAt: new Date().toISOString(),
        source: 'imported',
        mode: 'size',
        groups: Array.from(grouped.values()),
      };
      onAddGroupingVersion(activeSession.id, activeEvent, importedVersion);
      setSelectedGroupId(importedVersion.groups[0]?.id || null);
    } catch {
      showSyncToast('分组表读取失败，请检查文件格式');
    }
    event.target.value = '';
  };

  const handlePrearrangedImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const sheets = await readWorkbookMatrices(file);
      const importResult = parsePrearrangedWorkbook(sheets, {
        fileName: file.name,
        yearId: currentYearId,
      });
      const importedEventCount = Object.keys(importResult.summary.eventSummaries).length;
      if (importResult.students.length === 0 || importedEventCount === 0) {
        showSyncToast('没有识别到可导入的预排表');
        return;
      }
      setPrearrangedStudentMode('appendMissing');
      setPendingPrearrangedImport(importResult);
    } catch {
      showSyncToast('预排表解析失败，请检查表头');
    }
    event.target.value = '';
  };

  const handleConfirmPrearrangedImport = () => {
    if (!pendingPrearrangedImport) return;
    const removedSessionIds = prearrangedStudentMode === 'replaceYear'
      ? testSessions.map(session => session.id)
      : [];
    onApplyPrearrangedImport(currentYearId, pendingPrearrangedImport, prearrangedStudentMode);
    setDraftInputs(prev => removeEntryDraftsForSessions(prev, removedSessionIds));
    setDraftComments(prev => removeEntryDraftCommentsForSessions(prev, removedSessionIds));
    if (removedSessionIds.length > 0) {
      const removed = new Set(removedSessionIds);
      setSyncHistory(prev => prev.filter(item => !removed.has(item.sessionId)));
      setEntryVersionSelections(prev => Object.fromEntries(
        Object.entries(prev).filter(([key]) => !removed.has(key.split(':')[0])),
      ));
    }
    setActiveSessionId(pendingPrearrangedImport.testSession.id);
    const firstEvent = EVENT_CONFIG.find(event => pendingPrearrangedImport.testSession.groupingVersions[event.id][0])?.id;
    if (firstEvent) setActiveEvent(firstEvent);
    setSelectedGroupId(null);
    showSyncToast(prearrangedStudentMode === 'replaceYear'
      ? `已重建并导入 ${pendingPrearrangedImport.summary.studentCount} 名学生`
      : `已导入预排表，学生档案按选择处理`);
  };

  const renderMemberRow = (group: TestSessionGroup, member: TestSessionGroup['members'][number], memberIndex: number) => {
    const student = studentsById.get(member.studentId);
    const currentTrials = (draftInputs[draftKey] || {})[member.studentId] || [];
    const currentComment = (draftComments[draftKey] || {})[member.studentId] || '';
    const isSwapSelected = swapSelection?.groupId === group.id && swapSelection.studentId === member.studentId;
    const isSwapCandidate = Boolean(swapSelection) && !isSwapSelected && canModifyGrouping;

    return (
      <div
        key={`${group.id}-${member.studentId}`}
        onClick={() => {
          if (isGroupingView) handleMemberSwapClick(group.id, member.studentId);
        }}
        className={cn(
          'flex items-center gap-3 rounded-2xl border p-3 transition-all duration-300',
          'bg-white border-slate-100 hover:border-blue-100 hover:shadow-sm',
          canModifyGrouping && 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.99]',
          isGroupingView && groupingLocked && 'bg-white',
          isSwapSelected && 'ring-4 ring-amber-100 border-amber-300 bg-amber-50',
          isSwapCandidate && 'hover:border-amber-200 hover:bg-amber-50/50',
        )}
      >
        <div className="w-14 shrink-0 flex justify-center">
          {activeEvent === 'hundred' ? (
            <span className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black',
              'bg-orange-50 text-orange-600 border border-orange-100',
            )}>
              {getMemberPositionLabel(activeEvent, member, memberIndex)}
            </span>
          ) : (
            <span className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black',
              'bg-slate-50 text-slate-400',
            )}>
              {getMemberPositionLabel(activeEvent, member, memberIndex)}
            </span>
          )}
        </div>

        <div className="w-64 shrink-0 flex items-center gap-3 min-w-0">
          {isGroupingView && (
            <div
              className={cn(
                'p-3 rounded-2xl border transition-all',
                isSwapSelected ? 'border-amber-200 bg-amber-100 text-amber-700' : 'border-slate-200 bg-white text-slate-400',
                groupingLocked && 'opacity-40',
              )}
              title={groupingLocked ? '分组已锁定' : '点击两名学生交换位置'}
            >
              {groupingLocked ? <LockKeyhole className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {isGroupingView && editingStudentId === member.studentId ? (
              <input
                autoFocus
                value={editingName}
                onChange={event => setEditingName(event.target.value)}
                onBlur={() => handleStudentNameCommit(member.studentId)}
                onKeyDown={event => {
                  if (event.key === 'Enter') handleStudentNameCommit(member.studentId);
                  if (event.key === 'Escape') {
                    setEditingStudentId(null);
                    setEditingName('');
                  }
                }}
                onClick={event => event.stopPropagation()}
                className="w-full border-b-2 border-blue-500 bg-transparent outline-none text-base font-black"
              />
            ) : isGroupingView ? (
              <div className="flex items-center gap-2 min-w-0">
                <button
                  aria-disabled={groupingLocked}
                  onClick={event => {
                    event.stopPropagation();
                    handleMemberSwapClick(group.id, member.studentId);
                  }}
                  className={cn(
                    'block min-w-0 text-left text-base font-black truncate',
                    isSwapSelected ? 'text-amber-700' : 'text-slate-800 hover:text-blue-600',
                    groupingLocked && 'text-slate-900 hover:text-slate-900 cursor-default',
                  )}
                  title={groupingLocked ? '解锁后才能交换位置' : swapSelection ? '点击另一名学生交换位置' : '点击后再点另一名学生交换位置'}
                >
                  {getStudentLabel(student)}
                </button>
                <button
                  disabled={groupingLocked}
                  onClick={event => {
                    event.stopPropagation();
                    startEditingStudentName(member.studentId, student?.name || '');
                  }}
                  className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={groupingLocked ? '解锁后才能改名' : '修改姓名'}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-base font-black text-slate-800 truncate">
                {getStudentLabel(student)}
              </div>
            )}
            <p className={cn('text-xs font-bold mt-0.5 flex items-center gap-2 flex-wrap', groupingLocked ? 'text-slate-700' : 'text-slate-400')}>
              <span>{student?.gender === 'female' ? '女生' : '男生'}</span>
              {member.rank !== undefined && <span>排名 {member.rank}</span>}
            </p>
            {member.note && (
              <p className="mt-1 text-[11px] font-bold truncate text-amber-600">
                备注：{member.note}
              </p>
            )}
          </div>
        </div>

        {isEntryView && (
          <div className="flex-1 flex items-center justify-end gap-3 flex-wrap">
            {Array.from({ length: trialCount }).map((_, trialIndex) => (
              <div key={trialIndex} className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black text-slate-300">
                  第{trialIndex + 1}次
                </span>
                <input
                  value={currentTrials[trialIndex] || ''}
                  onChange={event => handleDraftChange(member.studentId, trialIndex, event.target.value)}
                  onClick={event => event.stopPropagation()}
                  placeholder={activeEvent === 'eightHundred' ? '2:12' : '0.00'}
                  className="w-[88px] h-10 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder:text-slate-300"
                />
              </div>
            ))}
            <div className="min-w-[220px] flex-1 max-w-md">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-300">技术批注</span>
              </div>
              <input
                value={currentComment}
                onChange={event => handleDraftCommentChange(member.studentId, event.target.value)}
                onClick={event => event.stopPropagation()}
                placeholder="例：起跑慢、摆臂紧、第二跳节奏好"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder:text-slate-300"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTileMemberRow = (group: TestSessionGroup, member: TestSessionGroup['members'][number], memberIndex: number) => {
    const student = studentsById.get(member.studentId);
    const isSwapSelected = swapSelection?.groupId === group.id && swapSelection.studentId === member.studentId;
    const isSwapCandidate = Boolean(swapSelection) && !isSwapSelected && canModifyGrouping;

    return (
      <div
        key={`${group.id}-${member.studentId}`}
        onClick={() => handleMemberSwapClick(group.id, member.studentId)}
        style={{
          gap: tileConfig.rowGap,
          padding: `${tileConfig.rowPaddingY}px ${tileConfig.rowPaddingX}px`,
        }}
        className={cn(
          'flex items-center rounded-2xl border transition-all duration-300',
          'bg-white border-slate-100',
          canModifyGrouping && 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.99]',
          isGroupingView && groupingLocked && 'bg-white',
          isSwapSelected && 'ring-4 ring-amber-100 border-amber-300 bg-amber-50',
          isSwapCandidate && 'hover:border-amber-200 hover:bg-amber-50/50',
        )}
      >
        <span className={cn(
          'rounded-xl flex items-center justify-center font-black shrink-0 transition-all duration-300',
          activeEvent === 'hundred' ? 'bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-500',
        )}
        style={{
          width: tileConfig.avatarSize,
          height: tileConfig.avatarSize,
          fontSize: tileConfig.badgeFontSize,
        }}>
          {getMemberPositionLabel(activeEvent, member, memberIndex)}
        </span>
        {groupingLocked ? (
          <LockKeyhole
            className="text-slate-300 shrink-0"
            style={{ width: tileConfig.iconSize, height: tileConfig.iconSize }}
          />
        ) : (
          <ArrowRightLeft
            className={cn('shrink-0', isSwapSelected ? 'text-amber-600' : 'text-slate-300')}
            style={{ width: tileConfig.iconSize, height: tileConfig.iconSize }}
          />
        )}
        <div className="min-w-0 flex-1">
          {editingStudentId === member.studentId ? (
            <input
              autoFocus
              value={editingName}
              onChange={event => setEditingName(event.target.value)}
              onBlur={() => handleStudentNameCommit(member.studentId)}
              onKeyDown={event => {
                if (event.key === 'Enter') handleStudentNameCommit(member.studentId);
                if (event.key === 'Escape') {
                  setEditingStudentId(null);
                  setEditingName('');
                }
              }}
              onClick={event => event.stopPropagation()}
              className="w-full border-b-2 border-blue-500 bg-transparent outline-none text-sm font-black"
            />
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                aria-disabled={groupingLocked}
                onClick={event => {
                  event.stopPropagation();
                  handleMemberSwapClick(group.id, member.studentId);
                }}
                className={cn(
                  'block min-w-0 text-left font-black truncate hover:text-blue-600',
                  isSwapSelected ? 'text-amber-700' : 'text-slate-800',
                  groupingLocked && 'text-slate-900 hover:text-slate-900 cursor-default',
                )}
                style={{ fontSize: tileConfig.nameFontSize }}
                title={groupingLocked ? '解锁后才能交换位置' : swapSelection ? '点击另一名学生交换位置' : '点击后再点另一名学生交换位置'}
              >
                {getStudentLabel(student)}
              </button>
              <button
                disabled={groupingLocked}
                onClick={event => {
                  event.stopPropagation();
                  startEditingStudentName(member.studentId, student?.name || '');
                }}
                className="shrink-0 p-1 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title={groupingLocked ? '解锁后才能改名' : '修改姓名'}
              >
                <Edit3 style={{ width: tileConfig.iconSize - 4, height: tileConfig.iconSize - 4 }} />
              </button>
            </div>
          )}
          <p
            className={cn('font-bold flex items-center gap-2 flex-wrap', groupingLocked ? 'text-slate-700' : 'text-slate-400')}
            style={{ fontSize: tileConfig.metaFontSize }}
          >
            <span>{student?.gender === 'female' ? '女生' : '男生'}</span>
            {member.rank !== undefined && <span>排名 {member.rank}</span>}
          </p>
          {member.note && (
            <p className="mt-1 truncate font-bold text-amber-600" style={{ fontSize: tileConfig.metaFontSize }}>
              备注：{member.note}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderVoiceEntryPanel = () => {
    if (!isEntryView || !selectedGroup) return null;
    return (
      <div className="mb-2 rounded-xl border border-blue-100 bg-blue-50/50 p-2">
        <div className="flex items-center gap-2">
          <button
            onClick={openVoiceSettings}
            className={cn(
              'h-9 px-2 rounded-lg border text-xs font-black flex items-center gap-1.5 shrink-0',
              hasSavedVoiceSettings
                ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'
                : 'bg-white border-blue-100 text-blue-700 hover:bg-blue-50',
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            设置
          </button>
          <div className="relative shrink-0">
            <button
              onClick={toggleVoiceListening}
              className={cn(
                'h-9 rounded-lg text-xs font-black flex items-center justify-center shrink-0 transition-all',
                isListening && 'px-3 gap-1.5 bg-red-500 text-white hover:bg-red-600 shadow-sm',
                !isListening && !isProcessingVoice && 'w-9 bg-blue-600 text-white hover:bg-blue-700',
                isProcessingVoice && 'px-3 gap-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200',
              )}
              title={isProcessingVoice ? '取消连接' : isListening ? '结束语音' : '选择语音录入类型'}
              aria-label={isProcessingVoice ? '取消连接' : isListening ? '结束语音' : '选择语音录入类型'}
            >
              {isProcessingVoice ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                  <MicOff className="w-3.5 h-3.5" />
                  取消
                </>
              ) : isListening ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  <MicOff className="w-3.5 h-3.5" />
                  结束
                </>
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
            {isVoiceModeMenuOpen && !isListening && !isProcessingVoice && (
              <div className="absolute left-0 top-11 z-30 w-72 rounded-xl border border-blue-100 bg-white p-2 shadow-xl">
                <button
                  type="button"
                  onClick={() => startVoiceListeningWithMode('score')}
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50"
                >
                  <span className="block text-xs font-black text-slate-900">成绩录入</span>
                  <span className="mt-0.5 block text-[10px] font-bold text-slate-500">
                    说“道次/姓名 + 成绩”，例如“一道十二秒八、赵明轩第二次十二秒六”。
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => startVoiceListeningWithMode('note')}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50"
                >
                  <span className="block text-xs font-black text-slate-900">技术批注录入</span>
                  <span className="mt-0.5 block text-[10px] font-bold text-slate-500">
                    说“姓名/道次 + 批注内容”，例如“甘振豪起跑慢、二道摆臂紧”。
                  </span>
                </button>
              </div>
            )}
          </div>
          <input
            value={voiceText}
            onChange={event => handleVoiceTextChange(event.target.value)}
            placeholder={voiceMode === 'note' ? '甘振豪起跑慢，二道摆臂紧' : '一道12.8，赵明轩第二次12.6'}
            className="min-w-0 flex-1 h-9 rounded-lg border border-blue-100 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-300"
          />
          <button
            onClick={applyVoiceTextToDraft}
            disabled={!voiceText.trim()}
            className="h-9 px-3 rounded-lg bg-slate-900 text-white text-xs font-black flex items-center gap-1.5 hover:bg-slate-800 disabled:opacity-30 shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" /> 填入
          </button>
          {voiceText && (
            <button
              onClick={clearVoiceInput}
              className="h-9 px-2 rounded-lg bg-white border border-blue-100 text-xs font-black text-slate-500 hover:bg-blue-50 shrink-0"
            >
              清空
            </button>
          )}
        </div>
        {voiceMessage && (
          <p className={cn(
            'mt-1 text-[10px] font-bold truncate',
            voiceMessageTone === 'success' && 'text-emerald-700',
            voiceMessageTone === 'error' && 'text-red-600',
            voiceMessageTone === 'info' && 'text-blue-700',
          )}>
            {voiceMessage}
          </p>
        )}
        {(pendingVoiceReviewItems.length > 0 || voiceUnmatchedSegments.length > 0 || voiceContextTermCount > 0) && (
          <div className="mt-2 border-t border-blue-100 pt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black text-blue-800">
                当前分组词典 {voiceContextTermCount} 个词
                {pendingVoiceReviewItems.length > 0 ? `，${pendingVoiceReviewItems.length} 条待确认` : ''}
              </p>
              {pendingVoiceReviewItems.length > 1 && (
                <button
                  onClick={confirmAllVoiceReviewItems}
                  className="h-7 px-2 rounded-md bg-blue-600 text-white text-[10px] font-black hover:bg-blue-700"
                >
                  全部确认
                </button>
              )}
            </div>
            {pendingVoiceReviewItems.map(candidate => (
              <div key={candidate.id} className="flex items-center gap-2 rounded-lg bg-white/70 border border-blue-100 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black text-slate-800 truncate">
                    {getVoiceReviewItemStudentLabel(candidate)} · {getVoiceReviewItemValueLabel(candidate)}
                  </p>
                  <p className="text-[10px] font-bold text-amber-700 truncate">
                    {candidate.reviewReason || '需要确认'} · 原文：{candidate.sourceText}
                  </p>
                </div>
                <button
                  onClick={() => confirmVoiceReviewItem(candidate)}
                  className="h-7 px-2 rounded-md bg-emerald-600 text-white text-[10px] font-black flex items-center gap-1 hover:bg-emerald-700 shrink-0"
                >
                  <CheckCircle className="w-3 h-3" />
                  确认
                </button>
                <button
                  onClick={() => ignoreVoiceReviewItem(candidate)}
                  className="h-7 px-2 rounded-md bg-white border border-slate-200 text-slate-500 text-[10px] font-black hover:bg-slate-50 shrink-0"
                >
                  忽略
                </button>
              </div>
            ))}
            {voiceUnmatchedSegments.length > 0 && (
              <p className="text-[10px] font-bold text-red-600">
                未识别：{voiceUnmatchedSegments.join(' / ')}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col p-3 gap-3 overflow-hidden">
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-2 flex flex-col gap-2 shrink-0 max-h-[22vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative shrink-0">
              <Filter className="w-4 h-4 text-white absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={activeSessionId || ''}
                onChange={event => setActiveSessionId(event.target.value || null)}
                className="appearance-none h-11 min-w-52 rounded-2xl bg-slate-900 text-white pl-10 pr-10 text-sm font-black outline-none cursor-pointer"
              >
                {sortedSessions.length === 0 ? (
                  <option value="">暂无测试</option>
                ) : sortedSessions.map(session => (
                  <option key={session.id} value={session.id}>{session.name}</option>
                ))}
              </select>
              <ChevronDown className="w-5 h-5 text-white absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {isGroupingView && (
              <>
                <button
                  onClick={openCreateSessionModal}
                  className="h-9 px-3 rounded-xl border border-dashed border-blue-300 text-blue-600 text-[11px] font-black hover:bg-blue-50 flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> 新建
                </button>
                <label className="h-9 px-3 rounded-xl border border-slate-200 text-slate-600 bg-white text-[11px] font-black hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer shrink-0">
                  <FileUp className="w-3.5 h-3.5" /> 预排
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.csv"
                    onChange={handlePrearrangedImportFile}
                  />
                </label>
                <button
                  onClick={() => setConfirmDeleteSession(true)}
                  disabled={!activeSession}
                  className="h-9 px-3 rounded-xl border border-red-100 text-red-500 bg-white text-[11px] font-black hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-30 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </>
            )}
          </div>
          {activeSession && (
            <div className="flex items-center gap-2 shrink-0">
              {isGroupingView ? (
                <>
                  <input
                    value={activeSession.name}
                    onChange={event => updateActiveSession({ name: event.target.value })}
                    className="h-9 w-36 border border-slate-200 rounded-xl px-3 text-xs font-black outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="date"
                    value={activeSession.date}
                    onChange={event => updateActiveSession({ date: event.target.value })}
                    className="h-9 border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </>
              ) : (
                <div className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-black text-slate-600 flex items-center">
                  {activeSession.name} · {activeSession.date}
                </div>
              )}
            </div>
          )}
        </div>

        {activeSession && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {EVENT_CONFIG.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveEvent(item.id)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all',
                    activeEvent === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-white/60',
                  )}
                >
                  <item.icon className={cn('w-3.5 h-3.5', activeEvent === item.id ? item.color : 'text-slate-400')} />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeVersion?.id || ''}
                onChange={event => handleSelectVersion(event.target.value)}
                disabled={isGroupingView && groupingLocked}
                className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-black bg-white outline-none disabled:opacity-60 disabled:bg-slate-50"
              >
                {versions.length === 0 ? (
                  <option value="">暂无分组版本</option>
                ) : versions.map(version => (
                  <option key={version.id} value={version.id}>
                    {version.name} · {version.source === 'imported' ? '导入' : '生成'} · {version.createdAt.slice(5, 16).replace('T', ' ')}
                  </option>
                ))}
              </select>

              {isEntryView && (
                <>
                  <button
                    onClick={handleSetEntryVersion}
                    disabled={!activeVersion || isActiveVersionEntryVersion}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-black border',
                      isActiveVersionEntryVersion
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800',
                      (!activeVersion || isActiveVersionEntryVersion) && 'disabled:opacity-100',
                    )}
                  >
                    {isActiveVersionEntryVersion ? '已确定' : '确定设为录入版'}
                  </button>
                  <div className="text-[10px] font-bold text-slate-400">
                    {entryVersion ? `当前录入版：${entryVersion.name}` : '未确定录入版'}
                  </div>
                </>
              )}

              {isGroupingView && (
                <>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleSetEntryVersion}
                      disabled={!activeVersion || groupingLocked}
                      className={cn(
                        'px-3 py-2 rounded-lg text-xs font-black border',
                        groupingLocked
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800',
                        !activeVersion && 'disabled:opacity-30',
                        groupingLocked && 'disabled:opacity-100 disabled:cursor-default',
                      )}
                    >
                      确认分组
                    </button>
                    {groupingLocked && (
                      <button
                        onClick={() => setConfirmUnlockGrouping(true)}
                        disabled={!activeVersion}
                        className="w-9 h-9 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 flex items-center justify-center hover:bg-amber-100 disabled:opacity-30"
                        title="解锁分组"
                        aria-label="解锁分组"
                      >
                        <LockKeyhole className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <details className="group rounded-2xl border border-slate-200 bg-white">
                    <summary className="list-none [&::-webkit-details-marker]:hidden h-9 px-3 flex cursor-pointer items-center gap-2 text-[11px] font-black text-slate-600">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                      分组工具
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-slate-100 p-2 flex flex-wrap items-center gap-2">
                  <div className="flex border border-slate-200 rounded-2xl p-1 bg-white">
                    <button
                      onClick={() => setGroupingDisplayMode('detail')}
                      className={cn(
                        'px-3 py-2 rounded-xl text-[11px] font-black flex items-center gap-1.5',
                        groupingDisplayMode === 'detail' ? 'bg-slate-900 text-white' : 'text-slate-500',
                      )}
                    >
                      <List className="w-3.5 h-3.5" /> 详情
                    </button>
                    <button
                      onClick={() => setGroupingDisplayMode('tile')}
                      className={cn(
                        'px-3 py-2 rounded-xl text-[11px] font-black flex items-center gap-1.5',
                        groupingDisplayMode === 'tile' ? 'bg-slate-900 text-white' : 'text-slate-500',
                      )}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" /> 平铺
                    </button>
                  </div>

                  {groupingDisplayMode === 'tile' && (
                    <div className="h-10 px-3 rounded-2xl border border-slate-200 bg-white flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="range"
                        min={45}
                        max={160}
                        value={tileScale}
                        onChange={event => setTileScale(getTileScaleConfig(parseInt(event.target.value, 10)).normalizedScale)}
                        className="w-36 accent-blue-600"
                        aria-label="平铺比例"
                      />
                      <span className="w-10 text-[11px] font-black text-slate-500">{tileConfig.normalizedScale}%</span>
                      <button
                        onClick={() => setTileScale(45)}
                        className="px-2 py-1 rounded-lg bg-slate-100 text-[11px] font-black text-slate-600"
                      >
                        一屏
                      </button>
                    </div>
                  )}

                  <div className={cn(
                    'min-h-10 px-3 py-2 rounded-2xl border border-slate-200 bg-white flex items-center gap-2 flex-wrap',
                    !canEditCurrentGroupSchedule && 'bg-slate-50 text-slate-400',
                  )}>
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] font-black text-slate-500">首组</span>
                    <input
                      type="time"
                      value={groupScheduleConfig.startTime}
                      onChange={event => updateGroupScheduleConfig({ startTime: event.target.value })}
                      disabled={!canEditCurrentGroupSchedule}
                      className="h-7 w-24 rounded-lg border border-slate-200 px-2 text-[11px] font-black text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      aria-label="第一组开始时间"
                      title={canEditCurrentGroupSchedule ? '第一组开始时间' : '分组已确定，解锁后才能修改时间'}
                    />
                    <span className="text-[11px] font-black text-slate-500">间隔</span>
                    <input
                      type="number"
                      min={0}
                      value={scheduleIntervalHours}
                      onChange={event => updateGroupScheduleInterval(parseInt(event.target.value, 10), scheduleIntervalMinutes)}
                      disabled={!canEditCurrentGroupSchedule}
                      className="h-7 w-12 rounded-lg border border-slate-200 px-2 text-center text-[11px] font-black text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      aria-label="间隔小时"
                      title={canEditCurrentGroupSchedule ? '间隔小时' : '分组已确定，解锁后才能修改时间'}
                    />
                    <span className="text-[11px] font-black text-slate-400">时</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={scheduleIntervalMinutes}
                      onChange={event => updateGroupScheduleInterval(scheduleIntervalHours, parseInt(event.target.value, 10))}
                      disabled={!canEditCurrentGroupSchedule}
                      className="h-7 w-12 rounded-lg border border-slate-200 px-2 text-center text-[11px] font-black text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      aria-label="间隔分钟"
                      title={canEditCurrentGroupSchedule ? '间隔分钟' : '分组已确定，解锁后才能修改时间'}
                    />
                    <span className="text-[11px] font-black text-slate-400">分</span>
                  </div>

                  <div className="flex border border-slate-200 rounded-lg p-1 bg-white">
                    <button
                      onClick={() => setMode('size')}
                      disabled={groupingLocked}
                      className={cn('px-3 py-1.5 rounded-md text-[11px] font-black disabled:cursor-not-allowed', mode === 'size' ? 'bg-blue-600 text-white' : 'text-slate-500', groupingLocked && mode !== 'size' && 'opacity-40')}
                    >
                      每组人数
                    </button>
                    <button
                      onClick={() => setMode('count')}
                      disabled={groupingLocked}
                      className={cn('px-3 py-1.5 rounded-md text-[11px] font-black disabled:cursor-not-allowed', mode === 'count' ? 'bg-blue-600 text-white' : 'text-slate-500', groupingLocked && mode !== 'count' && 'opacity-40')}
                    >
                      总组数
                    </button>
                  </div>

                  {mode === 'size' ? (
                    <input
                      type="number"
                      min={1}
                      value={groupSize}
                      onChange={event => setGroupSize(Math.max(1, parseInt(event.target.value, 10) || 1))}
                      disabled={groupingLocked}
                      className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-xs font-black outline-none disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                      title="每组人数"
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={groupCount}
                      onChange={event => setGroupCount(Math.max(1, parseInt(event.target.value, 10) || 1))}
                      disabled={groupingLocked}
                      className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-xs font-black outline-none disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                      title="总组数"
                    />
                  )}

                  <button
                    onClick={() => setConfirmGenerate(true)}
                    disabled={presentStudents.length === 0 || groupingLocked}
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 hover:bg-slate-800 disabled:opacity-30"
                    title={groupingLocked ? '分组已确定，解锁后才能重新自动生成' : presentStudents.length === 0 ? '没有可分组学生' : '生成新版本'}
                  >
                    <Shuffle className="w-3.5 h-3.5" /> {groupingLocked ? '已锁定生成' : '生成新版本'}
                  </button>

                  <label className={cn(
                    'bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs font-black flex items-center gap-1.5',
                    groupingLocked || presentStudents.length === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50',
                  )}>
                    <FileUp className="w-3.5 h-3.5" /> 导入
                    <input type="file" className="hidden" accept=".xlsx,.csv" onChange={handleImport} disabled={groupingLocked || presentStudents.length === 0} />
                  </label>
                  <button
                    onClick={handleExport}
                    disabled={!activeVersion}
                    className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 text-xs font-black flex items-center gap-1.5 disabled:opacity-30"
                  >
                    <Download className="w-3.5 h-3.5" /> 导出
                  </button>
                  <button
                    onClick={() => setConfirmDeleteGroup(true)}
                    disabled={!selectedGroup || groupingLocked}
                    className="bg-white border border-red-100 text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 text-xs font-black flex items-center gap-1.5 disabled:opacity-30"
                    title={groupingLocked ? '解锁后才能删除分组' : '删除分组'}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 删除分组
                  </button>
                    </div>
                  </details>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {!activeSession ? (
        <section className="flex-1 rounded-xl border-2 border-dashed border-slate-200 bg-white flex flex-col items-center justify-center">
          <Users className="w-14 h-14 text-slate-200 mb-4" />
          <p className="text-slate-400 text-sm font-black mb-4">
            {isGroupingView ? '先创建一次测试，再开始分组' : '先在测试分组中创建测试'}
          </p>
          {isGroupingView && (
            <button onClick={openCreateSessionModal} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-black">
              新建测试
            </button>
          )}
        </section>
      ) : isGroupingView && groupingDisplayMode === 'tile' ? (
        <section className="flex-1 overflow-auto custom-scrollbar min-h-0">
          {!activeVersion || activeVersion.groups.length === 0 ? (
            <div className="h-full rounded-[28px] border-2 border-dashed border-slate-200 bg-white flex flex-col items-center justify-center text-center text-slate-300 px-8">
              <Shuffle className="w-14 h-14 mb-4 opacity-30" />
              <p className="text-sm font-black">生成或导入分组后查看平铺视图</p>
            </div>
          ) : (
            <div
              className="grid gap-4 pb-2 transition-[grid-template-columns] duration-300"
              style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${tileConfig.gridMinWidth}px, 1fr))` }}
            >
              {activeVersion.groups.map((group, groupIndex) => {
                const isSelected = selectedGroup?.id === group.id;
                const groupStartTime = getDisplayGroupStartTime(group, groupScheduleConfig, groupIndex);
                return (
                  <article
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cn(
                      'bg-white border shadow-sm rounded-[28px] overflow-hidden transition-all duration-300',
                      isSelected ? 'border-blue-200 ring-4 ring-blue-50' : 'border-slate-200 hover:border-blue-100',
                    )}
                  >
                    <header className={cn(
                      'border-b flex items-center justify-between gap-3 transition-all duration-300',
                      getGroupTone(group.gender) === 'blue' && 'bg-blue-50/50 border-blue-100',
                      getGroupTone(group.gender) === 'pink' && 'bg-pink-50/50 border-pink-100',
                      getGroupTone(group.gender) === 'emerald' && 'bg-emerald-50/50 border-emerald-100',
                    )}
                    style={{ padding: tileConfig.headerPadding }}>
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className={cn(
                          'w-12 h-12 rounded-2xl flex items-center justify-center text-base font-black text-white shadow-sm shrink-0',
                          getGroupTone(group.gender) === 'blue' && 'bg-blue-500',
                          getGroupTone(group.gender) === 'pink' && 'bg-pink-500',
                          getGroupTone(group.gender) === 'emerald' && 'bg-emerald-500',
                        )}>
                          {groupIndex + 1}
                        </div>
                        {isSelected ? (
                          <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1" onClick={event => event.stopPropagation()}>
                            <input
                              value={group.name}
                              onChange={event => updateGroup(group.id, { name: event.target.value })}
                              disabled={groupingLocked}
                              className="h-12 min-w-0 flex-1 bg-white border border-slate-200 rounded-2xl px-4 text-base font-black text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                            />
                            <input
                              value={group.marker || ''}
                              onChange={event => updateGroup(group.id, { marker: event.target.value })}
                              placeholder="分组备注"
                              disabled={groupingLocked}
                              className="h-12 w-40 bg-white border border-slate-200 rounded-2xl px-4 text-sm font-bold text-slate-600 outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                            />
                          </div>
                        ) : (
                          <div className="min-w-0">
                            <h3 className="text-xl font-black text-slate-800 truncate">{group.name}</h3>
                            <p className="text-xs font-bold text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                              {groupStartTime && (
                                <span className="inline-flex items-center gap-1 text-blue-600">
                                  <Clock className="w-3 h-3" /> {groupStartTime}
                                </span>
                              )}
                              <span>{group.marker || `${group.members.length} 人`}</span>
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {groupStartTime && (
                          <span className="text-xs font-black px-3 py-1.5 rounded-full bg-white/80 border border-blue-100 text-blue-700 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {groupStartTime}
                          </span>
                        )}
                        <span className={cn(
                          'text-xs font-black px-3 py-1.5 rounded-full',
                          getGroupTone(group.gender) === 'blue' && 'bg-blue-100 text-blue-700',
                          getGroupTone(group.gender) === 'pink' && 'bg-pink-100 text-pink-700',
                          getGroupTone(group.gender) === 'emerald' && 'bg-emerald-100 text-emerald-700',
                        )}>
                          {getGroupLabel(group.gender, true)}
                        </span>
                      </div>
                    </header>
                    <div
                      className="overflow-y-auto custom-scrollbar transition-all duration-300"
                      style={{
                        padding: tileConfig.cardPadding,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: tileConfig.rowGap,
                        maxHeight: tileConfig.maxMembersHeight,
                      }}
                    >
                      {group.members.length === 0 ? (
                        <div className="h-28 rounded-3xl border border-dashed border-slate-200 flex items-center justify-center text-sm font-black text-slate-300">
                          暂无学生
                        </div>
                      ) : group.members.map((member, memberIndex) => renderTileMemberRow(group, member, memberIndex))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-3 min-h-0 overflow-hidden">
          <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col min-h-0 max-h-[24vh] lg:max-h-none">
            <div className="px-1 pb-2 border-b border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">分组列表</p>
              <p className="text-base font-black text-slate-800 mt-1">
                {activeVersion ? `${activeVersion.name} · ${activeVersion.groups.length} 组` : '暂无分组'}
              </p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">
                  {isGroupingView ? (groupingLocked ? '分组已锁定，点锁确认后可调整' : '点击两名学生交换；切换版本查看') : '先确定录入版'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2 space-y-2">
              {!activeVersion || activeVersion.groups.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-300 px-8">
                  <Shuffle className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-xs font-black">
                    {isGroupingView ? '生成或导入分组后，从这里选择组别' : '先在测试分组中生成或导入分组'}
                  </p>
                </div>
              ) : activeVersion.groups.map((group, groupIndex) => {
                const groupStartTime = getDisplayGroupStartTime(group, groupScheduleConfig, groupIndex);
                return (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cn(
                      'w-full text-left p-4 rounded-2xl border transition-all',
                      selectedGroup?.id === group.id
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                        : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-lg font-black truncate">{group.name}</span>
                      <span className={cn(
                        'text-[10px] font-black px-2 py-0.5 rounded-full shrink-0',
                        getGroupTone(group.gender) === 'blue' && 'bg-blue-100 text-blue-700',
                        getGroupTone(group.gender) === 'pink' && 'bg-pink-100 text-pink-700',
                        getGroupTone(group.gender) === 'emerald' && 'bg-emerald-100 text-emerald-700',
                      )}>
                        {getGroupLabel(group.gender)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs font-bold opacity-70 flex-wrap">
                      {groupStartTime && (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>{groupStartTime}</span>
                        </>
                      )}
                      <Users className="w-3 h-3" />
                      {group.members.length} 人
                      {group.marker && (
                        <>
                          <Flag className="w-3 h-3 ml-1" />
                          <span className="truncate">{group.marker}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
            {!activeVersion || !selectedGroup ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                <Trophy className="w-14 h-14 mb-4 opacity-20" />
                <p className="text-sm font-black">
                  {isGroupingView ? '请选择或生成一个分组' : '先在测试分组中设为录入版本'}
                </p>
              </div>
            ) : (
              <>
                <header className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm',
                      getGroupTone(selectedGroup.gender) === 'blue' && 'bg-blue-500',
                      getGroupTone(selectedGroup.gender) === 'pink' && 'bg-pink-500',
                      getGroupTone(selectedGroup.gender) === 'emerald' && 'bg-emerald-500',
                    )}>
                      <eventConfig.icon className="w-5 h-5" />
                    </div>
                    {isGroupingView ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          value={selectedGroup.name}
                          onChange={event => updateGroup(selectedGroup.id, { name: event.target.value })}
                          disabled={groupingLocked}
                          className="w-52 h-10 bg-white border border-slate-200 rounded-xl px-3 text-sm font-black text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                        <input
                          value={selectedGroup.marker || ''}
                          onChange={event => updateGroup(selectedGroup.id, { marker: event.target.value })}
                          placeholder="分组备注"
                          disabled={groupingLocked}
                          className="w-40 h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-600 outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <h2 className="text-xl font-black text-slate-800 truncate">{selectedGroup.name}</h2>
                        <p className="text-xs font-bold text-slate-400 mt-0.5">
                          {selectedGroup.marker || '无备注'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 flex-wrap justify-end">
                      <span>
                        {eventConfig.label} · {selectedGroup.members.length} 人{isEntryView ? ` · ${trialCount} 次记录${canSaveEntryScores ? ' · 已确认' : ' · 未确认'}` : ''}
                      </span>
                      {selectedGroupStartTime && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                          <Clock className="w-3 h-3" /> {selectedGroupStartTime}
                        </span>
                      )}
                    </div>
                    {isEntryView && (
                      <>
                        <div className="h-9 border border-slate-200 bg-white rounded-lg flex items-center overflow-hidden">
                          <button
                            onClick={handleRemoveTrial}
                            disabled={trialCount <= 1}
                            className="w-9 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                            title="减少记录框"
                            aria-label="减少记录框"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-12 text-center text-[11px] font-black text-slate-600 border-x border-slate-100">
                            {trialCount}次
                          </span>
                          <button
                            onClick={handleAddTrial}
                            disabled={trialCount >= 10}
                            className="w-9 h-full flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                            title="增加记录框"
                            aria-label="增加记录框"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <button
                            onClick={handleSaveGroupScores}
                            disabled={!canSaveEntryScores}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-blue-600"
                          >
                            <Save className="w-3.5 h-3.5" /> 同步本组成绩
                          </button>
                          <button
                            onClick={handleSaveAllGroupScores}
                            disabled={!canSaveEntryScores || !activeVersion?.groups.length}
                            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900"
                          >
                            <SaveAll className="w-3.5 h-3.5" /> 同步所有组
                          </button>
                          <button
                            onClick={openUndoSync}
                            disabled={!latestSyncHistoryItem}
                            className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs font-black flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white"
                          >
                            <Undo2 className="w-3.5 h-3.5" /> 撤销同步
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </header>

                <div className="flex-1 overflow-auto custom-scrollbar p-3">
                  {isEntryView && !canSaveEntryScores && (
                    <p className="mb-3 text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      先确定录入版，再同步成绩
                    </p>
                  )}
                  {isEntryView && activeEvent === 'eightHundred' && (
                    <p className="mb-3 text-[11px] font-bold text-slate-400">
                      800米可填 2:12 或秒数
                    </p>
                  )}
                  {renderVoiceEntryPanel()}
                  <div className="space-y-3">
                    {selectedGroup.members.map((member, memberIndex) => renderMemberRow(selectedGroup, member, memberIndex))}
                  </div>
                </div>
              </>
            )}
          </main>
        </section>
      )}

      {isVoiceSettingsOpen && (
        <>
          <div
            className="fixed inset-0 z-[180] bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setIsVoiceSettingsOpen(false)}
          />
          <div className="fixed inset-0 z-[181] flex items-center justify-center p-4 pointer-events-none">
            <section
              className="w-full max-w-lg bg-white rounded-[28px] shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto"
              onClick={event => event.stopPropagation()}
            >
              <header className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">语音 API 设置</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">保存在当前浏览器本地，可随时清空</p>
                </div>
                <button
                  onClick={() => setIsVoiceSettingsOpen(false)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-500 hover:bg-slate-50"
                >
                  关闭
                </button>
              </header>

              <div className="p-6 space-y-4">
                <label className="block">
                  <span className="block text-[11px] font-black text-slate-400 mb-2">AppId</span>
                  <input
                    value={voiceSettingsDraft.appId}
                    onChange={event => setVoiceSettingsDraft(prev => ({ ...prev, appId: event.target.value }))}
                    placeholder="腾讯云账号信息里的 AppId"
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="block">
                  <span className="block text-[11px] font-black text-slate-400 mb-2">SecretId</span>
                  <input
                    value={voiceSettingsDraft.secretId}
                    onChange={event => setVoiceSettingsDraft(prev => ({ ...prev, secretId: event.target.value }))}
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="block">
                  <span className="block text-[11px] font-black text-slate-400 mb-2">SecretKey</span>
                  <input
                    type="password"
                    value={voiceSettingsDraft.secretKey}
                    onChange={event => setVoiceSettingsDraft(prev => ({ ...prev, secretKey: event.target.value }))}
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-[11px] font-black text-slate-400 mb-2">引擎</span>
                    <input
                      value={voiceSettingsDraft.engine}
                      onChange={event => setVoiceSettingsDraft(prev => ({ ...prev, engine: event.target.value }))}
                      placeholder="默认 16k_zh"
                      className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-black text-slate-400 mb-2">热词表 ID（选填）</span>
                    <input
                      value={voiceSettingsDraft.hotwordId}
                      onChange={event => setVoiceSettingsDraft(prev => ({ ...prev, hotwordId: event.target.value }))}
                      placeholder="可不填"
                      className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-700">
                  这些信息只保存在当前浏览器里。打包给别人使用时，对方需要在自己的电脑上填写自己的腾讯云信息。
                </p>
              </div>

              <footer className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-between gap-3">
                <button
                  onClick={clearVoiceSettings}
                  className="h-11 px-5 rounded-xl bg-white border border-red-100 text-sm font-black text-red-500 hover:bg-red-50"
                >
                  清空
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsVoiceSettingsOpen(false)}
                    className="h-11 px-5 rounded-xl bg-white border border-slate-200 text-sm font-black text-slate-500 hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveVoiceSettings}
                    className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700"
                  >
                    保存
                  </button>
                </div>
              </footer>
            </section>
          </div>
        </>
      )}

      {isCreateSessionOpen && (
        <>
          <div
            className="fixed inset-0 z-[180] bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setIsCreateSessionOpen(false)}
          />
          <div className="fixed inset-0 z-[181] flex items-center justify-center p-4 pointer-events-none">
            <section
              className="w-full max-w-4xl max-h-[88vh] bg-white rounded-[28px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col pointer-events-auto"
              onClick={event => event.stopPropagation()}
            >
              <header className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">新建测试</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    确认测试信息，并从学生档案中选择请假学生
                  </p>
                </div>
                <button
                  onClick={() => setIsCreateSessionOpen(false)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-500 hover:bg-slate-50"
                >
                  关闭
                </button>
              </header>

              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 p-6 overflow-y-auto lg:overflow-hidden">
                <div className="space-y-4">
                  <label className="block">
                    <span className="block text-[11px] font-black text-slate-400 mb-2">测试名称</span>
                    <input
                      autoFocus
                      value={newSessionDraft.name}
                      onChange={event => setNewSessionDraft(prev => ({ ...prev, name: event.target.value }))}
                      className="w-full h-12 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-[11px] font-black text-slate-400 mb-2">测试日期</span>
                    <input
                      type="date"
                      value={newSessionDraft.date}
                      onChange={event => setNewSessionDraft(prev => ({ ...prev, date: event.target.value }))}
                      className="w-full h-12 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <div className="text-[11px] font-black text-slate-400">请假学生</div>
                    <div className="mt-2 text-3xl font-black text-slate-900">{newSessionDraft.absentStudentIds.length}</div>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      本次分组会自动排除这些学生
                    </p>
                    {newSessionDraft.absentStudentIds.length > 0 && (
                      <button
                        onClick={() => setNewSessionDraft(prev => ({ ...prev, absentStudentIds: [] }))}
                        className="mt-4 h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-500 hover:bg-slate-50"
                      >
                        清空选择
                      </button>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex flex-col rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-3 border-b border-slate-100 bg-white">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        value={newSessionDraft.search}
                        onChange={event => setNewSessionDraft(prev => ({ ...prev, search: event.target.value }))}
                        placeholder="搜索姓名、学号或性别"
                        className="w-full h-11 rounded-xl border border-slate-200 pl-10 pr-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-[34px_minmax(70px,1fr)_64px_52px_52px] sm:grid-cols-[44px_1fr_110px_90px_90px] gap-2 px-3 sm:px-4 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-400">
                    <span>选择</span>
                    <span>姓名</span>
                    <span>学号</span>
                    <span>性别</span>
                    <span>状态</span>
                  </div>

                  <div className="flex-1 min-h-[240px] lg:min-h-0 overflow-y-auto custom-scrollbar">
                    {filteredCreateSessionStudents.length === 0 ? (
                      <div className="h-48 flex items-center justify-center text-sm font-black text-slate-300">
                        没有匹配的学生
                      </div>
                    ) : filteredCreateSessionStudents.map(student => {
                      const isAbsent = newSessionAbsentIds.has(student.id);
                      return (
                        <button
                          key={student.id}
                          onClick={() => toggleNewSessionAbsence(student.id)}
                          className={cn(
                            'w-full grid grid-cols-[34px_minmax(70px,1fr)_64px_52px_52px] sm:grid-cols-[44px_1fr_110px_90px_90px] gap-2 items-center px-3 sm:px-4 py-3 text-left border-b border-slate-100 transition-all',
                            isAbsent ? 'bg-amber-50 hover:bg-amber-100' : 'bg-white hover:bg-slate-50',
                          )}
                        >
                          <span className={cn(
                            'w-5 h-5 rounded-md border flex items-center justify-center',
                            isAbsent ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-300',
                          )}>
                            {isAbsent && <CheckCircle className="w-3.5 h-3.5" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-black text-slate-800 truncate">{student.name}</span>
                          </span>
                          <span className="text-xs font-bold text-slate-500">{student.studentNo}</span>
                          <span className={cn(
                            'w-fit px-2 py-1 rounded-lg text-[11px] font-black',
                            student.gender === 'female' ? 'bg-pink-50 text-pink-600' : 'bg-blue-50 text-blue-600',
                          )}>
                            {student.gender === 'female' ? '女生' : '男生'}
                          </span>
                          <span className={cn(
                            'text-[11px] font-black',
                            isAbsent ? 'text-amber-700' : 'text-slate-300',
                          )}>
                            {isAbsent ? '请假' : '参加'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <footer className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setIsCreateSessionOpen(false)}
                  className="h-11 px-5 rounded-xl bg-white border border-slate-200 text-sm font-black text-slate-500 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateSession}
                  disabled={!canConfirmCreateSession}
                  className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-blue-600"
                >
                  确认新建
                </button>
              </footer>
            </section>
          </div>
        </>
      )}

      {isUndoSyncOpen && latestSyncHistoryItem && (
        <>
          <div
            className="fixed inset-0 z-[180] bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setIsUndoSyncOpen(false)}
          />
          <div className="fixed inset-0 z-[181] flex items-center justify-center p-4 pointer-events-none">
            <section
              className="w-full max-w-2xl max-h-[82vh] bg-white rounded-[28px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col pointer-events-auto"
              onClick={event => event.stopPropagation()}
            >
              <header className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">撤销同步</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    {latestSyncHistoryItem.scopeLabel} · {getEventLabel(latestSyncHistoryItem.event)} · {latestSyncHistoryItem.snapshots.length} 人可撤销
                  </p>
                </div>
                <button
                  onClick={() => setIsUndoSyncOpen(false)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-500 hover:bg-slate-50"
                >
                  关闭
                </button>
              </header>

              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="text-xs font-bold text-slate-500">
                  已选 {undoStudentIds.length} 人，撤销后会恢复到同步前的成绩
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUndoStudentIds(latestSyncHistoryItem.snapshots.map(snapshot => snapshot.studentId))}
                    className="h-8 px-3 rounded-lg bg-white border border-slate-200 text-xs font-black text-slate-500 hover:bg-slate-50"
                  >
                    全选
                  </button>
                  <button
                    onClick={() => setUndoStudentIds([])}
                    className="h-8 px-3 rounded-lg bg-white border border-slate-200 text-xs font-black text-slate-500 hover:bg-slate-50"
                  >
                    清空
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {latestSyncHistoryItem.snapshots.map(snapshot => {
                  const student = studentsById.get(snapshot.studentId);
                  const isSelected = undoSelection.has(snapshot.studentId);
                  return (
                    <button
                      key={`${latestSyncHistoryItem.id}-${snapshot.studentId}`}
                      onClick={() => toggleUndoStudent(snapshot.studentId)}
                      className={cn(
                        'w-full grid grid-cols-[36px_minmax(0,1fr)_120px] gap-3 items-center px-6 py-4 border-b border-slate-100 text-left transition-all',
                        isSelected ? 'bg-amber-50 hover:bg-amber-100' : 'bg-white hover:bg-slate-50',
                      )}
                    >
                      <span className={cn(
                        'w-5 h-5 rounded-md border flex items-center justify-center',
                        isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-300',
                      )}>
                        {isSelected && <CheckCircle className="w-3.5 h-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-800 truncate">
                          {getStudentLabel(student)}
                        </span>
                        <span className="block text-xs font-bold text-slate-400 truncate">
                          {snapshot.groupName}
                        </span>
                      </span>
                      <span className="text-right text-xs font-black text-slate-500">
                        {snapshot.hadRecord
                          ? snapshot.previousValue
                            ? `恢复 ${snapshot.previousValue}`
                            : '恢复为空'
                          : '删除新记录'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <footer className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setIsUndoSyncOpen(false)}
                  className="h-11 px-5 rounded-xl bg-white border border-slate-200 text-sm font-black text-slate-500 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleUndoScoreSync}
                  disabled={undoStudentIds.length === 0}
                  className="h-11 px-6 rounded-xl bg-amber-500 text-white text-sm font-black hover:bg-amber-600 disabled:opacity-30 disabled:hover:bg-amber-500"
                >
                  撤销选中
                </button>
              </footer>
            </section>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={confirmGenerate}
        title="生成新的分组版本？"
        message={`这会用当前可参加的 ${presentStudents.length} 名学生新增分组版本。录入页不会切换，除非设为录入版。`}
        confirmText="生成"
        cancelText="取消"
        isDangerous={false}
        onConfirm={handleGenerateVersion}
        onCancel={() => setConfirmGenerate(false)}
      />

      <ConfirmModal
        isOpen={confirmUnlockGrouping}
        title="解锁分组？"
        message="确认后当前项目会解除锁定，可以手动修改、删除分组或重新生成。重新确认前，录入页不会把它当作最终分组。"
        confirmText="确认解锁"
        cancelText="取消"
        isDangerous={false}
        onConfirm={handleUnlockGrouping}
        onCancel={() => setConfirmUnlockGrouping(false)}
      />

      {pendingPrearrangedImport && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            onClick={() => setPendingPrearrangedImport(null)}
          />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <section
              className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
              onClick={event => event.stopPropagation()}
            >
              <header className="px-6 py-5 border-b border-slate-100">
                <h2 className="text-xl font-black text-slate-900">导入预排表</h2>
                <p className="text-xs font-bold text-slate-400 mt-1">
                  {pendingPrearrangedImport.summary.sessionName} · {pendingPrearrangedImport.summary.date} · {pendingPrearrangedImport.summary.studentCount} 名学生
                </p>
                <p className="text-xs font-bold text-slate-500 mt-2">
                  {getImportEventSummaryText(pendingPrearrangedImport)}
                </p>
              </header>

              <div className="p-6 space-y-3">
                {([
                  {
                    value: 'appendMissing',
                    title: '关联档案，只新增缺失学生',
                    desc: '默认选项。已有学生直接关联，不重复添加；表里新增的学生会加入学生档案；不删除旧学生、旧成绩和旧测试。',
                  },
                  {
                    value: 'linkOnly',
                    title: '只关联已有学生，不新增',
                    desc: '只把表中能匹配到档案的学生导入到分组里，缺失学生不会加入档案。',
                  },
                  {
                    value: 'replaceYear',
                    title: '清空当前学年后重建',
                    desc: '会删除当前学年的学生档案、成绩、测试和分组，再按这张表重建。',
                  },
                ] as Array<{ value: PrearrangedStudentImportMode; title: string; desc: string }>).map(option => (
                  <button
                    key={option.value}
                    onClick={() => setPrearrangedStudentMode(option.value)}
                    className={cn(
                      'w-full rounded-2xl border p-4 text-left transition-all',
                      prearrangedStudentMode === option.value
                        ? 'border-blue-300 bg-blue-50 ring-4 ring-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                      option.value === 'replaceYear' && prearrangedStudentMode === option.value && 'border-red-300 bg-red-50 ring-red-50',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn(
                        'mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0',
                        prearrangedStudentMode === option.value ? 'border-blue-600 bg-blue-600' : 'border-slate-300',
                        option.value === 'replaceYear' && prearrangedStudentMode === option.value && 'border-red-600 bg-red-600',
                      )}>
                        {prearrangedStudentMode === option.value && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                      <span>
                        <span className={cn(
                          'block text-sm font-black',
                          option.value === 'replaceYear' ? 'text-red-700' : 'text-slate-800',
                        )}>
                          {option.title}
                        </span>
                        <span className="block text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                          {option.desc}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <footer className="px-6 py-4 bg-slate-50 flex justify-end gap-3">
                <button
                  onClick={() => setPendingPrearrangedImport(null)}
                  className="h-11 px-5 rounded-xl bg-white border border-slate-200 text-sm font-black text-slate-500 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    handleConfirmPrearrangedImport();
                    setPendingPrearrangedImport(null);
                  }}
                  className={cn(
                    'h-11 px-6 rounded-xl text-white text-sm font-black',
                    prearrangedStudentMode === 'replaceYear'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700',
                  )}
                >
                  确认导入
                </button>
              </footer>
            </section>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={confirmDeleteSession}
        title="删除当前测试？"
        message={`会删除 ${activeSession?.name || '当前测试'} 的全部分组版本，已同步到成绩排行的成绩不会删除。`}
        confirmText="删除"
        cancelText="取消"
        isDangerous
        onConfirm={handleDeleteSession}
        onCancel={() => setConfirmDeleteSession(false)}
      />

      <ConfirmModal
        isOpen={confirmDeleteGroup}
        title="删除当前分组？"
        message={`会从当前版本中删除 ${selectedGroup?.name || '这个分组'}，学生档案和已有成绩不会删除。`}
        confirmText="删除"
        cancelText="取消"
        isDangerous
        onConfirm={handleDeleteSelectedGroup}
        onCancel={() => setConfirmDeleteGroup(false)}
      />

      {savedToastText && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] bg-green-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 text-sm font-black">
          <CheckCircle className="w-4 h-4" /> {savedToastText}
        </div>
      )}
    </div>
  );
}

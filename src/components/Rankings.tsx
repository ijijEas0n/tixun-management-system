import React, { useState, useMemo } from 'react';
import { AlertTriangle, ArrowUp, BarChart3, ChevronDown, Download, Trophy, Calendar, Edit2, Check, X, Trash2 } from 'lucide-react';
import { Student, TestRecord, ScoreSet, TestSession, SportEventKey } from '../types';
import { formatTime800m, cn } from '../lib/utils';
import { buildRankTestOptions, getRecordTestKey, RecordTarget } from '../lib/testRecords';
import {
  ANALYSIS_EVENTS,
  buildOverallPerformanceAnalysis,
  buildSingleEventPerformanceAnalysis,
  ScoreDistributionBucket,
  StudentChangeItem,
  StudentFastImproverItem,
  StudentVolatilityItem,
  TestTrendPoint,
} from '../lib/performanceAnalysis';
import ConfirmModal from './ConfirmModal';
import { writeObjectRowsFile } from '../lib/tableWorkbook';

interface RankingsProps {
  students: Student[];
  records: Record<string, TestRecord[]>;
  testSessions: TestSession[];
  onUpdateRecord: (studentId: string, target: RecordTarget, scores: Partial<ScoreSet>) => void;
  onDeleteRecord: (studentId: string, recordId: string) => void;
}

type RankType = 'total' | 'hundred' | 'shotPut' | 'tripleJump' | 'eightHundred';
type DashboardMode = 'overall' | 'event';
type ExpandedPanel = 'dashboard' | 'rankings';
type EditingState = {
  studentId: string;
  recordId: string;
  testSessionId?: string;
  event: RankType;
  selectedTestKey: string;
};

function hasValidScore(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasAnyScore(record: TestRecord) {
  return ANALYSIS_EVENTS.some(event => hasValidScore(record.scores[event.id]));
}

export default function Rankings({ students, records, testSessions, onUpdateRecord, onDeleteRecord }: RankingsProps) {
  const [activeType, setActiveType] = useState<RankType>('total');
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('overall');
  const [dashboardEvent, setDashboardEvent] = useState<SportEventKey>('hundred');
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>('dashboard');
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const [editValues, setEditValues] = useState<Partial<ScoreSet>>({});
  const [confirmDelete, setConfirmDelete] = useState<{ studentId: string, recordId: string } | null>(null);
  
  const testOptions = useMemo(() => {
    return buildRankTestOptions(records, students, testSessions);
  }, [records, students, testSessions]);

  const [selectedTestKey, setSelectedTestKey] = useState<string>(testOptions[0]?.key || '');

  React.useEffect(() => {
    if (testOptions.length === 0) {
      setSelectedTestKey('');
      return;
    }
    if (!selectedTestKey || !testOptions.some(option => option.key === selectedTestKey)) {
      setSelectedTestKey(testOptions[0].key);
    }
  }, [testOptions, selectedTestKey]);

  const rankedData = useMemo(() => {
    const effectiveKey = selectedTestKey || testOptions[0]?.key || '';
    const data = students.map(student => {
      const studentRecords = records[student.id] || [];
      const recordOnDate = studentRecords.find(r => getRecordTestKey(r) === effectiveKey);
      return { student, record: recordOnDate };
    }).filter(d => (
      d.record && (activeType === 'total' ? hasAnyScore(d.record) : hasValidScore(d.record.scores[activeType]))
    ));

    return data.sort((a, b) => {
      if (activeType === 'total') {
        const scoreA = a.record?.points.total || 0;
        const scoreB = b.record?.points.total || 0;
        return scoreB - scoreA;
      }
      
      const valA = a.record?.scores[activeType] || 0;
      const valB = b.record?.scores[activeType] || 0;

      if (activeType === 'hundred' || activeType === 'eightHundred') {
        // Lower time is better
        if (valA === 0) return 1;
        if (valB === 0) return -1;
        return valA - valB;
      } else {
        // Higher distance is better
        return valB - valA;
      }
    });
  }, [students, records, selectedTestKey, activeType, testOptions]);

  const selectedOption = testOptions.find(option => option.key === selectedTestKey);

  const analysis = useMemo(() => {
    return buildOverallPerformanceAnalysis(students, records, testSessions);
  }, [students, records, testSessions]);

  const eventAnalysis = useMemo(() => {
    return buildSingleEventPerformanceAnalysis(students, records, dashboardEvent, testSessions);
  }, [students, records, dashboardEvent, testSessions]);

  const formatScore = (value: number | null) => value === null ? '--' : value.toFixed(2);
  const attemptKeys: Record<SportEventKey, keyof ScoreSet> = {
    hundred: 'hundredAttempts',
    shotPut: 'shotPutAttempts',
    tripleJump: 'tripleJumpAttempts',
    eightHundred: 'eightHundredAttempts',
  };
  const formatAttemptValue = (event: SportEventKey, value: number | null | undefined) => {
    if (value === null || value === undefined) return '--';
    if (event === 'eightHundred') return formatTime800m(value);
    if (event === 'hundred') return value.toFixed(2);
    return value.toFixed(2);
  };
  const formatAttempts = (record: TestRecord | undefined, event: SportEventKey) => {
    const attempts = record?.scores[attemptKeys[event]];
    if (!Array.isArray(attempts) || attempts.length === 0) return '';
    return attempts.map(value => formatAttemptValue(event, value)).join(' / ');
  };

  const parseOptionalNumber = (value: string): number | null => {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleStartEdit = (studentId: string, record: TestRecord) => {
    setEditingState({
      studentId,
      recordId: record.id,
      testSessionId: record.testSessionId,
      event: activeType,
      selectedTestKey,
    });
    setEditValues(record.scores);
  };

  const handleSaveEdit = () => {
    if (editingState) {
      if (editingState.selectedTestKey !== selectedTestKey || editingState.event !== activeType) {
        handleCancelEdit();
        return;
      }
      const editingRecord = rankedData.find(item => (
        item.student.id === editingState.studentId && item.record?.id === editingState.recordId
      ))?.record;
      if (!editingRecord) {
        handleCancelEdit();
        return;
      }
      onUpdateRecord(
        editingState.studentId,
        {
          date: editingRecord.date,
          testSessionId: editingRecord.testSessionId,
          testName: editingRecord.testName,
        },
        editValues,
      );
      setEditingState(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingState(null);
    setEditValues({});
  };

  React.useEffect(() => {
    setEditingState(null);
    setEditValues({});
  }, [activeType, selectedTestKey]);

  const handleExport = async () => {
    const exportData = rankedData.map((d, i) => ({
      '排名': i + 1,
      '测试': selectedOption?.label || '测试',
      '姓名': d.student.name,
      '性别': d.student.gender === 'male' ? '男' : '女',
      '100米成绩': d.record?.scores.hundred ? `${d.record.scores.hundred}s` : '--',
      '铅球成绩': d.record?.scores.shotPut ? `${d.record.scores.shotPut}m` : '--',
      '三级跳成绩': d.record?.scores.tripleJump ? `${d.record.scores.tripleJump}m` : '--',
      '800米成绩': d.record?.scores.eightHundred ? formatTime800m(d.record.scores.eightHundred) : '--',
      '总分': d.record?.points.total || 0,
    }));
    await writeObjectRowsFile(
      exportData,
      '成绩报表',
      `体育测试报表_${(selectedOption?.label || '全部').replace(/[\\/:*?"<>|]/g, '_')}.xlsx`,
    );
  };

  const tabs = [
    { id: 'total', label: '总分' },
    { id: 'hundred', label: '100米' },
    { id: 'shotPut', label: '铅球' },
    { id: 'tripleJump', label: '三级跳' },
    { id: 'eightHundred', label: '800米' },
  ] as const;

  const renderLineChart = (points: TestTrendPoint[], title: string) => {
    const values = points.map(point => point.averageTotal);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 100;
    const span = Math.max(1, max - min);
    const chartPoints = points.map((point, index) => {
      const x = points.length <= 1 ? 8 : 8 + (index / (points.length - 1)) * 84;
      const y = 76 - ((point.averageTotal - min) / span) * 54;
      return { x, y, point };
    });
    const path = chartPoints.map(item => `${item.x},${item.y}`).join(' ');

    return (
      <div className="rounded-xl border border-slate-100 bg-white p-3 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[10px] font-black text-slate-400">{title}</p>
          <span className="text-[10px] font-bold text-slate-400">{points.length} 次测试</span>
        </div>
        {points.length === 0 ? (
          <div className="h-28 flex items-center justify-center text-xs font-bold text-slate-300">暂无趋势数据</div>
        ) : (
          <>
            <svg viewBox="0 0 100 82" className="w-full h-28 overflow-visible">
              <line x1="8" y1="76" x2="96" y2="76" stroke="#e2e8f0" strokeWidth="1" />
              <line x1="8" y1="22" x2="96" y2="22" stroke="#f1f5f9" strokeWidth="1" />
              <polyline points={path} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {chartPoints.map(item => (
                <g key={item.point.key}>
                  <circle cx={item.x} cy={item.y} r="3.5" fill="#2563eb" />
                  <text x={item.x} y={item.y - 7} textAnchor="middle" fontSize="7" fontWeight="800" fill="#475569">
                    {item.point.averageTotal.toFixed(1)}
                  </text>
                </g>
              ))}
            </svg>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, points.length)}, minmax(0, 1fr))` }}>
              {points.map(point => (
                <span key={point.key} className="truncate text-center text-[9px] font-black text-slate-400">{point.date.slice(5)}</span>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderDistribution = (distribution: ScoreDistributionBucket[]) => {
    const maxCount = Math.max(1, ...distribution.map(bucket => bucket.count));
    return (
      <div className="space-y-1.5">
        {distribution.map(bucket => (
          <div key={bucket.label} className="grid grid-cols-[48px_1fr_24px] items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500">{bucket.label}</span>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${(bucket.count / maxCount) * 100}%` }} />
            </div>
            <span className="text-right text-[10px] font-black text-slate-500">{bucket.count}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderFocusStudents = (
    fastest: StudentFastImproverItem[],
    declines: StudentChangeItem[],
    volatile: StudentVolatilityItem[],
  ) => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
      <div className="rounded-xl border border-slate-100 bg-white p-3 min-w-0">
        <p className="text-[10px] font-black text-slate-400 mb-2">提分最快</p>
        {fastest.slice(0, 4).map(item => (
          <div key={item.student.id} className="flex justify-between gap-2 text-[11px] font-bold py-0.5">
            <span className="truncate text-slate-700">{item.student.name}</span>
            <span className="text-emerald-600">+{item.change.toFixed(2)}</span>
          </div>
        ))}
        {fastest.length === 0 && <p className="text-[11px] font-bold text-slate-300">暂无数据</p>}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white p-3 min-w-0">
        <p className="text-[10px] font-black text-slate-400 mb-2">连续下滑</p>
        {declines.slice(0, 4).map(item => (
          <div key={item.student.id} className="flex justify-between gap-2 text-[11px] font-bold py-0.5">
            <span className="truncate text-slate-700">{item.student.name}</span>
            <span className="text-red-500">{item.change.toFixed(2)}</span>
          </div>
        ))}
        {declines.length === 0 && <p className="text-[11px] font-bold text-slate-300">暂无数据</p>}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white p-3 min-w-0">
        <p className="text-[10px] font-black text-slate-400 mb-2">波动大</p>
        {volatile.slice(0, 4).map(item => (
          <div key={item.student.id} className="flex justify-between gap-2 text-[11px] font-bold py-0.5">
            <span className="truncate text-slate-700">{item.student.name}</span>
            <span className="text-orange-500">波动{item.range.toFixed(2)}</span>
          </div>
        ))}
        {volatile.length === 0 && <p className="text-[11px] font-bold text-slate-300">暂无数据</p>}
      </div>
    </div>
  );

  const dashboardSnapshots = dashboardMode === 'overall' ? analysis.testAnalyses : eventAnalysis.testAnalyses;
  const dashboardTrend = dashboardMode === 'overall' ? analysis.trend : eventAnalysis.trend;
  const latestSnapshot = dashboardSnapshots[dashboardSnapshots.length - 1] || null;
  const collapsedDashboardLabel = dashboardMode === 'overall' ? '总体情况' : `${eventAnalysis.label}单项情况`;
  const collapsedRankingLabel = selectedOption?.label || '暂无测试';

  const renderCollapsedPanelBar = (
    panel: ExpandedPanel,
    title: string,
    description: string,
    Icon: React.ComponentType<{ className?: string }>,
  ) => (
    <button
      type="button"
      onClick={() => setExpandedPanel(panel)}
      className="panel-switch-in shrink-0 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
    >
      <span className="flex h-full items-center justify-between gap-3 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-black text-slate-800">{title}</span>
            <span className="block truncate text-[10px] font-bold text-slate-400">{description}</span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black text-blue-600">
          展开
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </span>
      </span>
    </button>
  );

  return (
    <div className="h-full flex flex-col p-3 gap-3 overflow-hidden">
      {expandedPanel === 'dashboard' ? (
      <section className="panel-switch-in flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 p-3 overflow-y-auto custom-scrollbar transition-all duration-300 ease-out">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" /> 数据看板
            </h2>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
              {dashboardMode === 'overall' ? '总体情况：总分趋势与逐次分析' : `单项情况：${eventAnalysis.label}趋势与逐次分析`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-[11px] font-black">
              <button
                onClick={() => setDashboardMode('overall')}
                className={cn('px-3 py-1.5 rounded-md', dashboardMode === 'overall' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500')}
              >
                总体情况
              </button>
              <button
                onClick={() => setDashboardMode('event')}
                className={cn('px-3 py-1.5 rounded-md', dashboardMode === 'event' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500')}
              >
                单项情况
              </button>
            </div>
            <button
              type="button"
              aria-label="收起看板并展开成绩排行"
              title="收起看板并展开成绩排行"
              onClick={() => setExpandedPanel('rankings')}
              className="group hidden h-10 w-10 sm:inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-blue-600 hover:text-white hover:shadow-md active:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <ArrowUp className="h-5 w-5 transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-110 group-active:-translate-y-1" />
            </button>
          </div>
        </div>

        {dashboardMode === 'event' && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ANALYSIS_EVENTS.map(event => (
              <button
                key={event.id}
                onClick={() => setDashboardEvent(event.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[11px] font-black border',
                  dashboardEvent === event.id
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-200 text-slate-500',
                )}
              >
                {event.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-3">
          {renderLineChart(dashboardTrend, dashboardMode === 'overall' ? '历次测试总分进步情况' : `${eventAnalysis.label}单项进步情况`)}
          <div className="grid grid-cols-2 gap-2">
            {[
              ['平均分', latestSnapshot?.average ?? null],
              ['最高分', latestSnapshot?.max ?? null],
              ['最低分', latestSnapshot?.min ?? null],
              ['众数', latestSnapshot?.mode ?? null],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                <p className="text-[10px] font-black text-slate-400">{label as string}</p>
                <p className="mt-1 text-xl font-black text-slate-800">{formatScore(value as number | null)}</p>
              </div>
            ))}
          </div>
        </div>

        <details className="group mt-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3" open>
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer text-xs font-black text-slate-700 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span className="truncate">{dashboardMode === 'overall' ? '特别关注学生 / 整体偏弱项目' : '特别关注学生 / 单项区间分布'}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-3">
            {dashboardMode === 'overall'
              ? renderFocusStudents(analysis.fastestImprovers, analysis.continuousDeclines, analysis.highVolatility)
              : renderFocusStudents(eventAnalysis.fastestImprovers, eventAnalysis.continuousDeclines, eventAnalysis.highVolatility)}
            <div className="rounded-xl border border-slate-100 bg-white p-3">
              {dashboardMode === 'overall' ? (
                <>
                  <p className="text-[10px] font-black text-slate-400 mb-2">
                    整体偏弱项目：{analysis.overallWeakestEvent?.label || '--'}
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {analysis.allEventStats.map(stat => (
                      <div key={stat.event} className="min-w-0">
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', analysis.overallWeakestEvent?.event === stat.event ? 'bg-amber-500' : 'bg-blue-500')}
                            style={{ width: `${Math.min(100, (stat.averagePoint / 25) * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] font-black text-slate-500 truncate">{stat.label}</p>
                        <p className="text-[10px] font-bold text-slate-400">{stat.averagePoint.toFixed(1)}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-black text-slate-400 mb-2">最近一次区间分布</p>
                  {latestSnapshot ? renderDistribution(latestSnapshot.distribution) : <p className="text-xs font-bold text-slate-300">暂无数据</p>}
                </>
              )}
            </div>
          </div>
        </details>

      </section>
      ) : (
        renderCollapsedPanelBar('dashboard', '数据看板', collapsedDashboardLabel, BarChart3)
      )}

      {expandedPanel === 'rankings' ? (
      <section className="panel-switch-in flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 ease-out">
        <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-white border border-slate-200 rounded-lg flex items-center pr-2 py-0.5">
               <Calendar className="w-3.5 h-3.5 text-slate-400 mx-2" />
               <select 
                 className="text-xs bg-transparent font-bold text-slate-700 outline-none pr-4"
                 value={selectedTestKey}
                 onChange={(e) => setSelectedTestKey(e.target.value)}
               >
                 {testOptions.length > 0 ? testOptions.map(option => (
                   <option key={option.key} value={option.key}>{option.label}</option>
                 )) : <option value="">暂无测试</option>}
               </select>
            </div>
            
            <div className="flex bg-white border border-slate-200 rounded-lg text-[11px] overflow-hidden p-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveType(tab.id as RankType)}
                  className={cn(
                    "px-3 py-1 rounded-md transition-all font-bold",
                    activeType === tab.id 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
             <button
               type="button"
               onClick={() => setExpandedPanel('dashboard')}
               className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-500 transition-all hover:border-blue-200 hover:text-blue-600"
             >
               看板
               <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
             </button>
             <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:block">共有 {rankedData.length} 位选手参测</div>
             <button onClick={handleExport} className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:bg-blue-50 px-2.5 py-1 rounded-md transition-all">
                <Download className="w-3.5 h-3.5" /> 导出报表
             </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-3 border-b border-slate-100 text-center w-14">排名</th>
                <th className="px-4 py-3 border-b border-slate-100 min-w-[120px]">姓名</th>
                {(activeType === 'total' || activeType === 'hundred') && <th className="px-4 py-3 border-b border-slate-100 text-center">100m (s)</th>}
                {(activeType === 'total' || activeType === 'shotPut') && <th className="px-4 py-3 border-b border-slate-100 text-center text-green-700">铅球 (m)</th>}
                {(activeType === 'total' || activeType === 'tripleJump') && <th className="px-4 py-3 border-b border-slate-100 text-center text-purple-700">三跳 (m)</th>}
                {(activeType === 'total' || activeType === 'eightHundred') && <th className="px-4 py-3 border-b border-slate-100 text-center text-blue-700">800m</th>}
                <th className="px-4 py-3 border-b border-slate-100 text-right pr-6">{activeType === 'total' ? '总分' : '单项得分'}</th>
                <th className="px-4 py-3 border-b border-slate-100 text-center w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-mono text-slate-600">
              {rankedData.map((d, index) => {
                const isEditing = editingState?.studentId === d.student.id && editingState.recordId === d.record?.id;

                return (
                  <tr key={d.student.id} className={cn(
                    "hover:bg-blue-50/40 transition-colors group",
                    isEditing && "bg-blue-50/50"
                  )}>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn(
                      "text-xs font-black",
                      index === 0 ? "text-orange-500" : index < 3 ? "text-slate-800" : "text-slate-400"
                    )}>
                      {(index + 1).toString().padStart(2, '0')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-sans font-bold text-slate-800">
                    <div className="flex items-center gap-2">
                       <div className="flex flex-col min-w-0">
                         <span className="truncate">{d.student.name}</span>
                         <span className="text-[10px] font-mono font-bold text-slate-400 -mt-1 leading-none tracking-tighter">#{d.student.studentNo}</span>
                       </div>
                       <span className={cn(
                         "text-[9px] px-1 rounded font-black uppercase shrink-0",
                         d.student.gender === 'male' ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                       )}>
                         {d.student.gender === 'male' ? '男' : '女'}
                       </span>
                    </div>
                  </td>
                  {(activeType === 'total' || activeType === 'hundred') && (
                    <td className={cn("px-4 py-2.5 text-center text-[13px]", activeType === 'hundred' && "bg-blue-50/30")}>
                      {isEditing ? (
                        <input 
                          type="number" 
                          step="0.01"
                          className="w-16 px-1 py-0.5 border border-blue-200 rounded text-center outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                          value={editValues.hundred ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, hundred: parseOptionalNumber(e.target.value) })}
                        />
                      ) : (
                        <>
                          {d.record?.scores.hundred?.toFixed(2) || '-'} 
                          <span className="text-[10px] font-bold text-slate-300 ml-1">({d.record?.points.hundred.toFixed(2)})</span>
                          {formatAttempts(d.record, 'hundred') && (
                            <p className="mt-0.5 text-[9px] font-bold text-slate-300 truncate">记录 {formatAttempts(d.record, 'hundred')}</p>
                          )}
                        </>
                      )}
                    </td>
                  )}
                  {(activeType === 'total' || activeType === 'shotPut') && (
                    <td className={cn("px-4 py-2.5 text-center text-[13px] text-green-600 font-medium", activeType === 'shotPut' && "bg-green-50/30")}>
                      {isEditing ? (
                        <input 
                          type="number" 
                          step="0.01"
                          className="w-16 px-1 py-0.5 border border-green-200 rounded text-center outline-none focus:ring-1 focus:ring-green-500 font-mono text-xs"
                          value={editValues.shotPut ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, shotPut: parseOptionalNumber(e.target.value) })}
                        />
                      ) : (
                        <>
                          {d.record?.scores.shotPut?.toFixed(2) || '-'}
                          <span className="text-[10px] font-bold text-slate-300 ml-1">({d.record?.points.shotPut.toFixed(2)})</span>
                          {formatAttempts(d.record, 'shotPut') && (
                            <p className="mt-0.5 text-[9px] font-bold text-slate-300 truncate">记录 {formatAttempts(d.record, 'shotPut')}</p>
                          )}
                        </>
                      )}
                    </td>
                  )}
                  {(activeType === 'total' || activeType === 'tripleJump') && (
                    <td className={cn("px-4 py-2.5 text-center text-[13px] text-purple-600 font-medium", activeType === 'tripleJump' && "bg-purple-50/30")}>
                      {isEditing ? (
                        <input 
                          type="number" 
                          step="0.01"
                          className="w-16 px-1 py-0.5 border border-purple-200 rounded text-center outline-none focus:ring-1 focus:ring-purple-500 font-mono text-xs"
                          value={editValues.tripleJump ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, tripleJump: parseOptionalNumber(e.target.value) })}
                        />
                      ) : (
                        <>
                          {d.record?.scores.tripleJump?.toFixed(2) || '-'}
                          <span className="text-[10px] font-bold text-slate-300 ml-1">({d.record?.points.tripleJump.toFixed(2)})</span>
                          {formatAttempts(d.record, 'tripleJump') && (
                            <p className="mt-0.5 text-[9px] font-bold text-slate-300 truncate">记录 {formatAttempts(d.record, 'tripleJump')}</p>
                          )}
                        </>
                      )}
                    </td>
                  )}
                  {(activeType === 'total' || activeType === 'eightHundred') && (
                    <td className={cn("px-4 py-2.5 text-center text-[13px] text-blue-600", activeType === 'eightHundred' && "bg-blue-50/30")}>
                      {isEditing ? (
                        <input 
                          type="number" 
                          placeholder="秒"
                          className="w-16 px-1 py-0.5 border border-blue-200 rounded text-center outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                          value={editValues.eightHundred ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, eightHundred: parseOptionalNumber(e.target.value) })}
                        />
                      ) : (
                        <>
                          {d.record?.scores.eightHundred ? formatTime800m(d.record.scores.eightHundred) : '-'}
                          <span className="text-[10px] font-bold text-slate-300 ml-1">({d.record?.points.eightHundred.toFixed(2)})</span>
                          {formatAttempts(d.record, 'eightHundred') && (
                            <p className="mt-0.5 text-[9px] font-bold text-slate-300 truncate">记录 {formatAttempts(d.record, 'eightHundred')}</p>
                          )}
                        </>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right pr-6 bg-slate-50/30 group-hover:bg-blue-50/5 transition-colors">
                    <div className="flex items-center justify-end gap-3">
                      <span className="font-bold text-blue-700 text-base">
                        {(activeType === 'total' ? d.record?.points.total : d.record?.points[activeType])?.toFixed(2)}
                      </span>
                      {!isEditing && (
                        <button 
                          onClick={() => setConfirmDelete({ studentId: d.student.id, recordId: d.record!.id })}
                          className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                          title="删除本次成绩"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          onClick={handleSaveEdit}
                          className="p-1 px-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                          title="确认"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={handleCancelEdit}
                          className="p-1 px-2 bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition-colors"
                          title="取消"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleStartEdit(d.student.id, d.record!)}
                        className="p-1 text-[10px] font-bold text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-all opacity-0 group-hover:opacity-100 mx-auto flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" /> 修改
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
          {rankedData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300">
               <Trophy className="w-12 h-12 mb-2 opacity-20" />
               <p className="text-sm font-bold opacity-40">此日期暂无测试数据</p>
            </div>
          )}
        </div>
      </section>
      ) : (
        renderCollapsedPanelBar('rankings', '成绩排行', `${collapsedRankingLabel} · ${rankedData.length} 位参测`, Trophy)
      )}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title="删除本次成绩？"
        message="确定要删除该生本次测试的所有项目成绩吗？此操作不可撤销。"
        onConfirm={() => {
          if (confirmDelete) onDeleteRecord(confirmDelete.studentId, confirmDelete.recordId);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

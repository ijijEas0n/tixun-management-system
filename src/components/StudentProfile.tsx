import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ArrowLeft, Trophy, Clock, Ruler, Target, TrendingUp } from 'lucide-react';
import { Student, TestRecord } from '../types';
import { formatTime800m, cn } from '../lib/utils';
import { getStudentBestScores } from '../lib/studentStats';
import { buildStudentReportRows } from '../lib/studentReport';
import * as XLSX from 'xlsx';

interface StudentProfileProps {
  student: Student;
  records: TestRecord[];
  onBack: () => void;
}

interface ChartPoint {
  date: string;
  [key: string]: string | number | null;
}

interface ProfileLineChartProps {
  data: ChartPoint[];
  dataKey: string;
  color: string;
}

function ProfileLineChart({ data, dataKey, color }: ProfileLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = (nextWidth: number) => {
      const normalizedWidth = Math.max(0, Math.floor(nextWidth));
      setWidth(current => current === normalizedWidth ? current : normalizedWidth);
    };

    updateWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver(entries => {
      updateWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-[180px] w-full min-w-0">
      {width > 0 && (
        <LineChart width={width} height={180} data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
          <YAxis tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              fontSize: '10px',
              fontWeight: 'bold'
            }}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color, strokeWidth: 1.5, stroke: '#fff' }} activeDot={{ r: 5 }} />
        </LineChart>
      )}
    </div>
  );
}

export default function StudentProfile({ student, records, onBack }: StudentProfileProps) {
  const sortedRecords = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const bestScores = getStudentBestScores(records);

  const chartData = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(r => ({
      date: r.date.split('-').slice(1).join('-'), // MM-DD
      '总分': r.points.total,
      '100米': r.scores.hundred,
      '铅球': r.scores.shotPut,
      '三级跳': r.scores.tripleJump,
      '800米': r.scores.eightHundred,
    }));

  const chartComponents = [
    { key: '100米', label: '100米短跑 (秒)', color: '#f97316', icon: Clock },
    { key: '铅球', label: '铅球投掷 (米)', color: '#22c55e', icon: Target },
    { key: '三级跳', label: '三级跳远 (米)', color: '#a855f7', icon: Ruler },
    { key: '800米', label: '800米中长跑 (秒)', color: '#3b82f6', icon: Trophy },
    { key: '总分', label: '综合总分 (分)', color: '#ef4444', icon: TrendingUp },
  ];

  const handleExport = () => {
    const rows = buildStudentReportRows(student, records);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '个人成绩报表');
    XLSX.writeFile(workbook, `${student.name}_${student.studentNo}_个人成绩报表.xlsx`);
  };

  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-hidden animate-in fade-in duration-300">
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
        {/* Left Stats & Chart Panel */}
        <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 border border-slate-100">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg",
                  student.gender === 'male' ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
                )}>
                  {student.name[0]}
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-800 tracking-tight">{student.name}</h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    学号: {student.studentNo} • {student.gender === 'male' ? '体育生 (男)' : '体育生 (女)'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="hidden lg:grid grid-cols-2 gap-4 text-center">
              <div className="px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase">历史最高总分</p>
                <p className="text-lg font-black text-blue-600">{bestScores.total === null ? '0.00' : bestScores.total.toFixed(2)}</p>
              </div>
              <div className="px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase">当前学号</p>
                <p className="text-lg font-black text-slate-800">{student.studentNo}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: '100m PB', val: bestScores.hundred === null ? '--' : `${bestScores.hundred}s`, icon: Clock, color: 'text-orange-500' },
              { label: '铅球 PB', val: bestScores.shotPut === null ? '--' : `${bestScores.shotPut}m`, icon: Target, color: 'text-green-500' },
              { label: '三跳 PB', val: bestScores.tripleJump === null ? '--' : `${bestScores.tripleJump}m`, icon: Ruler, color: 'text-purple-500' },
              { label: '800m PB', val: formatTime800m(bestScores.eightHundred), icon: Trophy, color: 'text-blue-500' },
            ].map((stat, i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">{stat.label}</span>
                  <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                </div>
                <p className="text-xl font-black text-slate-800">{stat.val}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {chartComponents.map((chart) => (
              <div key={chart.key} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm min-w-0">
                 <div className="flex items-center justify-between mb-6">
                   <h3 className="text-[11px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                     <chart.icon className="w-4 h-4" style={{ color: chart.color }} />
                     {chart.label}
                   </h3>
                 </div>
                 <ProfileLineChart data={chartData} dataKey={chart.key} color={chart.color} />
              </div>
            ))}
          </div>
        </div>

        {/* Right History Panel */}
        <div className="w-full md:w-80 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">历史成绩记录</p>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
            {sortedRecords.length > 0 ? sortedRecords.map((r, i) => (
              <div key={r.id} className={cn(
                "p-4 border-l-4 transition-all hover:bg-slate-50",
                i === 0 ? "border-blue-500 bg-blue-50/20" : "border-slate-200"
              )}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[11px] font-black text-slate-700">
                    {r.testName ? `${r.testName} · ${r.date}` : `${r.date} 测试`}
                  </span>
                  <span className="text-sm font-black text-blue-700 font-mono">{r.points.total.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-1 gap-x-2">
                   <div className="flex justify-between text-[10px] text-slate-500">
                     <span>100m:</span>
                     <span className="font-mono">{r.scores.hundred ? `${r.scores.hundred}s` : '-'}</span>
                   </div>
                   <div className="flex justify-between text-[10px] text-slate-500">
                     <span>铅球:</span>
                     <span className="font-mono">{r.scores.shotPut ? `${r.scores.shotPut}m` : '-'}</span>
                   </div>
                   <div className="flex justify-between text-[10px] text-slate-500">
                     <span>三跳:</span>
                     <span className="font-mono">{r.scores.tripleJump ? `${r.scores.tripleJump}m` : '-'}</span>
                   </div>
                   <div className="flex justify-between text-[10px] text-slate-500">
                     <span>800m:</span>
                     <span className="font-mono">{formatTime800m(r.scores.eightHundred)}</span>
                   </div>
                </div>
              </div>
            )) : (
              <div className="py-20 flex flex-col items-center justify-center opacity-20 text-slate-400 grayscale">
                <Target className="w-12 h-12 mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest">无历史数据</p>
              </div>
            )}
          </div>
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex gap-2">
            <button
              onClick={handleExport}
              disabled={records.length === 0}
              className="flex-1 bg-white border border-slate-200 text-[10px] font-black uppercase py-2 rounded-lg hover:bg-white/80 transition-all disabled:opacity-30"
            >
              导出此人报表
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

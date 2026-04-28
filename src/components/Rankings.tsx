import React, { useState, useMemo } from 'react';
import { Download, Trophy, Zap, Target, Ruler, Star, Calendar, Users, Edit2, Check, X, Trash2 } from 'lucide-react';
import { Student, TestRecord, AppData, ScoreSet } from '../types';
import { formatTime800m, cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import ConfirmModal from './ConfirmModal';

interface RankingsProps {
  students: Student[];
  records: Record<string, TestRecord[]>;
  onUpdateRecord: (studentId: string, date: string, scores: Partial<ScoreSet>) => void;
  onDeleteRecord: (studentId: string, recordId: string) => void;
}

type RankType = 'total' | 'hundred' | 'shotPut' | 'tripleJump' | 'eightHundred';

export default function Rankings({ students, records, onUpdateRecord, onDeleteRecord }: RankingsProps) {
  const [activeType, setActiveType] = useState<RankType>('total');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ScoreSet>>({});
  const [confirmDelete, setConfirmDelete] = useState<{ studentId: string, recordId: string } | null>(null);
  
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    Object.values(records).forEach(studentRecords => {
      studentRecords.forEach(r => dates.add(r.date));
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [records]);

  const [selectedDate, setSelectedDate] = useState<string>(availableDates[0] || '');

  const rankedData = useMemo(() => {
    const data = students.map(student => {
      const studentRecords = records[student.id] || [];
      const recordOnDate = studentRecords.find(r => r.date === (selectedDate || availableDates[0]));
      return { student, record: recordOnDate };
    }).filter(d => d.record);

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
  }, [students, records, selectedDate, activeType, availableDates]);

  const handleStartEdit = (studentId: string, currentScores: ScoreSet) => {
    setEditingId(studentId);
    setEditValues(currentScores);
  };

  const handleSaveEdit = () => {
    if (editingId && selectedDate) {
      onUpdateRecord(editingId, selectedDate, editValues);
      setEditingId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleExport = () => {
    const exportData = rankedData.map((d, i) => ({
      '排名': i + 1,
      '姓名': d.student.name,
      '性别': d.student.gender === 'male' ? '男' : '女',
      '100米成绩': d.record?.scores.hundred ? `${d.record.scores.hundred}s` : '--',
      '铅球成绩': d.record?.scores.shotPut ? `${d.record.scores.shotPut}m` : '--',
      '三级跳成绩': d.record?.scores.tripleJump ? `${d.record.scores.tripleJump}m` : '--',
      '800米成绩': d.record?.scores.eightHundred ? formatTime800m(d.record.scores.eightHundred) : '--',
      '总分': d.record?.points.total || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "成绩报表");
    XLSX.writeFile(wb, `体育测试报表_${selectedDate || '全部'}.xlsx`);
  };

  const tabs = [
    { id: 'total', label: '总分' },
    { id: 'hundred', label: '100米' },
    { id: 'shotPut', label: '铅球' },
    { id: 'tripleJump', label: '三级跳' },
    { id: 'eightHundred', label: '800米' },
  ] as const;

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <section className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="bg-white border border-slate-200 rounded-lg flex items-center pr-2 py-0.5">
               <Calendar className="w-3.5 h-3.5 text-slate-400 mx-2" />
               <select 
                 className="text-xs bg-transparent font-bold text-slate-700 outline-none pr-4"
                 value={selectedDate}
                 onChange={(e) => setSelectedDate(e.target.value)}
               >
                 {availableDates.length > 0 ? availableDates.map(date => (
                   <option key={date} value={date}>{date} 测试</option>
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

          <div className="flex items-center gap-4">
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
                const isEditing = editingId === d.student.id;

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
                          value={editValues.hundred || ''}
                          onChange={(e) => setEditValues({ ...editValues, hundred: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <>
                          {d.record?.scores.hundred?.toFixed(2) || '-'} 
                          <span className="text-[10px] font-bold text-slate-300 ml-1">({d.record?.points.hundred.toFixed(2)})</span>
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
                          value={editValues.shotPut || ''}
                          onChange={(e) => setEditValues({ ...editValues, shotPut: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <>
                          {d.record?.scores.shotPut?.toFixed(2) || '-'}
                          <span className="text-[10px] font-bold text-slate-300 ml-1">({d.record?.points.shotPut.toFixed(2)})</span>
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
                          value={editValues.tripleJump || ''}
                          onChange={(e) => setEditValues({ ...editValues, tripleJump: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <>
                          {d.record?.scores.tripleJump?.toFixed(2) || '-'}
                          <span className="text-[10px] font-bold text-slate-300 ml-1">({d.record?.points.tripleJump.toFixed(2)})</span>
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
                          value={editValues.eightHundred || ''}
                          onChange={(e) => setEditValues({ ...editValues, eightHundred: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <>
                          {d.record?.scores.eightHundred ? formatTime800m(d.record.scores.eightHundred) : '-'}
                          <span className="text-[10px] font-bold text-slate-300 ml-1">({d.record?.points.eightHundred.toFixed(2)})</span>
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
                        onClick={() => handleStartEdit(d.student.id, d.record!.scores)}
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

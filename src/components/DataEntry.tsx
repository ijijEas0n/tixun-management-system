import React, { useState, useMemo } from 'react';
import { Save, Calendar as CalendarIcon, Zap, Ruler, Target, Trophy, CheckCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Student, ScoreSet, ScorePoints } from '../types';
import { formatTime800m, parseTime800m, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface DataEntryProps {
  students: Student[];
  onSaveBatch: (updates: { studentId: string; date: string; scores: Partial<ScoreSet> }[]) => void;
}

type EntryItem = 'hundred' | 'shotPut' | 'tripleJump' | 'eightHundred';

export default function DataEntry({ students, onSaveBatch }: DataEntryProps) {
  const [testDate, setTestDate] = useState(() => {
    return localStorage.getItem('draft_test_date') || new Date().toISOString().split('T')[0];
  });
  const [activeItem, setActiveItem] = useState<EntryItem>(() => {
    return (localStorage.getItem('draft_active_item') as EntryItem) || 'hundred';
  });
  
  // Nested state: item -> studentId -> [val1, val2, val3]
  const [allInputs, setAllInputs] = useState<Record<EntryItem, Record<string, string[]>>>(() => {
    const saved = localStorage.getItem(`draft_entry_inputs_${testDate}`);
    return saved ? JSON.parse(saved) : {
      hundred: {},
      shotPut: {},
      tripleJump: {},
      eightHundred: {}
    };
  });

  const [showSaved, setShowSaved] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 20;

  // Persist draft to localStorage whenever allInputs or testDate or activeItem changes
  React.useEffect(() => {
    localStorage.setItem(`draft_entry_inputs_${testDate}`, JSON.stringify(allInputs));
  }, [allInputs, testDate]);

  React.useEffect(() => {
    localStorage.setItem('draft_test_date', testDate);
    // When date changes, load that date's draft
    const saved = localStorage.getItem(`draft_entry_inputs_${testDate}`);
    if (saved) {
      setAllInputs(JSON.parse(saved));
    } else {
      setAllInputs({
        hundred: {},
        shotPut: {},
        tripleJump: {},
        eightHundred: {}
      });
    }
  }, [testDate]);

  React.useEffect(() => {
    localStorage.setItem('draft_active_item', activeItem);
  }, [activeItem]);

  const items = [
    { id: 'hundred', label: '100米', icon: Zap, unit: '秒', color: 'text-orange-500', bg: 'bg-orange-50', trials: 3, type: 'min' },
    { id: 'shotPut', label: '铅球', icon: Target, unit: '米', color: 'text-green-500', bg: 'bg-green-50', trials: 3, type: 'max' },
    { id: 'tripleJump', label: '三级跳', icon: Ruler, unit: '米', color: 'text-purple-500', bg: 'bg-purple-50', trials: 3, type: 'max' },
    { id: 'eightHundred', label: '800米', icon: Trophy, unit: '秒 (如132)', color: 'text-blue-500', bg: 'bg-blue-50', trials: 1, type: 'min' },
  ] as const;

  const filteredStudents = useMemo(() => {
    const list = students.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (s.studentNo || "").includes(searchTerm)
    ).sort((a, b) => (a.studentNo || "").localeCompare(b.studentNo || ""));
    return list;
  }, [students, searchTerm]);

  const totalPages = Math.ceil(filteredStudents.length / pageSize);
  const paginatedStudents = filteredStudents.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const handleInputChange = (studentId: string, val: string, index: number) => {
    setAllInputs(prev => {
      const currentValues = [...(prev[activeItem][studentId] || ['', '', ''])];
      currentValues[index] = val;
      return {
        ...prev,
        [activeItem]: {
          ...prev[activeItem],
          [studentId]: currentValues
        }
      };
    });
  };

  const handleSave = () => {
    const updates: { studentId: string; date: string; scores: Partial<ScoreSet> }[] = [];

    students.forEach(s => {
      const scores: Partial<ScoreSet> = {};
      let hasUpdate = false;
      
      items.forEach(item => {
        const values = allInputs[item.id][s.id] || [];
        const numericValues: number[] = [];
        const attempts: (number | null)[] = [];

        values.forEach(v => {
          if (!v) {
            attempts.push(null);
            return;
          }
          let scoreVal: number | null = null;
          if (item.id === 'eightHundred') {
            scoreVal = parseTime800m(v);
          } else {
            scoreVal = parseFloat(v);
          }

          if (scoreVal !== null && !isNaN(scoreVal)) {
            numericValues.push(scoreVal);
            attempts.push(scoreVal);
          } else {
            attempts.push(null);
          }
        });

        if (numericValues.length > 0) {
          const itemConfig = items.find(i => i.id === item.id);
          const best = itemConfig?.type === 'min' ? Math.min(...numericValues) : Math.max(...numericValues);
          scores[item.id as keyof ScoreSet] = best as any;
          // Store attempts
          const attemptsKey = `${item.id}Attempts` as keyof ScoreSet;
          (scores as any)[attemptsKey] = attempts;
          hasUpdate = true;
        }
      });

      if (hasUpdate) {
        updates.push({
          studentId: s.id,
          date: testDate,
          scores,
        });
      }
    });

    if (updates.length > 0) {
      onSaveBatch(updates);
      // No clearing as requested
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-hidden animate-in fade-in duration-300">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full lg:w-auto">
           <div className="flex items-center gap-3 shrink-0">
              <div className="p-2 bg-blue-50 rounded-lg">
                 <CalendarIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">测试日期</p>
                 <input
                   type="date"
                   className="bg-transparent font-black text-slate-800 text-sm outline-none cursor-pointer"
                   value={testDate}
                   onChange={(e) => setTestDate(e.target.value)}
                 />
              </div>
           </div>

           <div className="h-8 w-[1px] bg-slate-200 hidden lg:block"></div>

           <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="按姓名/学号快速定位..."
                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 font-bold"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(0);
                }}
              />
           </div>
        </div>

        <div className="grid grid-cols-2 md:flex gap-2 p-0.5 bg-slate-100 border border-slate-200 rounded-lg w-full lg:w-auto">
           {items.map((item) => (
             <button
               key={item.id}
               onClick={() => setActiveItem(item.id)}
               className={cn(
                 "px-4 py-1.5 rounded-md text-[11px] font-black transition-all flex items-center justify-center lg:justify-start gap-2",
                 activeItem === item.id ? "bg-white text-blue-700 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"
               )}
             >
               <item.icon className={cn("w-3.5 h-3.5", activeItem === item.id ? item.color : "text-slate-400")} />
               {item.label}
             </button>
           ))}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <header className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", items.find(i => i.id === activeItem)?.bg.replace('bg', 'bg-active'))} style={{ backgroundColor: items.find(i=>i.id===activeItem)?.color.split('-')[1] }} />
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              正录入: {items.find(i => i.id === activeItem)?.label} ({items.find(i => i.id === activeItem)?.unit})
            </h3>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-1 hover:bg-slate-200 rounded disabled:opacity-20 transition-all"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <span className="text-[10px] font-black text-slate-500 min-w-[50px] text-center">
                第 {currentPage + 1} / {Math.max(1, totalPages)} 页
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="p-1 hover:bg-slate-200 rounded disabled:opacity-20 transition-all"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="h-4 w-[1px] bg-slate-300 hidden md:block"></div>
            <span className="text-[10px] font-bold text-slate-400 tracking-wider hidden md:block">
              {filteredStudents.length} 个结果
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-x-auto relative">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="bg-slate-50/30 text-[9px] font-black text-slate-400 uppercase tracking-widest sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="px-6 py-2 border-b border-slate-100">运动员 / 学号</th>
                <th className="px-6 py-2 border-b border-slate-100 text-right pr-12">该项录入 ({items.find(i => i.id === activeItem)?.unit})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedStudents.map((student) => (
                <tr key={student.id} className="group hover:bg-blue-50/10 transition-colors">
                  <td className="px-6 py-2">
                    <div className="flex items-center gap-3">
                       <div className={cn(
                         "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black border uppercase",
                         student.gender === 'male' ? "bg-blue-50 border-blue-100 text-blue-600" : "bg-pink-50 border-pink-100 text-pink-700"
                       )}>
                         {student.name[0]}
                       </div>
                       <div>
                         <div className="flex items-center gap-2 leading-none">
                           <p className="font-bold text-slate-800 text-xs">{student.name}</p>
                           <span className="text-[9px] text-slate-400 font-mono tracking-tighter">#{student.studentNo}</span>
                         </div>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-2 text-right pr-10">
                    <div className="flex justify-end gap-2">
                      {Array.from({ length: items.find(i => i.id === activeItem)?.trials || 1 }).map((_, idx) => (
                        <div key={idx} className="flex flex-col items-center">
                          {items.find(i => i.id === activeItem)!.trials > 1 && (
                            <span className="text-[8px] text-slate-300 font-bold mb-0.5">#{idx + 1}</span>
                          )}
                          <input
                            type="text"
                            placeholder={activeItem === 'eightHundred' ? "132" : "0.00"}
                            className="w-16 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-center font-bold text-slate-700 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-300"
                            value={(allInputs[activeItem][student.id] || [])[idx] || ''}
                            onChange={(e) => handleInputChange(student.id, e.target.value, idx)}
                          />
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredStudents.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center py-24 text-slate-300 space-y-2">
              <Trophy className="w-12 h-12 opacity-10" />
              <p className="text-sm font-black uppercase tracking-widest opacity-20">未找到相关运动员</p>
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="flex flex-col gap-1">
             <div className="flex items-center gap-4">
                {items.map(item => {
                  const count = Object.keys(allInputs[item.id]).length;
                  if (count === 0) return null;
                  return (
                    <div key={item.id} className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded text-[9px] font-black text-slate-600">
                       <item.icon className={cn("w-2.5 h-2.5", item.color)} />
                       {item.label}: {count}人
                    </div>
                  );
                })}
             </div>
             <AnimatePresence>
               {showSaved && (
                 <motion.div 
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -10 }}
                   className="flex items-center gap-1.5 text-[10px] font-black text-green-600 uppercase tracking-widest"
                 >
                   <CheckCircle className="w-3 h-3" /> 数据已保存到本机
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="text-[10px] text-slate-400 font-bold text-right mr-2 leading-tight hidden lg:block">
              录入完成后请点击保存<br/>以免数据意外丢失
            </div>
            <button
              onClick={handleSave}
              disabled={Object.values(allInputs).every(obj => Object.keys(obj).length === 0)}
              className="flex-1 sm:flex-none bg-blue-600 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
            >
              保存本次录入
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

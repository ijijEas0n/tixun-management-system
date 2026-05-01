import React, { useState, useMemo } from 'react';
import { Search, UserPlus, Upload, Trash2, ChevronRight, User } from 'lucide-react';
import { Student, StudentGender } from '../types';
import { getFirstLetter, cn } from '../lib/utils';
import ConfirmModal from './ConfirmModal';
import { parseStudentImportWorkbook } from '../lib/studentImport';
import { readWorkbookMatrices } from '../lib/tableWorkbook';

interface StudentListProps {
  students: Student[];
  onAdd: (name: string, gender: StudentGender) => void;
  onBatchAdd: (students: { name: string; gender: StudentGender; studentNo?: string }[]) => void;
  onDelete: (id: string) => void;
  onBatchDelete: (ids: string[]) => void;
  onSelect: (student: Student) => void;
}

export default function StudentList({ students, onAdd, onBatchAdd, onDelete, onBatchDelete, onSelect }: StudentListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGender, setActiveGender] = useState<StudentGender | 'all'>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState<StudentGender>('male');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [importMessage, setImportMessage] = useState('');

  const filteredStudents = useMemo(() => {
    return students
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (s.studentNo || "").includes(searchTerm);
        const matchesGender = activeGender === 'all' || s.gender === activeGender;
        return matchesSearch && matchesGender;
      })
      .sort((a, b) => {
        return (a.studentNo || "").localeCompare(b.studentNo || "");
      });
  }, [students, searchTerm, activeGender]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setIsBatchDeleting(true);
  };

  const groupedStudents = useMemo(() => {
    const groups: Record<string, Student[]> = {};
    filteredStudents.forEach(s => {
      const letter = getFirstLetter(s.name);
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(s);
    });
    return groups;
  }, [filteredStudents]);

  const handleAdd = () => {
    if (newName.trim()) {
      onAdd(newName.trim(), newGender);
      setNewName('');
      setIsAdding(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const sheets = await readWorkbookMatrices(file);
      const newStudentsBatch = parseStudentImportWorkbook(sheets);
      if (newStudentsBatch.length > 0) {
        onBatchAdd(newStudentsBatch);
        setImportMessage(`已读取 ${newStudentsBatch.length} 名学生，重复档案会自动跳过`);
      } else {
        setImportMessage('没有识别到学生名单');
      }
    } catch {
      setImportMessage('表格读取失败，请检查文件格式');
    }
    e.target.value = '';
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden">
        <header className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center space-x-4 flex-1 max-w-xl">
             <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500" 
                  checked={selectedIds.size > 0 && selectedIds.size === filteredStudents.length}
                  onChange={toggleSelectAll}
                />
             </div>
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
               <input
                 type="text"
                 placeholder="按姓名或学号搜索..."
                 className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
             </div>
             <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] font-bold">
               {(['all', 'male', 'female'] as const).map(g => (
                 <button
                   key={g}
                   onClick={() => setActiveGender(g)}
                   className={cn(
                     "px-3 py-1 rounded-md transition-all",
                     activeGender === g ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"
                   )}
                 >
                   {g === 'all' ? '全部' : g === 'male' ? '男生' : '女生'}
                 </button>
               ))}
             </div>
             {importMessage && (
               <div className="text-[11px] font-bold text-slate-400 truncate max-w-40">
                 {importMessage}
               </div>
             )}
          </div>
          
          <div className="flex items-center space-x-2">
            {selectedIds.size > 0 && (
              <button 
                onClick={handleBatchDelete}
                className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-all flex items-center gap-1.5 text-xs font-black shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" /> 批量删除 ({selectedIds.size})
              </button>
            )}
            <label className="cursor-pointer bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-1.5 text-xs font-bold">
               <Upload className="w-3.5 h-3.5" /> 导入表格
               <input type="file" className="hidden" accept=".xlsx, .csv" onChange={handleImport} />
            </label>
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm shadow-blue-200"
            >
              <UserPlus className="w-3.5 h-3.5" /> 新增
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto custom-scrollbar divide-y divide-slate-50">
          {Object.keys(groupedStudents).sort().map(letter => (
            <div key={letter} className="relative">
              <div className="bg-slate-50/80 backdrop-blur-sm px-4 py-1 sticky top-0 z-10 border-b border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{letter}</span>
              </div>
              {groupedStudents[letter].map(student => (
                <div
                  key={student.id}
                  className={cn(
                    "group px-4 py-3 flex items-center justify-between transition-all cursor-pointer border-l-2",
                    selectedIds.has(student.id) ? "bg-blue-50/60 border-blue-500" : "hover:bg-blue-50/40 border-transparent hover:border-blue-300"
                  )}
                  onClick={() => onSelect(student)}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="p-1"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(student.id); }}
                    >
                      <input 
                        type="checkbox" 
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                        checked={selectedIds.has(student.id)}
                        onChange={() => {}} // Controlled via onClick
                      />
                    </div>
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black border",
                      student.gender === 'male' ? "bg-blue-50 border-blue-100 text-blue-600" : "bg-pink-50 border-pink-100 text-pink-700"
                    )}>
                      {student.name[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-800 text-sm group-hover:text-blue-700 transition-colors">{student.name}</h3>
                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-mono">{student.studentNo}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                        {student.gender === 'male' ? '体育生 • 男' : '体育生 • 女'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(student.id);
                      }}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 opacity-20 text-slate-400">
              <User className="w-16 h-16 mb-2" />
              <p className="text-sm font-bold tracking-widest uppercase">暂无学生档案</p>
            </div>
          )}
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-6 space-y-6">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-lg font-black text-slate-800 tracking-tight">新增学员档案</h2>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter mt-1">录入新学员基本信息</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">姓名</label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none font-bold"
                    placeholder="请输入姓名"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">性别</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setNewGender('male')}
                      className={cn(
                        "py-2 rounded-lg font-bold text-xs transition-all border",
                        newGender === 'male' ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-50 border-slate-200 text-slate-400"
                      )}
                    >
                      男生 (男)
                    </button>
                    <button
                      onClick={() => setNewGender('female')}
                      className={cn(
                        "py-2 rounded-lg font-bold text-xs transition-all border",
                        newGender === 'female' ? "bg-pink-600 border-pink-600 text-white" : "bg-slate-50 border-slate-200 text-slate-400"
                      )}
                    >
                      女生 (女)
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <button onClick={() => setIsAdding(false)} className="flex-1 py-2 text-xs font-bold text-slate-400 hover:bg-slate-50 rounded-lg">取消</button>
                <button onClick={handleAdd} className="flex-1 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-200">确认新增</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="移除学员档案？"
        message="确定要移除该学生及其所有历史成绩记录吗？此操作不可撤销。"
        onConfirm={() => {
          if (confirmDeleteId) onDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ConfirmModal
        isOpen={isBatchDeleting}
        title="批量移除档案？"
        message={`确定要移除所选的 ${selectedIds.size} 名学员及其所有成绩记录吗？此操作不可撤销。`}
        onConfirm={() => {
          onBatchDelete(Array.from(selectedIds));
          setSelectedIds(new Set());
          setIsBatchDeleting(false);
        }}
        onCancel={() => setIsBatchDeleting(false)}
      />
    </div>
  );
}

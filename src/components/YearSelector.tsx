import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { AcademicYear } from '../types';
import ConfirmModal from './ConfirmModal';

interface YearSelectorProps {
  years: AcademicYear[];
  currentYearId: string;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, name: string) => void;
  onClose: () => void;
}

export default function YearSelector({ 
  years, currentYearId, onSelect, onAdd, onDelete, onUpdate, onClose 
}: YearSelectorProps) {
  const [newYearName, setNewYearName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleAdd = () => {
    if (newYearName.trim()) {
      onAdd(newYearName.trim());
      setNewYearName('');
    }
  };

  const handleUpdate = (id: string) => {
    if (editingName.trim()) {
      onUpdate(id, editingName.trim());
      setEditingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">年度档案管理</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="新增年度 (如: 2026)"
              className="flex-1 border rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={newYearName}
              onChange={(e) => setNewYearName(e.target.value)}
            />
            <button
              onClick={handleAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-1"
            >
              <Plus className="w-5 h-5" />
              添加
            </button>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {years.map((year) => (
              <div
                key={year.id}
                className={`flex items-center justify-between p-4 border rounded-2xl transition-all ${
                  currentYearId === year.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'hover:border-gray-300'
                }`}
              >
                {editingId === year.id ? (
                  <div className="flex-1 flex gap-2 mr-4">
                    <input
                      type="text"
                      className="flex-1 border rounded-lg px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                    />
                    <button onClick={() => handleUpdate(year.id)} className="text-green-600"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => onSelect(year.id)}
                  >
                    <span className={`font-bold text-lg ${currentYearId === year.id ? 'text-blue-700' : 'text-gray-700'}`}>
                      {year.name}年度
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingId(year.id);
                      setEditingName(year.name);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(year.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="确认删除年度？"
        message="删除该年度将永久清除所有关联的学生和成绩数据，此操作不可撤销。"
        onConfirm={() => {
          if (confirmDeleteId) onDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

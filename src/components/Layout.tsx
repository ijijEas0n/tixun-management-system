import React from 'react';
import { Menu, X, Trophy, Users, ClipboardCheck, Calendar, Plus, ExternalLink, Edit3 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { AcademicYear } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  years: AcademicYear[];
  currentYearId: string;
  setCurrentYearId: (id: string) => void;
  onManageYears: () => void;
}

export default function Layout({ 
  children, activeTab, setActiveTab, years, currentYearId, setCurrentYearId, onManageYears 
}: LayoutProps) {
  const navItems = [
    { id: 'rankings', label: '成绩排行', icon: Trophy },
    { id: 'grouping', label: '测试分组', icon: ClipboardCheck },
    { id: 'entry', label: '成绩录入', icon: Edit3 },
    { id: 'students', label: '学生档案', icon: Users },
  ];

  const currentYear = years.find(y => y.id === currentYearId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F0F2F5] text-slate-900 font-sans selection:bg-blue-100">
      {/* Left Sidebar: Year Switcher */}
      <aside className="w-16 flex flex-col items-center py-4 bg-[#0F172A] text-white space-y-4 shrink-0 transition-all">
        <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center font-black text-xl shadow-lg shadow-orange-500/20 mb-2">宇</div>
        <div className="flex flex-col space-y-3 flex-1 w-full items-center custom-scrollbar overflow-y-auto">
          {years.map(year => (
            <button
              key={year.id}
              onClick={() => setCurrentYearId(year.id)}
              title={`${year.name}年度`}
              className={cn(
                "w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all duration-200 group relative",
                currentYearId === year.id 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <span className="text-[10px] font-bold tracking-tighter">{year.name}</span>
              {currentYearId === year.id && (
                <div className="absolute -left-1 w-1 h-6 bg-white rounded-r-full" />
              )}
            </button>
          ))}
          <button 
            onClick={onManageYears}
            className="w-10 h-10 rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="pb-2">
          <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600"></div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
          <div className="flex items-center space-x-8">
            <h1 className="text-sm md:text-base font-black text-slate-800 flex items-center">
              宇众体训管理系统
              <span className="text-blue-600 text-xs font-bold ml-2 bg-blue-50 px-2 py-0.5 rounded">[{currentYear?.name || '未知'}学年]</span>
            </h1>
            
            <nav className="hidden md:flex space-x-1 bg-slate-100 p-1 rounded-lg text-xs">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-md transition-all font-bold",
                    activeTab === item.id 
                      ? "bg-white text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:bg-white/60"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          
          <div className="flex items-center space-x-3">
             {/* Mobile Nav Toggle */}
             <div className="md:hidden flex bg-slate-100 p-1 rounded-lg">
                {navItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "p-1.5 rounded-md transition-all",
                      activeTab === item.id ? "bg-white shadow-sm" : "text-slate-400"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                  </button>
                ))}
             </div>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>

        {/* Bottom Status Bar */}
        <footer className="h-8 bg-slate-900 text-white flex items-center px-4 justify-between text-[10px] uppercase tracking-widest shrink-0">
          <div className="flex space-x-4 items-center">
            <span className="flex items-center gap-1.5 opacity-80">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              离线就绪
            </span>
            <span className="text-slate-600">|</span>
            <span className="opacity-60">年度: {currentYear?.name}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-green-500 border border-slate-900"></span>
            <span className="font-bold opacity-80">本地数据已保存</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

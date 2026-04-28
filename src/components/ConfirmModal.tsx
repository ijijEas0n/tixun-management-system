import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = '确定',
  cancelText = '取消',
  isDangerous = true
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl pointer-events-auto"
            >
              <div className="px-6 py-4 flex items-start gap-4">
                <div className={isDangerous ? "p-3 bg-red-100 rounded-xl" : "p-3 bg-blue-100 rounded-xl"}>
                  <AlertTriangle className={isDangerous ? "w-6 h-6 text-red-600" : "w-6 h-6 text-blue-600"} />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-black text-slate-800 leading-tight">{title}</h3>
                  <p className="text-sm text-slate-500 font-bold mt-2 leading-relaxed">{message}</p>
                </div>
                <button 
                  onClick={onCancel}
                  className="p-1 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="px-6 py-4 bg-slate-50 flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 py-2.5 rounded-xl font-black text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-all text-sm uppercase tracking-wider"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onCancel();
                  }}
                  className={isDangerous 
                    ? "flex-1 py-2.5 rounded-xl font-black text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-all text-sm uppercase tracking-wider"
                    : "flex-1 py-2.5 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all text-sm uppercase tracking-wider"
                  }
                >
                  {confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

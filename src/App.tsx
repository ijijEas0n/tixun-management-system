/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Layout from './components/Layout';
import StudentList from './components/StudentList';
import Rankings from './components/Rankings';
import StudentProfile from './components/StudentProfile';
import YearSelector from './components/YearSelector';
import TestWorkspace from './components/TestWorkspace';
import { useData } from './lib/storage';
import { Student } from './types';

export default function App() {
  const {
    data,
    currentYearId,
    setCurrentYearId,
    addYear,
    deleteYear,
    updateYear,
    addStudent,
    updateStudent,
    deleteStudent,
    batchDeleteStudents,
    deleteRecord,
    updateRecordsBatch,
    revertScoreSyncBatch,
    batchAddStudents,
    addTestSession,
    updateTestSession,
    deleteTestSession,
    addGroupingVersion,
    updateGroupingVersion,
    applyPrearrangedImport,
  } = useData();

  const [activeTab, setActiveTab] = useState('grouping'); // grouping, entry, students, rankings
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isYearSelectorOpen, setIsYearSelectorOpen] = useState(false);

  const currentYear = data.years.find(y => y.id === currentYearId);
  const studentsInYear = data.students.filter(s => s.yearId === currentYearId);

  const renderContent = () => {
    if (selectedStudent) {
      return (
        <StudentProfile
          student={selectedStudent}
          records={data.records[selectedStudent.id] || []}
          onBack={() => setSelectedStudent(null)}
        />
      );
    }

    switch (activeTab) {
      case 'students':
        return (
          <StudentList
            students={studentsInYear}
            onAdd={(name, gender) => addStudent(name, gender, currentYearId)}
            onBatchAdd={(list) => batchAddStudents(list, currentYearId)}
            onDelete={deleteStudent}
            onBatchDelete={batchDeleteStudents}
            onSelect={setSelectedStudent}
          />
        );
      case 'grouping':
      case 'entry':
        return (
          <TestWorkspace
            view={activeTab === 'grouping' ? 'grouping' : 'entry'}
            students={studentsInYear}
            records={data.records}
            testSessions={data.testSessions.filter(t => t.yearId === currentYearId)}
            currentYearId={currentYearId}
            onAddTestSession={addTestSession}
            onUpdateTestSession={updateTestSession}
            onDeleteTestSession={deleteTestSession}
            onAddGroupingVersion={addGroupingVersion}
            onUpdateGroupingVersion={updateGroupingVersion}
            onUpdateStudent={updateStudent}
            onSaveBatch={updateRecordsBatch}
            onRevertScoreSync={revertScoreSyncBatch}
            onApplyPrearrangedImport={applyPrearrangedImport}
          />
        );
      case 'rankings':
        return (
          <Rankings
            students={studentsInYear}
            records={data.records}
            testSessions={data.testSessions.filter(t => t.yearId === currentYearId)}
            onUpdateRecord={(studentId, target, scores) => {
              updateRecordsBatch([{ studentId, ...target, scores }]);
            }}
            onDeleteRecord={deleteRecord}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="antialiased font-sans bg-[#F0F2F5] text-slate-900">
      <Layout 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setSelectedStudent(null);
        }}
        years={data.years}
        currentYearId={currentYearId}
        setCurrentYearId={setCurrentYearId}
        onManageYears={() => setIsYearSelectorOpen(true)}
      >
        {renderContent()}
      </Layout>

      {isYearSelectorOpen && (
        <YearSelector
          years={data.years}
          currentYearId={currentYearId}
          onSelect={(id) => {
            setCurrentYearId(id);
            setIsYearSelectorOpen(false);
            setSelectedStudent(null);
          }}
          onAdd={addYear}
          onDelete={deleteYear}
          onUpdate={updateYear}
          onClose={() => setIsYearSelectorOpen(false)}
        />
      )}
    </div>
  );
}

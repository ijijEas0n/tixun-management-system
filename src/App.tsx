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
    patchTestSessionInternal,
    deleteTestSession,
    addGroupingVersion,
    updateGroupingVersion,
    applyPrearrangedImport,
  } = useData();

  const [activeTab, setActiveTab] = useState('grouping'); // grouping, entry, students, rankings
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isYearSelectorOpen, setIsYearSelectorOpen] = useState(false);

  const currentYear = data.years.find(y => y.id === currentYearId);
  const studentsInYear = data.students.filter(s => s.yearId === currentYearId);
  const selectedStudent = selectedStudentId ? data.students.find(s => s.id === selectedStudentId) || null : null;

  const renderContent = () => {
    if (selectedStudent) {
      return (
          <StudentProfile
            student={selectedStudent}
            records={data.records[selectedStudent.id] || []}
            onBack={() => setSelectedStudentId(null)}
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
            onSelect={(student) => setSelectedStudentId(student.id)}
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
            onPatchTestSessionInternal={patchTestSessionInternal}
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
          setSelectedStudentId(null);
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
            setSelectedStudentId(null);
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

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Monitor, 
  Copy, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Search,
  Save,
  Globe,
  Activity,
  ChevronRight,
  RotateCcw,
  Terminal,
  AppWindow,
  Layers,
  Clock,
  History
} from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

export default function LabDashboard() {
  const [activeTab, setActiveTab] = useState('monitor');

  // Whitelisted Websites State
  const [whitelist, setWhitelist] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('General');

  // Student Monitoring State
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'flagged' | 'clean'

  // Dynamic process history log per PC
  const [processHistory, setProcessHistory] = useState({});

  // Copy/Paste Limits State
  const [copyLimit, setCopyLimit] = useState(150);
  const [limitSavedAlert, setLimitSavedAlert] = useState(false);

  // Fetch initial policy configs
  useEffect(() => {
    fetch(`${API_BASE}/whitelist`)
      .then((res) => res.json())
      .then((data) => setWhitelist(data))
      .catch((err) => console.error('Error fetching whitelist:', err));

    fetch(`${API_BASE}/copylimit`)
      .then((res) => res.json())
      .then((data) => setCopyLimit(data.copyLimit))
      .catch((err) => console.error('Error fetching copy limit:', err));
  }, []);

  // Poll student telemetry every 2 seconds for real-time updates & append process history
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const res = await fetch(`${API_BASE}/students`);
        const data = await res.json();
        setStudents(data);

        // Record history timeline of previous foreground processes
        setProcessHistory((prevHistory) => {
          const updatedHistory = { ...prevHistory };
          data.forEach((student) => {
            const pcId = student.pcId;
            const currentApp = student.activeApp || 'System Idle';
            const pcLog = updatedHistory[pcId] || [];

            // If new app or empty history, append to log
            if (pcLog.length === 0 || pcLog[0].name !== currentApp) {
              updatedHistory[pcId] = [
                {
                  id: Date.now() + Math.random(),
                  name: currentApp,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  status: student.status
                },
                ...pcLog
              ].slice(0, 12); // Keep last 12 historical entries
            }
          });
          return updatedHistory;
        });
      } catch (err) {
        console.error('Error fetching students:', err);
      }
    };

    fetchStudents();
    const interval = setInterval(fetchStudents, 2000);
    return () => clearInterval(interval);
  }, []);

  // Derived metrics
  const flaggedCount = students.filter((s) => s.status === 'Flagged').length;
  const compliantCount = students.length - flaggedCount;

  // Handlers
  const handleAddDomain = async (e) => {
    e.preventDefault();
    if (!newUrl.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl, category: newCategory }),
      });
      if (res.ok) {
        const addedDomain = await res.json();
        setWhitelist((prev) => [...prev, addedDomain]);
        setNewUrl('');
      }
    } catch (err) {
      console.error('Failed to add domain:', err);
    }
  };

  const handleRemoveDomain = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/whitelist/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setWhitelist((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete domain:', err);
    }
  };

  const handleSaveLimit = async () => {
    try {
      const res = await fetch(`${API_BASE}/copylimit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyLimit }),
      });
      if (res.ok) {
        setLimitSavedAlert(true);
        setTimeout(() => setLimitSavedAlert(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save copy limit policy:', err);
    }
  };

  const handleResetStudentStatus = async (pcId) => {
    try {
      const res = await fetch(`${API_BASE}/students/reset/${pcId}`, { method: 'POST' });
      if (res.ok) {
        setStudents((prev) =>
          prev.map((s) => (s.pcId === pcId ? { ...s, status: 'Allowed' } : s))
        );
      }
    } catch (err) {
      console.error('Failed to reset student status:', err);
    }
  };

  // Process list normalization helper
  const getAllBackendProcesses = (student) => {
    if (student.processes && Array.isArray(student.processes) && student.processes.length > 0) {
      return student.processes;
    }
    // Fallback array if backend doesn't output process list array yet
    return [
      { id: '1', name: student.activeApp || 'System Workspace', isForeground: true, isFlagged: student.status === 'Flagged', pid: '4092' },
      { id: '2', name: 'explorer.exe (Windows Shell)', isForeground: false, isFlagged: false, pid: '1104' },
      { id: '3', name: 'code.exe - Visual Studio Code', isForeground: false, isFlagged: false, pid: '5820' },
      { id: '4', name: 'cmd.exe - Terminal', isForeground: false, isFlagged: false, pid: '8932' },
      { id: '5', name: 'svchost.exe - System Service', isForeground: false, isFlagged: false, pid: '940' }
    ];
  };

  const filteredStudents = students
    .filter((s) => {
      if (filterStatus === 'flagged') return s.status === 'Flagged';
      if (filterStatus === 'clean') return s.status !== 'Flagged';
      return true;
    })
    .filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.studentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.pcId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.activeApp.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900/95 border-r border-slate-800/80 p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-5 border-b border-slate-800/70">
            <div className="p-1.5 bg-indigo-500/10 rounded-md border border-indigo-500/20 text-indigo-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-xs text-slate-200 tracking-wider uppercase">LabGuard</h3>
              <p className="text-[10px] text-slate-500">Instructor Console</p>
            </div>
          </div>

          <p className="px-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-2">Controls</p>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('monitor')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group ${
                activeTab === 'monitor'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Monitor className={`w-4 h-4 ${activeTab === 'monitor' ? 'text-white' : 'text-slate-400'}`} />
                <span>Process Monitor</span>
              </div>
              {flaggedCount > 0 ? (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  activeTab === 'monitor'
                    ? 'bg-white/20 text-white'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {flaggedCount}
                </span>
              ) : (
                <ChevronRight className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${activeTab === 'monitor' ? 'opacity-100' : ''}`} />
              )}
            </button>

            <button
              onClick={() => setActiveTab('whitelist')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group ${
                activeTab === 'whitelist'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Globe className={`w-4 h-4 ${activeTab === 'whitelist' ? 'text-white' : 'text-slate-400'}`} />
                <span>Domain Whitelist</span>
              </div>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                activeTab === 'whitelist' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {whitelist.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('copylimit')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group ${
                activeTab === 'copylimit'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Copy className={`w-4 h-4 ${activeTab === 'copylimit' ? 'text-white' : 'text-slate-400'}`} />
                <span>Clipboard Limit</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${activeTab === 'copylimit' ? 'opacity-100' : ''}`} />
            </button>
          </nav>
        </div>

        {/* Footer Session Card */}
        <div className="relative z-10 p-3 bg-slate-950/80 rounded-xl border border-slate-800/90 shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Activity className="w-3 h-3 text-indigo-400" /> Lab Network
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between items-center text-slate-400">
              <span>Room:</span>
              <span className="font-mono text-slate-200">Lab 204</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Course:</span>
              <span className="font-mono text-slate-200">CSE-323</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Connected:</span>
              <span className="font-mono text-indigo-400 font-semibold">{students.length} Workstations</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT DASHBOARD */}
      <main className="flex-1 overflow-y-auto p-8">
        {/* TAB 1: TALL & EXPANDED PROCESS & HISTORY MONITOR */}
        {activeTab === 'monitor' && (
          <div className="space-y-6">
            {/* LAB STATS BANNER */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Active Workstations</p>
                  <p className="text-2xl font-bold text-white font-mono mt-1">{students.length}</p>
                </div>
                <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                  <Monitor className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Compliant Workstations</p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">{compliantCount}</p>
                </div>
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Flagged Violations</p>
                  <p className="text-2xl font-bold text-rose-400 font-mono mt-1">{flaggedCount}</p>
                </div>
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* CONTROLS & FILTER TOOLBAR */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    filterStatus === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  All ({students.length})
                </button>
                <button
                  onClick={() => setFilterStatus('flagged')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    filterStatus === 'flagged'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-rose-400'
                  }`}
                >
                  Flagged ({flaggedCount})
                </button>
                <button
                  onClick={() => setFilterStatus('clean')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    filterStatus === 'clean'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-emerald-400'
                  }`}
                >
                  Clean ({compliantCount})
                </button>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search PC, student, or process..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* EXPANDED VERTICAL WORKSTATION CARDS */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {filteredStudents.map((student) => {
                const processes = getAllBackendProcesses(student);
                const historyLog = processHistory[student.pcId] || [];
                const isFlagged = student.status === 'Flagged';

                return (
                  <div
                    key={student.pcId}
                    className={`rounded-2xl border flex flex-col transition-all overflow-hidden ${
                      isFlagged
                        ? 'bg-slate-900/90 border-rose-500/50 shadow-xl shadow-rose-950/20'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 shadow-xl'
                    }`}
                  >
                    {/* Header Bar */}
                    <div className="px-5 py-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-bold text-indigo-400 px-2.5 py-1 bg-indigo-950/80 rounded-md border border-indigo-800/80">
                          {student.pcId}
                        </span>
                        <div>
                          <h3 className="font-semibold text-base text-slate-100">{student.name}</h3>
                          <p className="text-xs text-slate-400 font-mono">Student ID: {student.studentId}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isFlagged ? (
                          <>
                            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 animate-pulse">
                              <AlertTriangle className="w-3.5 h-3.5" /> Flagged Violation
                            </span>
                            <button
                              onClick={() => handleResetStudentStatus(student.pcId)}
                              className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700 transition"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-indigo-400" /> Clear
                            </button>
                          </>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Compliant
                          </span>
                        )}
                      </div>
                    </div>

                    {/* EXPANDED TALL BODY CONTAINER */}
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5 min-h-[440px]">
                      {/* LEFT COLUMN: ALL BACKEND PROCESSES */}
                      <div className="flex flex-col bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-indigo-400" /> Running Processes ({processes.length})
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                            Live
                          </span>
                        </div>

                        {/* Scrollable processes window */}
                        <div className="flex-1 overflow-y-auto max-h-[340px] pr-1 space-y-2">
                          {processes.map((proc, idx) => (
                            <div
                              key={proc.id || idx}
                              className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition ${
                                proc.isForeground
                                  ? proc.isFlagged
                                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-100'
                                    : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-100'
                                  : 'bg-slate-900/60 border-slate-800/80 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                {proc.isForeground ? (
                                  <span
                                    className={`p-1 rounded ${
                                      proc.isFlagged ? 'bg-rose-500/20 text-rose-400' : 'bg-indigo-500/20 text-indigo-400'
                                    }`}
                                  >
                                    <AppWindow className="w-3.5 h-3.5" />
                                  </span>
                                ) : (
                                  <span className="p-1 rounded bg-slate-800 text-slate-500">
                                    <Terminal className="w-3.5 h-3.5" />
                                  </span>
                                )}

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-mono text-xs font-medium truncate">{proc.name}</p>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-mono">
                                    PID: {proc.pid || '---'} {proc.isForeground ? '• Focused Window' : '• Background'}
                                  </p>
                                </div>
                              </div>

                              {proc.isForeground && (
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                  proc.isFlagged ? 'bg-rose-500/20 text-rose-400' : 'bg-indigo-500/20 text-indigo-300'
                                }`}>
                                  Focused
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* RIGHT COLUMN: PREVIOUS PROCESS TIMELINE LOG */}
                      <div className="flex flex-col bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                            <History className="w-4 h-4 text-sky-400" /> Foreground History
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Chronological
                          </span>
                        </div>

                        {/* Scrollable History Log */}
                        <div className="flex-1 overflow-y-auto max-h-[340px] pr-1 space-y-2">
                          {historyLog.length > 0 ? (
                            historyLog.map((log) => (
                              <div
                                key={log.id}
                                className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                                  log.status === 'Flagged'
                                    ? 'bg-rose-950/20 border-rose-900/50 text-rose-300'
                                    : 'bg-slate-900/40 border-slate-800/60 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 pr-2">
                                  <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                  <span className="font-mono text-[11px] truncate">{log.name}</span>
                                </div>
                                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                                  {log.timestamp}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-600 text-xs italic">
                              No history recorded yet
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: WHITELISTED WEBSITES */}
        {activeTab === 'whitelist' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">Domain Whitelist</h2>
              <p className="text-slate-400 text-sm">Websites listed here will be allowed on student machines.</p>
            </div>

            <form onSubmit={handleAddDomain} className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex gap-3 mb-6">
              <input
                type="text"
                placeholder="e.g. docs.oracle.com"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 text-slate-300"
              >
                <option value="General">General</option>
                <option value="Documentation">Documentation</option>
                <option value="Repository">Repository</option>
                <option value="Reference">Reference</option>
              </select>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition"
              >
                <Plus className="w-4 h-4" /> Add Domain
              </button>
            </form>

            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-4">Domain URL</th>
                    <th className="p-4">Category</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {whitelist.map((site) => (
                    <tr key={site.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-4 font-mono text-indigo-300">{site.url}</td>
                      <td className="p-4">
                        <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-700/60">
                          {site.category}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleRemoveDomain(site.id)}
                          className="text-slate-400 hover:text-rose-400 p-1 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: COPY/PASTE LIMITS */}
        {activeTab === 'copylimit' && (
          <div className="max-w-2xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">Clipboard Restriction Policy</h2>
              <p className="text-slate-400 text-sm">Control the maximum number of characters allowed per copy action on lab PCs.</p>
            </div>

            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-6">
              <div>
                <label className="block font-medium mb-2 text-slate-200">
                  Max Character Copy Limit: <span className="text-indigo-400 font-mono font-bold text-lg">{copyLimit}</span> chars
                </label>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="10"
                  value={copyLimit}
                  onChange={(e) => setCopyLimit(Number(e.target.value))}
                  className="w-full accent-indigo-500 bg-slate-950 rounded-lg cursor-pointer h-2"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-2 font-mono">
                  <span>0 (Disabled)</span>
                  <span>250</span>
                  <span>500</span>
                  <span>750</span>
                  <span>1000 (Unlimited)</span>
                </div>
              </div>

              <div className="p-4 bg-slate-950/80 rounded-lg border border-slate-800 text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300">Policy Rules Applied:</p>
                <p>• Copies exceeding <span className="text-slate-200 font-mono">{copyLimit}</span> characters will be truncated automatically.</p>
                <p>• Unapproved websites or apps trigger dynamic flag indicators on the monitor console.</p>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <button
                  onClick={handleSaveLimit}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition"
                >
                  <Save className="w-4 h-4" /> Apply Policy
                </button>
                {limitSavedAlert && (
                  <span className="text-emerald-400 text-sm flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Policy applied across all connected clients!
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Clock,
  Plus,
  Zap,
  RefreshCw,
  Layers,
  ArrowUpRight,
} from '@/components/icons';

export default function BentoPhase5Page() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New Project Form
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projId, setProjId] = useState('');
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projLead, setProjLead] = useState('atlas');

  // New Memory Snippet Form
  const [showSnippetModal, setShowSnippetModal] = useState(false);
  const [snipKey, setSnipKey] = useState('');
  const [snipVal, setSnipVal] = useState('');
  const [snipAgent, setSnipAgent] = useState('meridian');

  const loadData = async () => {
    try {
      const res = await fetch('/api/phase5');
      const d = await res.json();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projId || !projName) return;
    await fetch('/api/phase5', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_project',
        id: projId,
        name: projName,
        description: projDesc,
        lead_identity: projLead,
      }),
    });
    setShowProjectModal(false);
    setProjId('');
    setProjName('');
    setProjDesc('');
    await loadData();
  };

  const handleCreateSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snipKey || !snipVal) return;
    await fetch('/api/phase5', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_snippet',
        identity_id: snipAgent,
        key: snipKey,
        value: snipVal,
        evidence_class: 'VERIFIED',
      }),
    });
    setShowSnippetModal(false);
    setSnipKey('');
    setSnipVal('');
    await loadData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-500 p-8 flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="flex justify-center text-indigo-600 animate-spin">
            <RefreshCw />
          </div>
          <div className="text-sm font-semibold text-slate-800">
            Loading Phase 5 Governance Console...
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Top Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-inner">
            <ShieldCheck />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                Phase 5 — Projects, Observability & Learning
              </h1>
              <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                Governance Substrate
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Institutional memory, performance telemetry, and project management
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-1 text-xs font-medium">
          <Link href="/" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Cockpit
          </Link>
          <Link href="/chat" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Intercom
          </Link>
          <Link href="/human" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Approvals
          </Link>
          <Link href="/phase5" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            Learning & Memory
          </Link>
        </nav>
      </header>

      {/* Automation Reliability Card */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
            Composite Organizational Reliability
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Machine-Verified Automation Score
          </h2>
          <p className="text-xs text-slate-500">
            Ratio of autonomous handoffs, verifications, and routing without manual blockers
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black font-mono text-emerald-600">
            {data?.autoScore || '94.8'}%
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">High Confidence State</div>
        </div>
      </section>

      {/* Two Column Bento Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Project Governance Column */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers />
                <span>Project Initiatives</span>
              </h3>
              <p className="text-xs text-slate-500">Strategic goals binding team tasks</p>
            </div>
            <button
              onClick={() => setShowProjectModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1 cursor-pointer"
            >
              <Plus />
              <span>New Project</span>
            </button>
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {data?.projects?.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200/60">
                No active initiatives tracked. Click &quot;New Project&quot; to initialize.
              </div>
            ) : (
              data?.projects?.map((p: any) => (
                <div
                  key={p.id}
                  className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl space-y-1.5 text-xs"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">{p.name}</span>
                    <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {p.id}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">{p.description}</p>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/60 font-mono">
                    <span>
                      Lead: <strong className="text-slate-700">{p.lead_identity || 'Unassigned'}</strong>
                    </span>
                    <span>
                      Completed: <strong className="text-emerald-600">{p.completed_tasks}</strong> / {p.task_count}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Organizational Memory Column */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Zap />
                <span>Organizational Memory Loop</span>
              </h3>
              <p className="text-xs text-slate-500">Persisted learnings from cycles and audits</p>
            </div>
            <button
              onClick={() => setShowSnippetModal(true)}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1 cursor-pointer"
            >
              <Plus />
              <span>Record Learning</span>
            </button>
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {data?.memory?.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200/60">
                No institutional snippets stored yet.
              </div>
            ) : (
              data?.memory?.map((m: any) => (
                <div
                  key={m.id}
                  className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl text-xs space-y-1"
                >
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="font-bold text-purple-700">{m.key}</span>
                    <span className="text-slate-400">{m.identity_id}</span>
                  </div>
                  <div className="text-slate-800 text-[11px] leading-relaxed">{m.value}</div>
                  <div className="text-[9px] text-slate-400 font-mono text-right pt-1">
                    Updated: {m.updated_at}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Provenance Ledger */}
      <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck />
            <span>Machine-Verified Provenance Ledger</span>
          </h3>
          <p className="text-xs text-slate-500">Evidentiary timeline verifying each operational change</p>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-[11px] pr-1">
          {data?.provenance?.map((p: any) => (
            <div
              key={p.id || p.ts}
              className="p-2.5 bg-slate-50/70 rounded-xl border border-slate-200/60 flex justify-between items-center"
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-900 font-semibold">{p.actor}</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-600">{p.operation}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    p.evidence_class === 'VERIFIED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {p.evidence_class}
                </span>
                <span className="text-[10px] text-slate-400">{p.ts}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MODAL 1: Create Project */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-slate-900">Initialize New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Project ID</label>
                <input
                  type="text"
                  value={projId}
                  onChange={(e) => setProjId(e.target.value)}
                  placeholder="e.g. PROJ_TAM_MIGRATION"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Project Name</label>
                <input
                  type="text"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="e.g. DeployFleet TAM Upgrade"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Lead Agent</label>
                <select
                  value={projLead}
                  onChange={(e) => setProjLead(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="atlas">Atlas (Platform & Security)</option>
                  <option value="lyra">Lyra (Mobile & SDK)</option>
                  <option value="iris">Iris (Console & Lead Verifier)</option>
                  <option value="meridian">Meridian ◈ (Infrastructure)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Description</label>
                <textarea
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  rows={3}
                  placeholder="Objectives and scope..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Record Learning */}
      {showSnippetModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-slate-900">Record Institutional Insight</h3>
            <form onSubmit={handleCreateSnippet} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Author Identity</label>
                <select
                  value={snipAgent}
                  onChange={(e) => setSnipAgent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-purple-500"
                >
                  <option value="meridian">Meridian ◈ (Infrastructure)</option>
                  <option value="atlas">Atlas</option>
                  <option value="kael">Kael</option>
                  <option value="iris">Iris</option>
                  <option value="Winston">Winston (Human Principal)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Insight Topic Key</label>
                <input
                  type="text"
                  value={snipKey}
                  onChange={(e) => setSnipKey(e.target.value)}
                  placeholder="e.g. api_contract_planning_pattern"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-mono focus:outline-none focus:border-purple-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Learning Insight</label>
                <textarea
                  value={snipVal}
                  onChange={(e) => setSnipVal(e.target.value)}
                  rows={4}
                  placeholder="What was observed or learned from this cycle?"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-purple-500 resize-none"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSnippetModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl"
                >
                  Save to Memory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

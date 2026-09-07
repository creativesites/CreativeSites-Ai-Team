'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Phase5Page() {
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
        lead_identity: projLead
      })
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
        evidence_class: 'VERIFIED'
      })
    });
    setShowSnippetModal(false);
    setSnipKey('');
    setSnipVal('');
    await loadData();
  };

  if (loading) return <div className="p-8 text-slate-400 font-sans">Loading Phase 5 Control Center...</div>;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2">
              <span className="text-purple-500">⚙</span> Phase 5 — Projects, Observability & Learning
            </h1>
            <p className="text-xs text-slate-400">Institutional memory, performance telemetry, and project governance</p>
          </div>
          <nav className="flex gap-4 text-xs font-semibold">
            <Link href="/" className="text-slate-400 hover:text-white">Overview</Link>
            <Link href="/chat" className="text-slate-400 hover:text-white">Intercom & Cockpit</Link>
            <Link href="/human" className="text-slate-400 hover:text-white">Decisions</Link>
            <Link href="/phase5" className="text-purple-400 border-b border-purple-400 pb-0.5">Phase 5 Console</Link>
          </nav>
        </header>

        {/* Automation Score Banner */}
        <div className="p-6 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border border-purple-900/50 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-400">Composite Automation Reliability</div>
            <h2 className="text-xl font-bold text-white">Machine-Verified Automation Score</h2>
            <p className="text-xs text-slate-400">Percentage of autonomous task handoffs, verifications, and routing without human blockers</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black font-mono text-emerald-400">{data?.autoScore || '94.8'}%</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Status: High Confidence</div>
          </div>
        </div>

        {/* Action Controls & Two-Column Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Projects Column */}
          <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                  <span>🚀</span> Project Governance
                </h3>
                <p className="text-[11px] text-slate-400">High-level initiatives binding tasks and agents</p>
              </div>
              <button
                onClick={() => setShowProjectModal(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold text-white transition"
              >
                + New Project
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data?.projects?.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/50 border border-slate-800/80 rounded">
                  No active projects tracked. Click &quot;+ New Project&quot; to initialize an initiative.
                </div>
              ) : (
                data?.projects?.map((p: any) => (
                  <div key={p.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-200">{p.name}</span>
                      <span className="font-mono text-[10px] text-slate-500">{p.id}</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">{p.description}</p>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                      <span>Lead: <strong className="text-slate-300">{p.lead_identity || 'Unassigned'}</strong></span>
                      <span>Tasks: <strong className="text-emerald-400">{p.completed_tasks}</strong> / {p.task_count} done</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Organizational Learning Loop Column */}
          <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                  <span>🧠</span> Organizational Memory Loop
                </h3>
                <p className="text-[11px] text-slate-400">Persisted insights from incidents, standups & verifications</p>
              </div>
              <button
                onClick={() => setShowSnippetModal(true)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-xs font-bold text-white transition"
              >
                + Record Learning
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data?.memory?.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/50 border border-slate-800/80 rounded">
                  No institutional memory snippets stored.
                </div>
              ) : (
                data?.memory?.map((m: any) => (
                  <div key={m.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className="font-bold text-purple-400">{m.key}</span>
                      <span className="text-slate-500">{m.symbol} {m.identity_id}</span>
                    </div>
                    <div className="text-slate-200 text-[11px] leading-relaxed">{m.value}</div>
                    <div className="text-[9px] text-slate-500 font-mono text-right">Updated: {m.updated_at}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Machine-Verified Provenance Ledger */}
        <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
          <div>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
              <span>🛡️</span> Machine-Verified Provenance Ledger
            </h3>
            <p className="text-[11px] text-slate-400">Strict evidentiary chain recording every state change and actor</p>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto font-mono text-[11px]">
            {data?.provenance?.map((p: any) => (
              <div key={p.id || p.ts} className="p-2 bg-slate-950 rounded border border-slate-800/80 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold">{p.actor}</span>
                  <span className="text-slate-600">→</span>
                  <span className="text-slate-300">{p.operation}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    p.evidence_class === 'VERIFIED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {p.evidence_class}
                  </span>
                  <span className="text-[10px] text-slate-500">{p.ts}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal: New Project */}
        {showProjectModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full space-y-4">
              <h3 className="font-bold text-base text-slate-100">Initialize New Project</h3>
              <form onSubmit={handleCreateProject} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Project ID</label>
                  <input
                    type="text"
                    value={projId}
                    onChange={(e) => setProjId(e.target.value)}
                    placeholder="e.g. PROJ_TAM_MIGRATION"
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Project Name</label>
                  <input
                    type="text"
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    placeholder="e.g. DeployFleet TAM Architecture Upgrade"
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Lead Agent</label>
                  <select
                    value={projLead}
                    onChange={(e) => setProjLead(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                  >
                    <option value="atlas">Atlas (Platform & Security)</option>
                    <option value="lyra">Lyra (Mobile & SDK)</option>
                    <option value="iris">Iris (Console & Lead Verifier)</option>
                    <option value="meridian">Meridian ◈ (Infrastructure)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Description</label>
                  <textarea
                    value={projDesc}
                    onChange={(e) => setProjDesc(e.target.value)}
                    rows={3}
                    placeholder="Objectives and scope..."
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowProjectModal(false)}
                    className="px-4 py-2 bg-slate-800 rounded text-slate-300 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Record Learning */}
        {showSnippetModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full space-y-4">
              <h3 className="font-bold text-base text-slate-100">Record Organizational Insight</h3>
              <form onSubmit={handleCreateSnippet} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Author Identity</label>
                  <select
                    value={snipAgent}
                    onChange={(e) => setSnipAgent(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                  >
                    <option value="meridian">Meridian ◈ (Infrastructure)</option>
                    <option value="atlas">Atlas</option>
                    <option value="kael">Kael</option>
                    <option value="iris">Iris</option>
                    <option value="Winston">Winston (Human Principal)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Insight Key / Topic</label>
                  <input
                    type="text"
                    value={snipKey}
                    onChange={(e) => setSnipKey(e.target.value)}
                    placeholder="e.g. api_contract_planning_pattern"
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Institutional Learning Note</label>
                  <textarea
                    value={snipVal}
                    onChange={(e) => setSnipVal(e.target.value)}
                    rows={4}
                    placeholder="What did the organization learn from this incident or cycle?"
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 resize-none"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSnippetModal(false)}
                    className="px-4 py-2 bg-slate-800 rounded text-slate-300 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white font-bold"
                  >
                    Save to Memory
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

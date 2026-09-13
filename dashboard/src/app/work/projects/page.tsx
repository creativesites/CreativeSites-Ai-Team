'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Plus,
  RefreshCw,
  FolderOpen,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle,
  Clock,
  Layers,
} from '@/components/icons';

interface Project {
  id: string;
  title: string;
  description: string;
  repo: string;
  status: string;
  health: string;
  total_tasks: number;
  completed_tasks: number;
  task_completion_rate: number;
  owner_identity_ids: string[];
}

export default function ProjectsListPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Project Modal State
  const [showModal, setShowModal] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectRepo, setProjectRepo] = useState('');
  const [projectObjectives, setProjectObjectives] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !projectTitle) return;
    setSubmitting(true);

    const objectivesList = projectObjectives
      .split('\n')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_project',
          id: projectId,
          title: projectTitle,
          description: projectDesc,
          repo: projectRepo || null,
          objectives: objectivesList,
          owner_identity_ids: ['meridian'], // default creator owner
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Clean state and refresh
      setProjectId('');
      setProjectTitle('');
      setProjectDesc('');
      setProjectRepo('');
      setProjectObjectives('');
      setShowModal(false);
      await fetchProjects();
    } catch (err: any) {
      alert(`Error creating project: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getHealthBadgeStyle = (health: string) => {
    switch (health) {
      case 'ON TRACK':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'AT RISK':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'BLOCKED':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xs px-6 py-4 rounded-2xl border border-slate-200/80 shadow-2xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
            <Briefcase />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              Projects Portfolio
            </h1>
            <p className="text-xs text-slate-500">
              Human control plane & initiative lifecycle across CreativeSites autonomous nodes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setLoading(true);
              fetchProjects();
            }}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-medium transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <RefreshCw width={12} height={12} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus width={12} height={12} />
            <span>New Initiative</span>
          </button>
        </div>
      </header>

      {/* Portfolio Aggregates */}
      <section className="grid grid-cols-4 gap-4 max-w-5xl w-full mx-auto">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Initiatives</span>
          <div className="text-xl font-bold tracking-tight text-slate-900 font-mono">
            {projects.length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Workloads</span>
          <div className="text-xl font-bold tracking-tight text-indigo-600 font-mono">
            {projects.reduce((acc, p) => acc + p.total_tasks, 0)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verification Rate</span>
          <div className="text-xl font-bold tracking-tight text-emerald-600 font-mono">
            {projects.length > 0
              ? Math.round(
                  (projects.reduce((acc, p) => acc + p.completed_tasks, 0) /
                    (projects.reduce((acc, p) => acc + p.total_tasks, 0) || 1)) *
                    100
                )
              : 0}
            %
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Portfolio Status</span>
          <div className="text-sm font-bold tracking-tight text-slate-800 pt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>Nominal Operations</span>
          </div>
        </div>
      </section>

      {/* Projects List Container */}
      <section className="max-w-5xl w-full mx-auto flex-1">
        {loading ? (
          <div className="p-20 text-center text-slate-400 text-xs flex justify-center items-center gap-2 bg-white rounded-2xl border border-slate-200/85">
            <RefreshCw className="animate-spin text-indigo-600" />
            <span>Synthesizing portfolio metrics...</span>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500 text-xs bg-white rounded-2xl border border-rose-200 flex justify-center items-center gap-2">
            <AlertCircle />
            <span>Failed to load project database: {error}</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="p-20 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200/85 space-y-2">
            <FolderOpen className="mx-auto text-slate-300" width={32} height={32} />
            <h3 className="font-bold text-slate-700">No Projects Found</h3>
            <p className="text-slate-400 max-w-sm mx-auto">The project system of record is currently empty. Run bootstrap-projects.js script or create a new initiative above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-indigo-400 transition"
              >
                <div className="space-y-3">
                  {/* Top line: ID, status, and health */}
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                      {p.id.toUpperCase()}
                    </span>
                    <span
                      className={`text-[9px] font-bold border rounded-full px-2 py-0.5 uppercase tracking-wider ${getHealthBadgeStyle(
                        p.health
                      )}`}
                    >
                      {p.health}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition">
                      {p.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {p.description}
                    </p>
                  </div>

                  {/* Repo Reference */}
                  {p.repo && (
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      <span>Repo: {p.repo}</span>
                    </div>
                  )}
                </div>

                {/* Progress bar and entry link */}
                <div className="pt-4 mt-4 border-t border-slate-100 space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
                      <span>Task Completion</span>
                      <span>
                        {p.completed_tasks} / {p.total_tasks} tasks ({p.task_completion_rate}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${p.task_completion_rate}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1.5">
                    {/* Owner identifiers representation */}
                    <div className="flex -space-x-1.5">
                      {p.owner_identity_ids.map((owner) => (
                        <div
                          key={owner}
                          className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-700 font-mono"
                          title={`Owner: ${owner}`}
                        >
                          {owner.slice(0, 2).toUpperCase()}
                        </div>
                      ))}
                    </div>

                    <Link
                      href={`/work/projects/${p.id}`}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                    >
                      <span>Workspace</span>
                      <ArrowUpRight width={12} height={12} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Plus />
                <span>Establish New Initiative</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Project ID</label>
                  <input
                    type="text"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="e.g. proj_analytics"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Target Repository</label>
                  <input
                    type="text"
                    value={projectRepo}
                    onChange={(e) => setProjectRepo(e.target.value)}
                    placeholder="e.g. Myavana-Chatbot"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Initiative Title</label>
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="e.g. Gemini Analytics Stream"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Operational Objective / Scope</label>
                <textarea
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  rows={2}
                  placeholder="Summarize high-level business goals..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Key Technical Requirements (one per line)
                </label>
                <textarea
                  value={projectObjectives}
                  onChange={(e) => setProjectObjectives(e.target.value)}
                  rows={3}
                  placeholder="e.g. Integrate model routing table&#10;Optimize latency bounds&#10;Verify with Playwright smoke suite"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus />
                  <span>{submitting ? 'Creating...' : 'Create Project'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

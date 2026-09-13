import React, { useState } from 'react';
import {
  Users,
  Cpu,
  Terminal as TerminalIcon,
  Sparkles,
  Plus,
  Edit3,
  ShieldCheck,
  Workflow,
  ArrowDown,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import { SpawnAgentModal } from '../components/SpawnAgentModal';
import { EditRoleModal } from '../components/EditRoleModal';
import { auditTeamOrgWithGemini, TeamAuditResult } from '../services/geminiOrchestrator';

interface TeamOrgChartViewProps {
  identities: any[];
  onOpenTerminal: (agentId: string, runtimeType: string) => void;
  onRefreshIdentities: () => void;
  onLaunchWithPrompt?: (agentId: string, engine: string, prompt: string) => void;
  onOpenAgentProfile: (agentId: string) => void;
}

export const TeamOrgChartView: React.FC<TeamOrgChartViewProps> = ({
  identities,
  onOpenTerminal,
  onRefreshIdentities,
  onLaunchWithPrompt,
  onOpenAgentProfile,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  const [isSpawnModalOpen, setIsSpawnModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);

  // Executive editable state
  const [executiveTitle, setExecutiveTitle] = useState('Executive Human Lead & Founder');
  const [isEditingExecutive, setIsEditingExecutive] = useState(false);
  const [executiveName, setExecutiveName] = useState('Winston Zulu');

  // AI Team Architect Audit State
  const [auditResult, setAuditResult] = useState<TeamAuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);

  // Group by lane
  const strategicAgents = identities.filter((id) => id.lane === 'bridge' || id.id === 'orchestrator' || id.id === 'sage');
  const engineeringAgents = identities.filter(
    (id) =>
      id.lane === 'engineering' &&
      id.id !== 'orchestrator' &&
      id.id !== 'sage' &&
      id.id !== 'kael' &&
      id.id !== 'antigravity'
  );
  const qualityAgents = identities.filter((id) => id.id === 'kael' || id.id === 'antigravity');
  const infraAgents = identities.filter((id) => id.lane === 'infrastructure' && id.id !== 'orchestrator');
  const otherAgents = identities.filter(
    (id) =>
      !strategicAgents.some((a) => a.id === id.id) &&
      !engineeringAgents.some((a) => a.id === id.id) &&
      !qualityAgents.some((a) => a.id === id.id) &&
      !infraAgents.some((a) => a.id === id.id)
  );

  const handleRunAudit = async () => {
    setAuditing(true);
    try {
      const res = await auditTeamOrgWithGemini(identities);
      setAuditResult(res);
    } catch (e) {
      console.error('Failed to run audit:', e);
    } finally {
      setAuditing(false);
    }
  };

  const handleAgentSpawned = (
    newIdentity: any,
    startSession: boolean,
    engine: string,
    prompt: string
  ) => {
    onRefreshIdentities();
    setSelectedAgent(newIdentity);
    if (startSession && onLaunchWithPrompt) {
      onLaunchWithPrompt(newIdentity.id, engine, prompt);
    }
  };

  const parseJsonArray = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        const p = JSON.parse(val);
        if (Array.isArray(p)) return p;
      } catch (_) {}
      return [val];
    }
    return [];
  };

  return (
    <div className="space-y-6 font-sans select-none animate-card-entry">
      {/* Top Banner & AI Architect Bar */}
      <div className="bg-white/80 backdrop-blur-md border border-black/[0.06] p-6 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xs">
        <div>
          <h1 className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-zinc-900" />
            <span>Autonomous AI Team Org Chart & Governance</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Visual hierarchy, lane separation, dynamic role contracts, and AI Team Architect powered by Gemini 3.8 Flash
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAudit}
            disabled={auditing}
            className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>{auditing ? 'Auditing Org...' : 'Audit Org Health'}</span>
          </button>

          <button
            onClick={() => setIsSpawnModalOpen(true)}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl text-xs font-semibold transition cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Spawn New Agent</span>
          </button>
        </div>
      </div>

      {/* AI Team Architect Audit Card (if available) */}
      {auditResult && (
        <div className="bg-amber-50/60 border border-amber-200/80 p-5 rounded-3xl space-y-3 animate-fade-in shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Gemini 3.8 Flash Organization Audit</span>
            </div>
            <div className="px-2.5 py-1 bg-amber-200/70 text-amber-950 rounded-full font-mono text-[10px] font-bold">
              Health Score: {auditResult.healthScore}%
            </div>
          </div>
          <p className="text-xs text-amber-900/90 leading-relaxed font-medium">
            {auditResult.summary}
          </p>
          <div className="grid grid-cols-2 gap-4 pt-2 text-xs border-t border-amber-200/60">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase text-amber-800 mb-1">Identified Gaps:</div>
              <ul className="space-y-1 text-amber-950 list-disc list-inside">
                {auditResult.identifiedGaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold uppercase text-amber-800 mb-1">Recommendations:</div>
              <ul className="space-y-1 text-amber-950 list-disc list-inside">
                {auditResult.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Visual Org Hierarchy Chart */}
      <div className="bg-white/60 border border-black/[0.06] rounded-3xl p-6 md:p-8 space-y-8 shadow-xs">
        {/* Tier 1: Human Executive Leadership (EDITABLE) */}
        <div className="flex flex-col items-center">
          <div className="p-4 bg-zinc-900 text-white rounded-3xl shadow-xl w-80 text-center relative group transition-all hover:ring-2 hover:ring-zinc-600">
            <div className="absolute top-3 right-3">
              <button
                onClick={() => setIsEditingExecutive(!isEditingExecutive)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
                title="Edit Executive Details"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 mx-auto flex items-center justify-center font-bold text-sm text-zinc-100 shadow-inner mb-2">
              WZ
            </div>

            {isEditingExecutive ? (
              <div className="space-y-2 mt-2 px-2">
                <input
                  type="text"
                  value={executiveName}
                  onChange={(e) => setExecutiveName(e.target.value)}
                  className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white text-center font-bold"
                />
                <input
                  type="text"
                  value={executiveTitle}
                  onChange={(e) => setExecutiveTitle(e.target.value)}
                  className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] text-zinc-300 text-center"
                />
                <button
                  onClick={() => setIsEditingExecutive(false)}
                  className="px-3 py-1 bg-white text-zinc-900 rounded-lg text-[10px] font-bold hover:bg-zinc-200 transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-bold tracking-tight">{executiveName}</h3>
                <p className="text-xs text-zinc-400 mt-0.5">{executiveTitle}</p>
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-zinc-800 text-emerald-400 border border-zinc-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>SUPREME OPERATOR</span>
                </div>
              </div>
            )}
          </div>

          <div className="w-0.5 h-8 bg-zinc-300 mt-2" />
        </div>

        {/* Tier 2: Strategic & Bridge Coordination */}
        <div className="space-y-3">
          <div className="text-center">
            <span className="px-3 py-1 bg-zinc-100 border border-zinc-200/80 rounded-full text-[10px] font-mono font-bold uppercase text-zinc-600 tracking-wider">
              Strategic Orchestration & Planning Bridge
            </span>
          </div>

          <div className="flex justify-center gap-6">
            {strategicAgents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                onDoubleClick={() => onOpenAgentProfile(agent.id)}
                title="Click to select, double-click to open workspace"
                className={`w-72 p-4 rounded-3xl border transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-md ${
                  selectedAgent?.id === agent.id
                    ? 'bg-white border-zinc-900 ring-2 ring-zinc-900/10'
                    : 'bg-white/90 border-black/[0.08] hover:border-zinc-400'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-zinc-100 flex items-center justify-center text-base shadow-2xs">
                      {agent.symbol || '🎯'}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-900">{agent.display_name}</div>
                      <div className="text-[10px] font-mono text-zinc-400">{agent.id}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-full text-[9px] font-mono font-bold uppercase">
                    {agent.lane}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 mt-2 line-clamp-2">
                  {agent.primary_domain}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Tier 3: Functional Lanes (Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-black/[0.06]">
          {/* Column A: Engineering Fleet */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-indigo-600" />
                <span>Engineering Fleet</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">{engineeringAgents.length} agents</span>
            </div>

            <div className="space-y-3">
              {engineeringAgents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  onDoubleClick={() => onOpenAgentProfile(agent.id)}
                  title="Click to select, double-click to open workspace"
                  className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                    selectedAgent?.id === agent.id
                      ? 'bg-white border-indigo-600 ring-2 ring-indigo-500/10'
                      : 'bg-white/90 border-black/[0.06] hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{agent.symbol || '💻'}</span>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">{agent.display_name}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">{agent.id}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[9px] font-mono font-bold">
                      {agent.observed_liveness || 'LIVE'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-2 truncate font-medium">
                    {agent.primary_domain}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column B: Independent Quality & Verification */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Verification & Quality</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">{qualityAgents.length} agents</span>
            </div>

            <div className="space-y-3">
              {qualityAgents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  onDoubleClick={() => onOpenAgentProfile(agent.id)}
                  title="Click to select, double-click to open workspace"
                  className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                    selectedAgent?.id === agent.id
                      ? 'bg-white border-emerald-600 ring-2 ring-emerald-500/10'
                      : 'bg-white/90 border-black/[0.06] hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{agent.symbol || '🛡️'}</span>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">{agent.display_name}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">{agent.id}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[9px] font-mono font-bold">
                      VERIFIER
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-2 truncate font-medium">
                    {agent.primary_domain}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column C: Infrastructure & Substrate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-600" />
                <span>Infrastructure & CLI</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">{infraAgents.length + otherAgents.length} agents</span>
            </div>

            <div className="space-y-3">
              {[...infraAgents, ...otherAgents].map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  onDoubleClick={() => onOpenAgentProfile(agent.id)}
                  title="Click to select, double-click to open workspace"
                  className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
                    selectedAgent?.id === agent.id
                      ? 'bg-white border-amber-600 ring-2 ring-amber-500/10'
                      : 'bg-white/90 border-black/[0.06] hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{agent.symbol || '⚙️'}</span>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">{agent.display_name}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">{agent.id}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-full text-[9px] font-mono font-bold">
                      {agent.lane || 'infra'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-2 truncate font-medium">
                    {agent.primary_domain}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Agent Details Slide-Over / Bottom Pane */}
      {selectedAgent && (
        <div className="bg-white border border-black/[0.08] p-6 rounded-3xl shadow-sm space-y-4 animate-card-entry">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 border border-black/5 flex items-center justify-center text-2xl shadow-2xs">
                {selectedAgent.symbol || '🤖'}
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <span>{selectedAgent.display_name}</span>
                  <span className="text-xs font-mono text-zinc-400 font-normal">({selectedAgent.id})</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-zinc-100 text-zinc-700">
                    Lane: {selectedAgent.lane}
                  </span>
                </h2>
                <p className="text-xs text-zinc-600 font-medium mt-0.5">
                  {selectedAgent.primary_domain}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAgentProfile(selectedAgent.id)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Agent Workspace</span>
              </button>

              <button
                onClick={() => {
                  setEditingAgent(selectedAgent);
                  setIsEditModalOpen(true);
                }}
                className="px-3.5 py-1.5 bg-white hover:bg-black/5 text-zinc-700 border border-black/10 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Role</span>
              </button>

              <button
                onClick={() => onOpenTerminal(selectedAgent.id, 'claude_code')}
                className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <TerminalIcon className="w-3.5 h-3.5" />
                <span>Terminal</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-3 border-t border-black/[0.06]">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase text-zinc-400 mb-2">
                Declared Capabilities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {parseJsonArray(selectedAgent.declared_capabilities).map((cap, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-zinc-100 text-zinc-700 rounded-lg text-xs font-mono font-medium"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-mono font-bold uppercase text-zinc-400 mb-2">
                Substrate Responsibilities
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-700 list-disc list-inside font-medium">
                {parseJsonArray(selectedAgent.declared_responsibilities).map((resp, i) => (
                  <li key={i}>{resp}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Spawn Modal */}
      <SpawnAgentModal
        isOpen={isSpawnModalOpen}
        onClose={() => setIsSpawnModalOpen(false)}
        existingIdentities={identities}
        onAgentSpawned={handleAgentSpawned}
      />

      {/* Edit Role Modal */}
      {editingAgent && (
        <EditRoleModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingAgent(null);
          }}
          identity={editingAgent}
          onSaved={() => {
            onRefreshIdentities();
          }}
        />
      )}
    </div>
  );
};

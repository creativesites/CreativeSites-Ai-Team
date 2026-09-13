import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Bot,
  Terminal,
  Zap,
  CheckCircle2,
  AlertCircle,
  Play,
  Loader2,
  Cpu,
  Layers,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import {
  generateAgentRoleProfile,
  GeneratedAgentRole,
} from '../services/geminiOrchestrator';

interface SpawnAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingIdentities: any[];
  onAgentSpawned: (newIdentity: any, startSession: boolean, engine: string, prompt: string) => void;
}

export const SpawnAgentModal: React.FC<SpawnAgentModalProps> = ({
  isOpen,
  onClose,
  existingIdentities,
  onAgentSpawned,
}) => {
  const [naturalIntent, setNaturalIntent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile fields
  const [id, setId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [symbol, setSymbol] = useState('🤖');
  const [lane, setLane] = useState<'engineering' | 'infrastructure' | 'bridge' | 'gtm'>('engineering');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [capabilitiesStr, setCapabilitiesStr] = useState('');
  const [responsibilitiesStr, setResponsibilitiesStr] = useState('');
  const [spawnPrompt, setSpawnPrompt] = useState('');
  const [recommendedEngine, setRecommendedEngine] = useState<'claude' | 'gemini' | 'antigravity'>('claude');
  const [autoStartAgent, setAutoStartAgent] = useState(true);

  if (!isOpen) return null;

  const handleAskGemini = async () => {
    if (!naturalIntent.trim()) {
      setError('Please describe what role or specialist agent you need.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const generated: GeneratedAgentRole = await generateAgentRoleProfile(naturalIntent, existingIdentities);
      setId(generated.id);
      setDisplayName(generated.displayName);
      setSymbol(generated.symbol || '🤖');
      setLane(generated.lane || 'engineering');
      setPrimaryDomain(generated.primaryDomain);
      setCapabilitiesStr(generated.capabilities.join(', '));
      setResponsibilitiesStr(generated.responsibilities.join('\n'));
      setSpawnPrompt(generated.spawnPrompt);
      setRecommendedEngine(generated.recommendedEngine || 'claude');
    } catch (e: any) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleSpawnAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !displayName.trim()) {
      setError('Agent ID and Display Name are required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const caps = capabilitiesStr
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      const resps = responsibilitiesStr
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean);

      const identity = await invoke<any>('myaos_create_agent_identity', {
        id: id.trim().toLowerCase(),
        displayName: displayName.trim(),
        symbol: symbol.trim() || '🤖',
        primaryDomain: primaryDomain.trim() || 'Autonomous Engineering',
        lane,
        capabilities: caps,
        responsibilities: resps,
      });

      onAgentSpawned(identity, autoStartAgent, recommendedEngine, spawnPrompt);
      onClose();
    } catch (err: any) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs font-sans select-none animate-fade-in">
      <div className="bg-[#faf9f6] border border-black/[0.08] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.06] flex items-center justify-between bg-white/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-amber-300 flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                <span>Spawn New Agent Identity</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-black/[0.04] px-2 py-0.5 rounded-full font-normal">
                  Gemini 3.8 Flash Architect
                </span>
              </h2>
              <p className="text-xs text-zinc-500">
                Design role profile, craft execution prompts, and immediately auto-launch the agent CLI session
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-black/5 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* AI Architect Natural Prompt Bar */}
        <div className="p-6 bg-[#f4f3f0] border-b border-black/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Describe the role to Gemini 3.8 Flash</span>
            </label>
            <span className="text-[10px] text-zinc-400 font-mono">Auto-generates complete spec & prompt</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Documentation Lead who audits TypeScript APIs and writes developer tutorials"
              value={naturalIntent}
              onChange={(e) => setNaturalIntent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAskGemini();
                }
              }}
              className="flex-1 px-3.5 py-2.5 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs"
            />
            <button
              type="button"
              onClick={handleAskGemini}
              disabled={generating}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 shadow-sm disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
              <span>{generating ? 'Drafting...' : 'Auto-Generate'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSpawnAndSave} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Agent ID</label>
              <input
                type="text"
                placeholder="e.g. chronos"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 font-mono shadow-2xs"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Display Name</label>
              <input
                type="text"
                placeholder="e.g. Chronos"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Symbol Emoji</label>
              <input
                type="text"
                placeholder="e.g. ⏳"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Operational Lane</label>
              <select
                value={lane}
                onChange={(e) => setLane(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs"
              >
                <option value="engineering">Engineering</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="bridge">Bridge & Strategic</option>
                <option value="gtm">GTM & Operations</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Primary Domain</label>
              <input
                type="text"
                placeholder="e.g. Technical Documentation & API Schemas"
                value={primaryDomain}
                onChange={(e) => setPrimaryDomain(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Declared Capabilities <span className="text-zinc-400 font-normal">(Comma separated)</span>
            </label>
            <input
              type="text"
              placeholder="markdown, openapi, typescript, git, vitest"
              value={capabilitiesStr}
              onChange={(e) => setCapabilitiesStr(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Core Responsibilities <span className="text-zinc-400 font-normal">(One per line)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Maintain API markdown guides&#10;Verify OpenAPI spec alignment&#10;Author user release notes"
              value={responsibilitiesStr}
              onChange={(e) => setResponsibilitiesStr(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs font-mono"
            />
          </div>

          {/* Prompt to Inject when launching */}
          <div className="p-4 bg-amber-50/70 border border-amber-200/70 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-amber-700" />
                <span>Immediate Spawn & Kick-Off Prompt</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-amber-800 font-semibold">Engine:</span>
                <select
                  value={recommendedEngine}
                  onChange={(e) => setRecommendedEngine(e.target.value as any)}
                  className="px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs text-zinc-800 font-medium"
                >
                  <option value="claude">Claude Code (⚡)</option>
                  <option value="gemini">Gemini CLI (♊)</option>
                  <option value="antigravity">Antigravity (🚀)</option>
                </select>
              </div>
            </div>
            <textarea
              rows={3}
              value={spawnPrompt}
              onChange={(e) => setSpawnPrompt(e.target.value)}
              placeholder="Instruction prompt injected automatically into the live terminal session..."
              className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono shadow-2xs"
            />
            <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={autoStartAgent}
                onChange={(e) => setAutoStartAgent(e.target.checked)}
                className="w-4 h-4 rounded text-zinc-900 focus:ring-zinc-900 cursor-pointer"
              />
              <span className="font-medium">
                Auto-launch live CLI terminal session with prompt injected immediately on approval
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-2 flex justify-end gap-2 border-t border-black/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{saving ? 'Registering...' : autoStartAgent ? 'Approve & Auto-Spawn Agent' : 'Save Agent Identity'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

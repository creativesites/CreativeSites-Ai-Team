import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Save,
  Loader2,
  AlertCircle,
  Tag,
  ListTodo,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface EditRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  identity: any;
  onSaved: () => void;
}

export const EditRoleModal: React.FC<EditRoleModalProps> = ({
  isOpen,
  onClose,
  identity,
  onSaved,
}) => {
  if (!isOpen || !identity) return null;

  const [displayName, setDisplayName] = useState(identity.display_name || '');
  const [symbol, setSymbol] = useState(identity.symbol || '🤖');
  const [lane, setLane] = useState<'engineering' | 'infrastructure' | 'bridge' | 'gtm'>(
    identity.lane || 'engineering'
  );
  const [primaryDomain, setPrimaryDomain] = useState(identity.primary_domain || '');

  // Parse existing JSON or strings
  const initCaps = () => {
    try {
      if (Array.isArray(identity.declared_capabilities)) return identity.declared_capabilities.join(', ');
      if (typeof identity.declared_capabilities === 'string') {
        const parsed = JSON.parse(identity.declared_capabilities);
        return Array.isArray(parsed) ? parsed.join(', ') : identity.declared_capabilities;
      }
    } catch (_) {}
    return '';
  };

  const initResps = () => {
    try {
      if (Array.isArray(identity.declared_responsibilities)) return identity.declared_responsibilities.join('\n');
      if (typeof identity.declared_responsibilities === 'string') {
        const parsed = JSON.parse(identity.declared_responsibilities);
        return Array.isArray(parsed) ? parsed.join('\n') : identity.declared_responsibilities;
      }
    } catch (_) {}
    return '';
  };

  const [capabilitiesStr, setCapabilitiesStr] = useState(initCaps());
  const [responsibilitiesStr, setResponsibilitiesStr] = useState(initResps());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const caps = capabilitiesStr
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      const resps = responsibilitiesStr
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean);

      await invoke('myaos_update_agent_identity', {
        id: identity.id,
        displayName: displayName.trim(),
        symbol: symbol.trim(),
        primaryDomain: primaryDomain.trim(),
        lane,
        capabilities: caps,
        responsibilities: resps,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs font-sans select-none animate-fade-in">
      <div className="bg-[#faf9f6] border border-black/[0.08] w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.06] flex items-center justify-between bg-white/70">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span>Edit Agent Role & Responsibilities</span>
              <span className="text-xs font-mono text-zinc-400 font-normal">({identity.id})</span>
            </h2>
            <p className="text-xs text-zinc-500">
              Update domain ownership, execution lane, and substrate contract
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-black/5 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Display Name</label>
              <input
                type="text"
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
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs text-center"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Lane</label>
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
                value={primaryDomain}
                onChange={(e) => setPrimaryDomain(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Declared Capabilities (Comma separated)
            </label>
            <input
              type="text"
              value={capabilitiesStr}
              onChange={(e) => setCapabilitiesStr(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Core Responsibilities (One per line)
            </label>
            <textarea
              rows={4}
              value={responsibilitiesStr}
              onChange={(e) => setResponsibilitiesStr(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs font-mono"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-black/[0.06]">
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
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'Saving...' : 'Save Role Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

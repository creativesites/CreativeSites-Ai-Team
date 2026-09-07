'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  Users,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Clock,
  ArrowUpRight,
  Activity,
  CheckCircle,
} from '@/components/icons';

export default function DeployFleetBridgePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadBridgeData = async () => {
    try {
      const res = await fetch('/api/deployfleet-bridge');
      const d = await res.json();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBridgeData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-500 p-8 flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="flex justify-center text-indigo-600 animate-spin">
            <RefreshCw />
          </div>
          <div className="text-sm font-semibold text-slate-800">
            Querying DeployFleet TAM Database Bridge...
          </div>
        </div>
      </div>
    );
  }

  const { bridgeStatus, creativeSites, deployFleet } = data || {};

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Top Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
            <Layers />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                Cross-Organization Bridge: CreativeSites ↔ DeployFleet
              </h1>
              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                Direct TAM DB Active
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              Bridge Target: {bridgeStatus?.deployFleetDbPath}
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
          <Link href="/bridge" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            DeployFleet Bridge
          </Link>
          <Link href="/human" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Approvals
          </Link>
          <Link href="/phase5" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Learning
          </Link>
        </nav>
      </header>

      {/* Two-Organization Bento Deck */}
      <div className="grid grid-cols-2 gap-6">
        {/* CreativeSites Organization Card */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users />
                <span>CreativeSites Team Roster</span>
              </h2>
              <p className="text-xs text-slate-500">Autonomous multi-agent product team</p>
            </div>
            <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-100">
              {bridgeStatus?.creativeSites?.agent_count} Identities
            </span>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {creativeSites?.agents?.map((a: any) => (
              <div
                key={a.id}
                className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl flex justify-between items-center text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                    <Cpu />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{a.display_name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{a.lane} lane</div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase ${
                      a.observed_liveness === 'LIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {a.observed_liveness}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DeployFleet Organization Card */}
        <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck />
                <span>DeployFleet Team Roster (Federated)</span>
              </h2>
              <p className="text-xs text-slate-500">Dual-engine GTM & Engineering fleet</p>
            </div>
            <span className="text-xs font-mono font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100">
              {bridgeStatus?.deployFleet?.agent_count} Node Instances
            </span>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {deployFleet?.agents?.map((a: any) => (
              <div
                key={a.id}
                className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl flex justify-between items-center text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                    <Cpu />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{a.display_name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {a.engine} • {a.lane}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <span className="text-slate-500 uppercase px-2 py-0.5 rounded bg-slate-100">
                    {a.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

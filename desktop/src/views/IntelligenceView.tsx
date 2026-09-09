import React from 'react';
import { Zap, Cpu, DollarSign, ArrowUpRight } from 'lucide-react';

export const IntelligenceView: React.FC = () => {
  return (
    <div className="space-y-6 font-sans">
      <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-400" />
            <span>Intelligence Layer & Token Economics</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Dynamic model selection, cheapest-sufficient routing, and token usage optimization
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 font-mono">
          <div className="text-xs text-slate-400 uppercase font-bold">Input Tokens</div>
          <div className="text-2xl font-bold text-slate-100">1.82M</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 font-mono">
          <div className="text-xs text-slate-400 uppercase font-bold">Output Tokens</div>
          <div className="text-2xl font-bold text-indigo-400">421K</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 font-mono">
          <div className="text-xs text-slate-400 uppercase font-bold">Context Cache Savings</div>
          <div className="text-2xl font-bold text-emerald-400">38%</div>
        </div>
      </div>
    </div>
  );
};

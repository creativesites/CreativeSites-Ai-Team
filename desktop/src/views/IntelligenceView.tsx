import React from 'react';
import { Zap } from 'lucide-react';

export const IntelligenceView: React.FC = () => {
  return (
    <div className="space-y-6 font-sans select-none animate-card-entry">
      <div className="bg-white border border-white/60 p-6 rounded-3xl flex justify-between items-center shadow-mac-soft">
        <div>
          <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-500 animate-pulse" />
            <span>Intelligence Layer & Token Economics</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Dynamic model selection, cheapest-sufficient routing, and token usage optimization
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Card 1 */}
        <div className="bg-white border border-white/60 p-5 rounded-3xl shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300 space-y-2">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider font-mono">Input Tokens</div>
          <div className="text-2xl font-bold font-mono text-slate-800">1.82M</div>
        </div>

        {/* Card 2 */}
        <div className="bg-white border border-white/60 p-5 rounded-3xl shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300 space-y-2">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider font-mono">Output Tokens</div>
          <div className="text-2xl font-bold font-mono text-indigo-600">421K</div>
        </div>

        {/* Card 3 */}
        <div className="bg-white border border-white/60 p-5 rounded-3xl shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300 space-y-2">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider font-mono">Context Cache Savings</div>
          <div className="text-2xl font-bold font-mono text-emerald-600">38%</div>
        </div>
      </div>
    </div>
  );
};

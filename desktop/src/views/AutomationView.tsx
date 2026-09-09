import React, { useState } from 'react';
import { Flame, Play, Pause, RefreshCw, Moon, ShieldAlert, CheckCircle } from 'lucide-react';

interface AutomationViewProps {
  sleepPrevented: boolean;
  onToggleSleepPrevention: () => void;
  onOpenTerminal: (agentId: string, runtimeType: string) => void;
}

export const AutomationView: React.FC<AutomationViewProps> = ({
  sleepPrevented,
  onToggleSleepPrevention,
  onOpenTerminal,
}) => {
  const [isRunning, setIsRunning] = useState(true);

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <span>Autonomous Task Runner & Claude-Autopilot Engine</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Overnight task queue execution, auto-resume on rate-limits, and native OS sleep prevention
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              isRunning ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isRunning ? 'Pause Automation' : 'Start Automation'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 font-mono text-xs">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
          <div className="text-slate-400 font-bold uppercase flex justify-between">
            <span>Sleep Prevention</span>
            <Moon className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {sleepPrevented ? 'ACTIVE' : 'DISABLED'}
          </div>
          <button
            onClick={onToggleSleepPrevention}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-sans text-xs transition cursor-pointer"
          >
            Toggle OS Assertion
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
          <div className="text-slate-400 font-bold uppercase flex justify-between">
            <span>Auto-Resume Monitor</span>
            <RefreshCw className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400">WATCHING</div>
          <p className="text-[10px] text-slate-400 font-sans">Listens for PTY rate-limit output & auto-retries</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
          <div className="text-slate-400 font-bold uppercase flex justify-between">
            <span>Retry Policy</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400">3 RETRIES</div>
          <p className="text-[10px] text-slate-400 font-sans">Escalates to Winston if 3 consecutive failures occur</p>
        </div>
      </div>
    </div>
  );
};

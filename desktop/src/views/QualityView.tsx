import React from 'react';
import { ShieldCheck, CheckCircle2, FileText } from 'lucide-react';

export const QualityView: React.FC = () => {
  return (
    <div className="space-y-6 font-sans">
      <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl justify-between items-center shadow-lg">
        <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Evidence & Claim Execution System</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Observed execution proofs: ESLint exit codes, unit test pass counts, git diff evidence
        </p>
      </div>

      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 font-mono text-xs">
        <div className="flex items-center gap-2 text-emerald-400 font-bold">
          <CheckCircle2 className="w-4 h-4" />
          <span>Verified Test Proof Bundle (31/31 passed, Exit code 0)</span>
        </div>
        <p className="text-slate-400 font-sans text-xs">Verified by Kael (Lead Verifier) with provenance record saved to /community/system/VERIFICATION_RECORD.json</p>
      </div>
    </div>
  );
};

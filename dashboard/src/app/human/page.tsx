'use client';

import { useEffect, useState } from 'react';

interface HumanDecision {
  id: string;
  category: string;
  context: string;
  options: string;
  status: string;
  urgency: string;
  requested_by: string;
  requested_at: string;
  decision?: string;
  decided_by?: string;
  decided_at?: string;
}

export default function HumanPage() {
  const [decisions, setDecisions] = useState<HumanDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDecisions = async () => {
    try {
      const res = await fetch('/api/human');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDecisions(data.decisions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecisions();
  }, []);

  const handleDecision = async (id: string, decision: string) => {
    try {
      const res = await fetch('/api/human', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, decided_by: 'winston' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchDecisions();
    } catch (err: any) {
      alert(`Error submitting decision: ${err.message}`);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Human Approval Queue (/human)</h1>
            <p className="text-sm text-slate-400">Decisions requiring human authorization from Winston</p>
          </div>
          <button
            onClick={fetchDecisions}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs font-medium border border-slate-700"
          >
            Refresh
          </button>
        </header>

        {loading && <p className="text-slate-400">Loading decisions...</p>}
        {error && <div className="p-4 bg-red-950 border border-red-800 text-red-300 rounded">{error}</div>}

        {!loading && decisions.length === 0 && (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded text-slate-500">
            No pending or past decisions recorded yet.
          </div>
        )}

        <div className="space-y-4">
          {decisions.map((dec) => (
            <div key={dec.id} className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded uppercase mr-2 ${
                    dec.urgency === 'high' ? 'bg-red-900/50 text-red-300 border border-red-700' : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                  }`}>
                    {dec.urgency}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{dec.category}</span>
                </div>
                <span className="text-xs text-slate-500">{dec.requested_at}</span>
              </div>

              <p className="text-sm text-slate-200">{dec.context}</p>

              {dec.status === 'pending' ? (
                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => handleDecision(dec.id, 'APPROVED')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecision(dec.id, 'REJECTED')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <div className="pt-2 text-xs text-slate-400">
                  Status: <strong className="text-slate-200">{dec.status}</strong> | Decision: <strong className="text-slate-200">{dec.decision}</strong> by {dec.decided_by}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

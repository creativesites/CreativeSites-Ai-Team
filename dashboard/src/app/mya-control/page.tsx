'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Zap,
  RefreshCw,
  Sliders,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Users,
  Send,
  Layers,
  ShieldCheck,
} from '@/components/icons';

interface Directive {
  id: number;
  title: string;
  directive_type: string;
  content: string;
  priority: number;
  is_active: number;
  created_by: string;
  updated_at: string;
}

interface Stylist {
  id: number;
  stylist_name: string;
  salon_name: string;
  city: string;
  state: string;
  specialties: string;
  booking_url: string;
  instagram: string;
  is_verified_partner: number;
  is_active: number;
}

export default function MyaControlCenter() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [activeTab, setActiveTab] = useState<'directives' | 'stylists'>('directives');
  const [loading, setLoading] = useState(true);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  // New Directive Form
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState('master_directive');
  const [newPriority, setNewPriority] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Stylist Form
  const [stylistName, setStylistName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [bookingUrl, setBookingUrl] = useState('');
  const [instagram, setInstagram] = useState('');

  // Simulator State
  const [simPrompt, setSimPrompt] = useState('I need a low-tension protective style for my 4C hair. Any recommended stylists?');
  const [simResult, setSimResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dRes, sRes] = await Promise.all([
        fetch('/api/mya-control/directives').then((r) => r.json()),
        fetch('/api/mya-control/stylists').then((r) => r.json()),
      ]);
      setDirectives(dRes.directives || []);
      setStylists(sRes.stylists || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleDirective = async (id: number, currentStatus: number) => {
    try {
      const nextStatus = currentStatus === 1 ? 0 : 1;
      await fetch('/api/mya-control/directives', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: nextStatus }),
      });
      setDirectives((prev) =>
        prev.map((d) => (d.id === id ? { ...d, is_active: nextStatus } : d))
      );
      showBanner('Directive status updated! Active instructions are live immediately.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddDirective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/mya-control/directives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          content: newContent.trim(),
          directive_type: newType,
          priority: newPriority,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewTitle('');
        setNewContent('');
        loadData();
        showBanner('New Master Directive added and live in Mya memory!');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddStylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stylistName.trim() || !city.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/mya-control/stylists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylist_name: stylistName.trim(),
          salon_name: salonName.trim(),
          city: city.trim(),
          state: state.trim(),
          specialties: specialties.trim(),
          booking_url: bookingUrl.trim(),
          instagram: instagram.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStylistName('');
        setSalonName('');
        setCity('');
        setState('');
        setSpecialties('');
        setBookingUrl('');
        setInstagram('');
        loadData();
        showBanner('Stylist partner added to Mya salon knowledge base!');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunSimulation = async () => {
    if (!simPrompt.trim()) return;
    setIsSimulating(true);
    try {
      const res = await fetch('/api/mya-control/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: simPrompt }),
      });
      const data = await res.json();
      setSimResult(data.simulation);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  const showBanner = (msg: string) => {
    setSavedBanner(msg);
    setTimeout(() => setSavedBanner(null), 5000);
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Top Navigation */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-inner">
            <Sliders />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                Mya AI Training & Prompt Control Center
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live Hot-Reload Active
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Direct executive prompt management, real-time directive overrides, and salon partner knowledge curation for Candace & team.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition text-xs font-medium flex items-center gap-1 border border-slate-200"
          >
            <RefreshCw width={12} height={12} /> Refresh
          </button>
          <Link
            href="/"
            className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition text-xs font-medium border border-slate-200"
          >
            Cockpit
          </Link>
        </div>
      </header>

      {/* Instant Notification Banner */}
      {savedBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle className="text-emerald-600 w-4 h-4" />
          <span>{savedBanner}</span>
        </div>
      )}

      {/* Main Grid: Control Panels + Live Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto w-full">
        {/* Left Column: Directives & Stylists Management */}
        <div className="lg:col-span-7 space-y-6">
          {/* Navigation Tabs */}
          <div className="flex items-center space-x-2 bg-slate-200/60 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('directives')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'directives'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Master Directives ({directives.length})
            </button>
            <button
              onClick={() => setActiveTab('stylists')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'stylists'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Recommended Stylists ({stylists.length})
            </button>
          </div>

          {/* TAB 1: Directives List & Form */}
          {activeTab === 'directives' && (
            <div className="space-y-6">
              {/* Active Directives */}
              <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Active Master Directives</h2>
                    <p className="text-xs text-slate-500">
                      Injected on every conversation turn. Edits take effect immediately without code deployment.
                    </p>
                  </div>
                </div>

                {loading ? (
                  <div className="py-8 text-center text-xs text-slate-400">Loading directives...</div>
                ) : directives.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">No master directives defined yet.</div>
                ) : (
                  <div className="space-y-2.5">
                    {directives.map((d) => (
                      <div
                        key={d.id}
                        className={`p-4 rounded-xl border text-xs transition ${
                          d.is_active
                            ? 'bg-white border-slate-200 shadow-xs'
                            : 'bg-slate-50/70 border-slate-200 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{d.title}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                              {d.directive_type}
                            </span>
                            <span className="text-[10px] text-slate-400">Priority {d.priority}</span>
                          </div>
                          <button
                            onClick={() => handleToggleDirective(d.id, d.is_active)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition ${
                              d.is_active
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                            }`}
                          >
                            {d.is_active ? 'ACTIVE' : 'DISABLED'}
                          </button>
                        </div>
                        <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed font-mono text-[11.5px]">
                          {d.content}
                        </p>
                        <div className="mt-2 text-[10px] text-slate-400 flex justify-between">
                          <span>Set by {d.created_by}</span>
                          <span>Updated {d.updated_at}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Add New Master Directive */}
              <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Add Master Prompt Directive</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Enter an instruction or rule for Mya. Example: &quot;When asked about postpartum shedding, lead with empathy and recommend gentle scalp stimulation.&quot;
                </p>

                <form onSubmit={handleAddDirective} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Directive Label</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g. Silk Press Maintenance Guardrail"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-purple-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Directive Type</label>
                      <select
                        value={newType}
                        onChange={(e) => setNewType(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      >
                        <option value="master_directive">Master Directive (Strict)</option>
                        <option value="guardrail">Safety / Consultation Guardrail</option>
                        <option value="topic_override">Topic Specific Override</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Priority (1-100)</label>
                      <input
                        type="number"
                        value={newPriority}
                        onChange={(e) => setNewPriority(Number(e.target.value))}
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Exact Prompt Instruction</label>
                    <textarea
                      rows={3}
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="Specify exactly how Mya should respond or behave..."
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-purple-500 font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !newTitle.trim() || !newContent.trim()}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" /> Save & Apply Immediately
                  </button>
                </form>
              </section>
            </div>
          )}

          {/* TAB 2: Stylists List & Form */}
          {activeTab === 'stylists' && (
            <div className="space-y-6">
              {/* Stylists Directory */}
              <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <h2 className="text-sm font-bold text-slate-900">Recommended Stylists & Salon Partners</h2>
                <p className="text-xs text-slate-500">
                  Curated directory surfaced by Mya whenever users ask for local styling services or appointments.
                </p>

                {loading ? (
                  <div className="py-8 text-center text-xs text-slate-400">Loading stylists...</div>
                ) : stylists.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">No stylists registered.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {stylists.map((s) => (
                      <div key={s.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs space-y-1.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-slate-900 text-sm">{s.stylist_name}</span>
                            <span className="text-slate-500 block">{s.salon_name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            {s.city}, {s.state}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] font-medium">Specialties: {s.specialties}</p>
                        {s.booking_url && (
                          <a
                            href={s.booking_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-purple-600 hover:underline block text-[11px]"
                          >
                            Book: {s.booking_url}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Add Stylist Form */}
              <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Add Recommended Stylist Partner</h3>
                <form onSubmit={handleAddStylist} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Stylist Name *</label>
                      <input
                        type="text"
                        value={stylistName}
                        onChange={(e) => setStylistName(e.target.value)}
                        placeholder="e.g. Maya Robinson"
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Salon Name</label>
                      <input
                        type="text"
                        value={salonName}
                        onChange={(e) => setSalonName(e.target.value)}
                        placeholder="e.g. Curl Sanctuary"
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">City *</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Atlanta"
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="e.g. GA"
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Specialties</label>
                    <input
                      type="text"
                      value={specialties}
                      onChange={(e) => setSpecialties(e.target.value)}
                      placeholder="e.g. Silk Press, Loc Maintenance, Curly Cut"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Booking URL</label>
                      <input
                        type="text"
                        value={bookingUrl}
                        onChange={(e) => setBookingUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Instagram</label>
                      <input
                        type="text"
                        value={instagram}
                        onChange={(e) => setInstagram(e.target.value)}
                        placeholder="@username"
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !stylistName.trim() || !city.trim()}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" /> Add Stylist to Mya
                  </button>
                </form>
              </section>
            </div>
          )}
        </div>

        {/* Right Column: Live Simulator Sandbox */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs h-full flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Live Mya Simulator</h3>
                <p className="text-xs text-slate-500">Test prompt directives & see how Mya evaluates them in real-time.</p>
              </div>
            </div>

            {/* Test Input */}
            <div className="space-y-2 mb-4">
              <label className="block text-xs font-semibold text-slate-700">Test Query</label>
              <textarea
                rows={3}
                value={simPrompt}
                onChange={(e) => setSimPrompt(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-emerald-500 font-sans"
              />
              <button
                onClick={handleRunSimulation}
                disabled={isSimulating}
                className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5"
              >
                {isSimulating ? 'Simulating...' : 'Run Simulation with Active Directives'}
              </button>
            </div>

            {/* Simulation Results */}
            <div className="flex-1 bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 overflow-y-auto max-h-[500px]">
              <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider block">
                Simulator Evaluation & Context Breakdown
              </span>

              {simResult ? (
                <div className="space-y-3 text-xs">
                  {/* Status Banner */}
                  <div className="p-2.5 rounded-lg bg-emerald-100/80 border border-emerald-200 text-emerald-800 font-medium text-[11px] flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Directives Injected: {simResult.assembledContext.directivesCount} active rules</span>
                  </div>

                  {/* Connected Profile */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-800 block text-[11px]">Connected HairAI Profile:</span>
                    <div className="text-slate-600 text-[11px] space-y-0.5">
                      <p>• Hair Type: {simResult.assembledContext.profileInjected.hairType}</p>
                      <p>• Porosity: {simResult.assembledContext.profileInjected.porosity}</p>
                      <p>• Goals: {simResult.assembledContext.profileInjected.goals.join(', ')}</p>
                    </div>
                  </div>

                  {/* Active Directives Injected */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                    <span className="font-bold text-slate-800 block text-[11px]">Active Injected Directives:</span>
                    {simResult.assembledContext.activeDirectives.map((d: any, i: number) => (
                      <div key={i} className="text-[11px] bg-purple-50 text-purple-900 p-2 rounded border border-purple-100 font-mono">
                        <strong className="font-sans block text-purple-800">{d.title}</strong>
                        {d.snippet}
                      </div>
                    ))}
                  </div>

                  {/* Matched Stylists */}
                  {simResult.assembledContext.matchedStylists.length > 0 && (
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                      <span className="font-bold text-slate-800 block text-[11px]">Matched Stylist Recommendations:</span>
                      {simResult.assembledContext.matchedStylists.map((st: any, i: number) => (
                        <div key={i} className="text-[11px] text-slate-700 bg-slate-50 p-2 rounded">
                          <strong>{st.stylist_name}</strong> ({st.salon_name}) - {st.city}, {st.state}
                          <span className="block text-slate-500 text-[10px]">Specialties: {st.specialties}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Click &quot;Run Simulation&quot; to test how Mya evaluates active directives and prevents repetitive questions.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

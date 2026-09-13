import React, { useEffect, useState, useRef } from 'react';
import {
  Inbox,
  MessageSquare,
  Radio,
  Share2,
  Calendar,
  Send,
  Sparkles,
  Bot,
  User,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ChevronRight,
  Terminal,
  Hash,
  AlertCircle,
  Tag,
  ArrowRight,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { generateInboxSummary, generateDailyStandupDigest } from '../services/geminiOrchestrator';
import { FormattedContent, AIClarificationCard } from '../components/communication/CommunicationComponents';

export type CommunicationSubpage = 'inboxes' | 'threads' | 'announcements' | 'social' | 'standups';

export interface ChatMessage {
  id: number;
  thread_id?: string | null;
  from_identity?: string | null;
  to_identity?: string | null;
  msg_type: string;
  priority?: string | null;
  subject?: string | null;
  body?: string | null;
  read: number;
  ts: string;
}

export interface Thread {
  id: string;
  title: string;
  author_identities?: string;
  target_identities?: string;
  status: string;
  related_task_id?: string;
  related_project_id?: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Announcement {
  id: number;
  title: string;
  author_identity?: string;
  content?: string;
  audience?: string;
  ts: string;
}

export interface SocialPost {
  id: number;
  channel: string;
  author_identity?: string;
  content: string;
  ts: string;
}

export interface Standup {
  id: number;
  standup_date: string;
  facilitator?: string;
  present_identities?: string;
  absent_identities?: string;
  content?: string;
  parsed_updates?: string;
  ts: string;
}

interface DirectChatViewProps {
  onSpawnClaude: (agentId?: string, cwd?: string, resume?: boolean, prompt?: string) => void;
  onSpawnGemini: (agentId?: string, cwd?: string, resume?: boolean, prompt?: string) => void;
}

const AGENTS = [
  { id: 'Winston', name: 'Winston', role: 'Executive Lead', symbol: '👑', color: 'bg-amber-500' },
  { id: 'orchestrator', name: 'Orchestrator', role: 'System Autonomous Router', symbol: '⚡', color: 'bg-indigo-600' },
  { id: 'atlas', name: 'Atlas', role: 'Team Coordinator & Cloud Run', symbol: '⏣', color: 'bg-slate-700' },
  { id: 'astra', name: 'Astra', role: 'UI & Widget Streaming Lead', symbol: '✦', color: 'bg-violet-600' },
  { id: 'iris', name: 'Iris', role: 'Telemetry & Operator 360', symbol: '👁', color: 'bg-blue-600' },
  { id: 'vela', name: 'Vela', role: 'WordPress Host Bridge', symbol: '✧', color: 'bg-emerald-600' },
  { id: 'lyra', name: 'Lyra', role: 'React Native Mobile SDK', symbol: '📱', color: 'bg-amber-600' },
  { id: 'kael', name: 'Kael', role: 'Lead Verifier & QA', symbol: '🛡', color: 'bg-rose-600' },
  { id: 'antigravity', name: 'Antigravity', role: 'Browser QA & Playwright', symbol: '🛸', color: 'bg-cyan-600' },
];

export const DirectChatView: React.FC<DirectChatViewProps> = ({
  onSpawnClaude,
  onSpawnGemini,
}) => {
  const [activeTab, setActiveTab] = useState<CommunicationSubpage>('inboxes');

  // Subpage 1: Inboxes State
  const [selectedInbox, setSelectedInbox] = useState<string>('Winston');
  const [inboxMessages, setInboxMessages] = useState<ChatMessage[]>([]);
  const [inboxSummary, setInboxSummary] = useState<string>('');
  const [isSummarizingInbox, setIsSummarizingInbox] = useState(false);
  const [inboxInput, setInboxInput] = useState('');
  const [inboxRecipient, setInboxRecipient] = useState('orchestrator');

  // Subpage 2: Threads State
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [threadReplyInput, setThreadReplyInput] = useState('');
  const [showNewThreadModal, setShowNewThreadModal] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadMessage, setNewThreadMessage] = useState('');
  const [newThreadTarget, setNewThreadTarget] = useState('astra');

  // Subpage 3: Announcements State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showNewAnnouncementModal, setShowNewAnnouncementModal] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [announcementAudience, setAnnouncementAudience] = useState('all');

  // Subpage 4: Social State
  const [activeChannel, setActiveChannel] = useState<string>('general');
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [socialInput, setSocialInput] = useState('');

  // Subpage 5: Standups State
  const [standups, setStandups] = useState<Standup[]>([]);
  const [selectedStandup, setSelectedStandup] = useState<Standup | null>(null);
  const [standupDigest, setStandupDigest] = useState<string>('');
  const [isGeneratingDigest, setIsGeneratingDigest] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Data Fetching ---

  const fetchInbox = async () => {
    try {
      const msgs = await invoke<ChatMessage[]>('myaos_get_inbox_messages', {
        identity: selectedInbox,
        limit: 50,
      });
      setInboxMessages(msgs || []);
    } catch (e) {
      console.warn('Failed to fetch inbox:', e);
    }
  };

  const fetchThreads = async () => {
    try {
      const res = await invoke<Thread[]>('myaos_list_threads');
      setThreads(res || []);
      if (!selectedThreadId && res && res.length > 0) {
        setSelectedThreadId(res[0].id);
      }
    } catch (e) {
      console.warn('Failed to fetch threads:', e);
    }
  };

  const fetchThreadMessages = async (threadId: string) => {
    try {
      const msgs = await invoke<ChatMessage[]>('myaos_get_thread_messages', { threadId });
      setThreadMessages(msgs || []);
    } catch (e) {
      console.warn('Failed to fetch thread messages:', e);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const res = await invoke<Announcement[]>('myaos_list_announcements', { limit: 20 });
      setAnnouncements(res || []);
    } catch (e) {
      console.warn('Failed to fetch announcements:', e);
    }
  };

  const fetchSocialPosts = async () => {
    try {
      const res = await invoke<SocialPost[]>('myaos_list_social_posts', {
        channel: activeChannel === 'all' ? null : activeChannel,
        limit: 50,
      });
      setSocialPosts(res || []);
    } catch (e) {
      console.warn('Failed to fetch social posts:', e);
    }
  };

  const fetchStandups = async () => {
    try {
      const res = await invoke<Standup[]>('myaos_list_standups', { limit: 10 });
      setStandups(res || []);
      if (!selectedStandup && res && res.length > 0) {
        setSelectedStandup(res[0]);
      }
    } catch (e) {
      console.warn('Failed to fetch standups:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'inboxes') fetchInbox();
    if (activeTab === 'threads') fetchThreads();
    if (activeTab === 'announcements') fetchAnnouncements();
    if (activeTab === 'social') fetchSocialPosts();
    if (activeTab === 'standups') fetchStandups();
  }, [activeTab, selectedInbox, activeChannel]);

  useEffect(() => {
    if (selectedThreadId) {
      fetchThreadMessages(selectedThreadId);
    }
  }, [selectedThreadId]);

  // Handle AI Inbox Summary Generation
  const handleGenerateInboxSummary = async () => {
    if (inboxMessages.length === 0) return;
    setIsSummarizingInbox(true);
    try {
      const summary = await generateInboxSummary(selectedInbox, inboxMessages);
      setInboxSummary(summary);
    } finally {
      setIsSummarizingInbox(false);
    }
  };

  // Handle AI Standup Digest Generation
  const handleGenerateStandupDigest = async () => {
    if (!selectedStandup || !selectedStandup.content) return;
    setIsGeneratingDigest(true);
    try {
      const digest = await generateDailyStandupDigest(selectedStandup.standup_date, selectedStandup.content);
      setStandupDigest(digest);
    } finally {
      setIsGeneratingDigest(false);
    }
  };

  // Dispatch Actions
  const handleSendInboxMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboxInput.trim()) return;

    try {
      await invoke('myaos_send_chat_message', {
        from: selectedInbox,
        to: inboxRecipient,
        body: inboxInput.trim(),
      });
      setInboxInput('');
      fetchInbox();
    } catch (err) {
      alert(`Failed to send message: ${err}`);
    }
  };

  const handleSendThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadReplyInput.trim() || !selectedThreadId) return;

    try {
      await invoke('myaos_post_thread_reply', {
        threadId: selectedThreadId,
        from: 'Winston',
        body: threadReplyInput.trim(),
      });
      setThreadReplyInput('');
      fetchThreadMessages(selectedThreadId);
      fetchThreads();
    } catch (err) {
      alert(`Failed to post thread reply: ${err}`);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThreadTitle.trim() || !newThreadMessage.trim()) return;

    try {
      const created = await invoke<Thread>('myaos_create_thread', {
        title: newThreadTitle.trim(),
        author: 'Winston',
        targetIdentities: [newThreadTarget],
        initialMessage: newThreadMessage.trim(),
      });
      setShowNewThreadModal(false);
      setNewThreadTitle('');
      setNewThreadMessage('');
      fetchThreads();
      setSelectedThreadId(created.id);
    } catch (err) {
      alert(`Failed to create thread: ${err}`);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementContent.trim()) return;

    try {
      await invoke('myaos_create_announcement', {
        title: announcementTitle.trim(),
        author: 'Winston',
        content: announcementContent.trim(),
        audience: announcementAudience,
      });
      setShowNewAnnouncementModal(false);
      setAnnouncementTitle('');
      setAnnouncementContent('');
      fetchAnnouncements();
    } catch (err) {
      alert(`Failed to broadcast announcement: ${err}`);
    }
  };

  const handleCreateSocialPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socialInput.trim()) return;

    try {
      await invoke('myaos_create_social_post', {
        channel: activeChannel,
        author: 'Winston',
        content: socialInput.trim(),
      });
      setSocialInput('');
      fetchSocialPosts();
    } catch (err) {
      alert(`Failed to post to #${activeChannel}: ${err}`);
    }
  };

  return (
    <div className="h-full w-full bg-[#faf9f6] text-zinc-900 font-sans select-none flex flex-col p-4 space-y-3 overflow-hidden">
      {/* Top Header & Subpage Navigation Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/90 backdrop-blur-xl border border-zinc-200/80 p-3.5 rounded-3xl shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-zinc-900">Agent Communication Workspace</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Substrate Protocol</span>
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Direct inboxes, multi-agent contracts, announcements, watercooler, and daily standups
            </p>
          </div>
        </div>

        {/* Subpage Tabs Switcher */}
        <div className="flex items-center bg-zinc-100 p-1 rounded-2xl border border-zinc-200/80 text-xs font-medium">
          <button
            onClick={() => setActiveTab('inboxes')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'inboxes' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Inboxes</span>
          </button>
          <button
            onClick={() => setActiveTab('threads')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'threads' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Threads</span>
          </button>
          <button
            onClick={() => setActiveTab('announcements')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'announcements' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Announcements</span>
          </button>
          <button
            onClick={() => setActiveTab('social')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'social' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            <span>Social</span>
          </button>
          <button
            onClick={() => setActiveTab('standups')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'standups' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Daily Standups</span>
          </button>
        </div>
      </div>

      {/* SUBPAGE 1: INBOXES */}
      {activeTab === 'inboxes' && (
        <div className="flex-1 flex gap-3 overflow-hidden">
          {/* Inboxes Roster Column */}
          <div className="w-64 bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-3xl p-3 flex flex-col shrink-0 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400 px-2 py-1">
              Agent Mailboxes
            </div>
            <div className="space-y-1 mt-1 overflow-y-auto flex-1">
              {AGENTS.map((agent) => {
                const isSelected = selectedInbox === agent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setSelectedInbox(agent.id);
                      setInboxSummary('');
                    }}
                    className={`w-full p-2.5 rounded-2xl text-left transition flex items-center justify-between cursor-pointer border ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                        : 'bg-zinc-50/60 hover:bg-zinc-100 text-zinc-700 border-zinc-200/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base shrink-0">{agent.symbol}</span>
                      <div className="min-w-0">
                        <div className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-zinc-900'}`}>
                          {agent.name}
                        </div>
                        <div className={`text-[10px] truncate ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
                          {agent.role}
                        </div>
                      </div>
                    </div>
                    {isSelected && <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inbox Feed & Composer Column */}
          <div className="flex-1 bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-3xl p-4 flex flex-col shadow-xs overflow-hidden">
            {/* Inbox Header & AI Summary Trigger */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-900">{selectedInbox}'s Feed</span>
                <span className="text-[10.5px] font-mono text-zinc-400">
                  ({inboxMessages.length} messages received)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateInboxSummary}
                  disabled={isSummarizingInbox || inboxMessages.length === 0}
                  className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-1.5 disabled:opacity-50"
                  title="Generate an AI bulleted digest using Gemini Orchestrator"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isSummarizingInbox ? 'animate-spin' : ''}`} />
                  <span>{isSummarizingInbox ? 'Summarizing...' : 'AI TL;DR'}</span>
                </button>
                <button
                  onClick={fetchInbox}
                  className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-lg transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* AI Generated Inbox TL;DR Box */}
            {inboxSummary && (
              <div className="my-2.5 p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-indigo-950 shrink-0 font-sans leading-relaxed animate-card-entry">
                <div className="flex items-center gap-1.5 font-bold text-indigo-900 mb-1 text-[11px] uppercase tracking-wider font-mono">
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                  <span>Executive AI Digest</span>
                </div>
                <div className="whitespace-pre-wrap">{inboxSummary}</div>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto space-y-2.5 py-2 pr-1">
              {inboxMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-2">
                  <Inbox className="w-8 h-8 text-zinc-300 stroke-[1.5]" />
                  <span className="text-xs">No messages in this mailbox</span>
                </div>
              ) : (
                inboxMessages.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 hover:bg-zinc-50/80 transition space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-mono font-bold text-zinc-800 flex items-center gap-1.5">
                        <span className="text-indigo-600 font-semibold">{m.from_identity || 'System'}</span>
                        <span className="text-zinc-300">→</span>
                        <span className="text-zinc-600">{m.to_identity || selectedInbox}</span>
                      </span>
                      <span className="text-zinc-400 font-mono">
                        {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {m.subject && (
                      <div className="text-xs font-semibold text-zinc-900">{m.subject}</div>
                    )}
                    <FormattedContent
                      content={m.body || ''}
                      onRunInTerminal={(cmd) => onSpawnClaude(selectedInbox, undefined, true, `Execute: ${cmd}`)}
                    />
                    {m.body && m.body.length > 50 && (
                      <AIClarificationCard
                        originalText={m.body}
                        contextType="instruction"
                        agentId={m.from_identity || 'orchestrator'}
                        onDispatchAction={(prompt) => onSpawnClaude(m.from_identity || 'astra', undefined, true, prompt)}
                      />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Inbox Quick Dispatch Composer */}
            <form onSubmit={handleSendInboxMessage} className="pt-2 border-t border-zinc-100 flex items-center gap-2 shrink-0">
              <select
                value={inboxRecipient}
                onChange={(e) => setInboxRecipient(e.target.value)}
                className="h-9 px-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-700 focus:outline-none cursor-pointer"
              >
                {AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    To: {a.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder={`Dispatch message to ${inboxRecipient}...`}
                value={inboxInput}
                onChange={(e) => setInboxInput(e.target.value)}
                className="flex-1 h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
              />
              <button
                type="submit"
                disabled={!inboxInput.trim()}
                className="h-9 px-4 bg-zinc-900 hover:bg-black text-white text-xs font-medium rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                <Send className="w-3 h-3" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBPAGE 2: THREADS */}
      {activeTab === 'threads' && (
        <div className="flex-1 flex gap-3 overflow-hidden">
          {/* Threads Directory Column */}
          <div className="w-72 bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-3xl p-3 flex flex-col shrink-0 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400">
                Discussion Threads ({threads.length})
              </span>
              <button
                onClick={() => setShowNewThreadModal(true)}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-600 transition cursor-pointer"
                title="Start new thread"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 mt-2 overflow-y-auto flex-1">
              {threads.map((t) => {
                const isSelected = selectedThreadId === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedThreadId(t.id)}
                    className={`p-2.5 rounded-2xl text-left transition cursor-pointer border ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                        : 'bg-zinc-50/60 hover:bg-zinc-100 text-zinc-700 border-zinc-200/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`font-mono ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
                        {t.id}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium ${isSelected ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-200 text-zinc-600'}`}>
                        {t.message_count} replies
                      </span>
                    </div>
                    <div className={`text-xs font-semibold line-clamp-2 mt-1 ${isSelected ? 'text-white' : 'text-zinc-900'}`}>
                      {t.title}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Thread Conversation Stream */}
          <div className="flex-1 bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-3xl p-4 flex flex-col shadow-xs overflow-hidden">
            {selectedThreadId ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-900">
                      {threads.find((t) => t.id === selectedThreadId)?.title}
                    </h2>
                    <span className="text-[10.5px] font-mono text-zinc-400">
                      Thread ID: {selectedThreadId}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSpawnClaude('astra', undefined, true, `Addressing discussion in thread ${selectedThreadId}`)}
                      className="px-2.5 py-1 bg-zinc-900 text-white hover:bg-black rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-1.5"
                    >
                      <Terminal className="w-3 h-3" />
                      <span>Dispatch Agent</span>
                    </button>
                  </div>
                </div>

                {/* Messages Feed */}
                <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1">
                  {threadMessages.map((m) => (
                    <div key={m.id} className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-indigo-700">{m.from_identity || 'Anonymous'}</span>
                        <span className="text-[10.5px] font-mono text-zinc-400">
                          {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <FormattedContent
                        content={m.body || ''}
                        onRunInTerminal={(cmd) => onSpawnClaude('astra', undefined, true, `Execute: ${cmd}`)}
                      />
                      {m.body && m.body.length > 60 && (
                        <AIClarificationCard
                          originalText={m.body}
                          contextType="technical"
                          agentId={m.from_identity || 'astra'}
                          onDispatchAction={(prompt) => onSpawnClaude(m.from_identity || 'astra', undefined, true, prompt)}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Reply Composer */}
                <form onSubmit={handleSendThreadReply} className="pt-2 border-t border-zinc-100 flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    placeholder="Reply to this thread..."
                    value={threadReplyInput}
                    onChange={(e) => setThreadReplyInput(e.target.value)}
                    className="flex-1 h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
                  />
                  <button
                    type="submit"
                    disabled={!threadReplyInput.trim()}
                    className="h-9 px-4 bg-zinc-900 hover:bg-black text-white text-xs font-medium rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Send className="w-3 h-3" />
                    <span>Reply</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-400 text-xs">
                Select a thread to view multi-agent conversation
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBPAGE 3: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="flex-1 bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-3xl p-5 shadow-xs flex flex-col overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Broadcast Directives & System Announcements</h2>
              <p className="text-xs text-zinc-500">Official directives, releases, and architectural mandates</p>
            </div>
            <button
              onClick={() => setShowNewAnnouncementModal(true)}
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Announcement</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1">
            {announcements.map((a) => (
              <div key={a.id} className="p-4 rounded-3xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide font-mono flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{a.title}</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {new Date(a.ts).toLocaleDateString()} by @{a.author_identity || 'Executive'}
                  </span>
                </div>
                <FormattedContent content={a.content || ''} />
                {a.content && a.content.length > 80 && (
                  <AIClarificationCard
                    originalText={a.content}
                    contextType="instruction"
                    agentId="orchestrator"
                    onDispatchAction={(prompt) => onSpawnClaude('atlas', undefined, true, prompt)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBPAGE 4: SOCIAL / WATERCOOLER */}
      {activeTab === 'social' && (
        <div className="flex-1 flex gap-3 overflow-hidden">
          {/* Channels Roster */}
          <div className="w-56 bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-3xl p-3 flex flex-col shrink-0 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400 px-2 py-1">
              Social Channels
            </div>
            <div className="space-y-1 mt-1">
              {[
                { id: 'general', name: 'general', desc: 'Team-wide conversation' },
                { id: 'kudos', name: 'kudos', desc: 'Shoutouts & milestones' },
                { id: 'ai-lab', name: 'ai-lab', desc: 'Prompting & LLM experiments' },
                { id: 'random', name: 'random', desc: 'Off-topic & fun' },
              ].map((ch) => {
                const isSelected = activeChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setActiveChannel(ch.id)}
                    className={`w-full p-2.5 rounded-2xl text-left transition flex items-center gap-2 cursor-pointer border ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                        : 'bg-zinc-50/60 hover:bg-zinc-100 text-zinc-700 border-zinc-200/60'
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5 text-zinc-400" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold">{ch.name}</div>
                      <div className={`text-[9.5px] truncate ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
                        {ch.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Social Stream */}
          <div className="flex-1 bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-3xl p-4 flex flex-col shadow-xs overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-bold text-zinc-900">#{activeChannel}</span>
                <span className="text-[11px] text-zinc-400">· {socialPosts.length} posts</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1">
              {socialPosts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-xs">
                  No posts yet in #{activeChannel}. Say hello!
                </div>
              ) : (
                socialPosts.map((p) => (
                  <div key={p.id} className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-1">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-bold text-zinc-900">@{p.author_identity || 'Winston'}</span>
                      <span className="text-zinc-400 font-mono">
                        {new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-700 leading-relaxed whitespace-pre-wrap">{p.content}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleCreateSocialPost} className="pt-2 border-t border-zinc-100 flex items-center gap-2 shrink-0">
              <input
                type="text"
                placeholder={`Post to #${activeChannel}...`}
                value={socialInput}
                onChange={(e) => setSocialInput(e.target.value)}
                className="flex-1 h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
              />
              <button
                type="submit"
                disabled={!socialInput.trim()}
                className="h-9 px-4 bg-zinc-900 hover:bg-black text-white text-xs font-medium rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                <Send className="w-3 h-3" />
                <span>Post</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBPAGE 5: DAILY STANDUPS */}
      {activeTab === 'standups' && (
        <div className="flex-1 flex gap-3 overflow-hidden">
          {/* Standup Dates Roster */}
          <div className="w-64 bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-3xl p-3 flex flex-col shrink-0 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400 px-2 py-1">
              Standup History
            </div>
            <div className="space-y-1.5 mt-1 overflow-y-auto flex-1">
              {standups.map((s) => {
                const isSelected = selectedStandup?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      setSelectedStandup(s);
                      setStandupDigest('');
                    }}
                    className={`p-2.5 rounded-2xl text-left transition cursor-pointer border ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                        : 'bg-zinc-50/60 hover:bg-zinc-100 text-zinc-700 border-zinc-200/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>{s.standup_date}</span>
                      <Calendar className="w-3.5 h-3.5 opacity-60" />
                    </div>
                    <div className={`text-[10px] font-mono mt-1 ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
                      Facilitator: @{s.facilitator || 'Atlas'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Standup Detail View */}
          <div className="flex-1 bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-3xl p-5 flex flex-col shadow-xs overflow-hidden">
            {selectedStandup ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-900">
                      Standup: {selectedStandup.standup_date}
                    </h2>
                    <span className="text-xs text-zinc-400 font-mono">
                      Facilitated by @{selectedStandup.facilitator || 'Atlas'}
                    </span>
                  </div>

                  <button
                    onClick={handleGenerateStandupDigest}
                    disabled={isGeneratingDigest}
                    className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-1.5"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isGeneratingDigest ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingDigest ? 'Extracting Digest...' : 'AI Digest'}</span>
                  </button>
                </div>

                {/* AI Standup Digest Box */}
                {standupDigest && (
                  <div className="my-2.5 p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-indigo-950 shrink-0 font-sans leading-relaxed animate-card-entry">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-900 mb-1 text-[11px] uppercase tracking-wider font-mono">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      <span>Executive Standup Roll-Up</span>
                    </div>
                    <div className="whitespace-pre-wrap">{standupDigest}</div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto py-3 pr-1 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100">
                  <FormattedContent
                    content={selectedStandup.content || ''}
                    onRunInTerminal={(cmd) => onSpawnClaude('atlas', undefined, true, `Execute: ${cmd}`)}
                  />
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-400 text-xs">
                Select a standup entry to view daily roll-call and task commitments
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Thread Modal */}
      {showNewThreadModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-card-entry">
          <div className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-xl max-w-md w-full space-y-3">
            <h3 className="text-sm font-bold text-zinc-900">Start Multi-Agent Discussion Thread</h3>
            <form onSubmit={handleCreateThread} className="space-y-2.5">
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400">Thread Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stories & Profile Platform Adapter Contract"
                  value={newThreadTitle}
                  onChange={(e) => setNewThreadTitle(e.target.value)}
                  className="w-full h-8 px-2.5 mt-0.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400">Target Specialist</label>
                <select
                  value={newThreadTarget}
                  onChange={(e) => setNewThreadTarget(e.target.value)}
                  className="w-full h-8 px-2 mt-0.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none"
                >
                  {AGENTS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400">Initial Message</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Outline the architectural question, requirement, or decision..."
                  value={newThreadMessage}
                  onChange={(e) => setNewThreadMessage(e.target.value)}
                  className="w-full p-2.5 mt-0.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowNewThreadModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-medium cursor-pointer transition shadow-xs"
                >
                  Create Thread
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Announcement Modal */}
      {showNewAnnouncementModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-card-entry">
          <div className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-xl max-w-md w-full space-y-3">
            <h3 className="text-sm font-bold text-zinc-900">Broadcast Executive Directive</h3>
            <form onSubmit={handleCreateAnnouncement} className="space-y-2.5">
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400">Directive Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Staging Service Gated for Client Verification"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  className="w-full h-8 px-2.5 mt-0.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400">Directive Content</label>
                <textarea
                  rows={4}
                  required
                  placeholder="State the decision, guidelines, or deployment notice..."
                  value={announcementContent}
                  onChange={(e) => setAnnouncementContent(e.target.value)}
                  className="w-full p-2.5 mt-0.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowNewAnnouncementModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-medium cursor-pointer transition shadow-xs"
                >
                  Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

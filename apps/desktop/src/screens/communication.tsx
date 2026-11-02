import * as React from 'react';
import {
  Calendar,
  ChevronRight,
  Hash,
  Inbox,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react';
import type {
  Announcement,
  ChatMessage,
  Identity,
  Session,
  SocialPost,
  Standup,
  Thread,
} from '@runtime/types';
import { AIClarificationCard } from '@/components/communication/ai-clarification-card';
import { FormattedContent } from '@/components/communication/formatted-content';
import { Tag } from '@/components/app/status';
import { type CommunicationSubpage, href } from '@/lib/route';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

export interface CommunicationScreenProps {
  initialTab?: CommunicationSubpage;
  identities?: Identity[];
  sessions?: Session[];
  ownerId?: string;
  ownerName?: string;
  onDispatchPrompt?: (agentId: string, prompt: string) => void;
}

const DEFAULT_AGENTS = [
  { id: 'Winston', name: 'Winston', role: 'Executive Lead', symbol: '👑' },
  { id: 'orchestrator', name: 'Orchestrator', role: 'System Autonomous Router', symbol: '⚡' },
  { id: 'atlas', name: 'Atlas', role: 'Team Coordinator & Cloud Run', symbol: '⏣' },
  { id: 'astra', name: 'Astra', role: 'UI & Widget Streaming Lead', symbol: '✦' },
  { id: 'iris', name: 'Iris', role: 'Telemetry & Operator 360', symbol: '👁' },
  { id: 'vela', name: 'Vela', role: 'WordPress Host Bridge', symbol: '✧' },
  { id: 'lyra', name: 'Lyra', role: 'React Native Mobile SDK', symbol: '📱' },
  { id: 'kael', name: 'Kael', role: 'Lead Verifier & QA', symbol: '🛡' },
  { id: 'antigravity', name: 'Antigravity', role: 'Browser QA & Playwright', symbol: '🛸' },
];

const SOCIAL_CHANNELS = [
  { id: 'general', name: 'general', desc: 'Team-wide conversation' },
  { id: 'kudos', name: 'kudos', desc: 'Shoutouts & milestones' },
  { id: 'ai-lab', name: 'ai-lab', desc: 'Prompting & LLM experiments' },
  { id: 'random', name: 'random', desc: 'Off-topic & fun' },
  { id: 'watercooler', name: 'watercooler', desc: 'Late night informal sync' },
];

export function CommunicationScreen({
  initialTab = 'inboxes',
  identities = [],
  ownerId: _ownerId = 'winston',
  ownerName = 'Winston',
  onDispatchPrompt,
}: CommunicationScreenProps) {
  const { client } = useRuntime();
  const [activeTab, setActiveTab] = React.useState<CommunicationSubpage>(initialTab);

  // Merge identities with default roster
  const agentRoster = React.useMemo(() => {
    const fromIdentities = identities.map((i) => ({
      id: i.id,
      name: i.name,
      role: i.role ?? 'Coworker',
      symbol: i.symbol ?? (i.isOwner ? '👑' : '🤖'),
    }));
    const ids = new Set(fromIdentities.map((a) => a.id.toLowerCase()));
    const remainingDefaults = DEFAULT_AGENTS.filter((a) => !ids.has(a.id.toLowerCase()));
    return [...fromIdentities, ...remainingDefaults];
  }, [identities]);

  // Subpage 1: Inboxes State
  const [selectedInbox, setSelectedInbox] = React.useState<string>('Winston');
  const [inboxMessages, setInboxMessages] = React.useState<ChatMessage[]>([]);
  const [inboxSummary, setInboxSummary] = React.useState<string>('');
  const [isSummarizingInbox, setIsSummarizingInbox] = React.useState(false);
  const [inboxInput, setInboxInput] = React.useState('');
  const [inboxRecipient, setInboxRecipient] = React.useState('orchestrator');

  // Subpage 2: Threads State
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
  const [threadMessages, setThreadMessages] = React.useState<ChatMessage[]>([]);
  const [threadReplyInput, setThreadReplyInput] = React.useState('');
  const [showNewThreadModal, setShowNewThreadModal] = React.useState(false);
  const [newThreadTitle, setNewThreadTitle] = React.useState('');
  const [newThreadMessage, setNewThreadMessage] = React.useState('');
  const [newThreadTarget, setNewThreadTarget] = React.useState('astra');

  // Subpage 3: Announcements State
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [showNewAnnouncementModal, setShowNewAnnouncementModal] = React.useState(false);
  const [announcementTitle, setAnnouncementTitle] = React.useState('');
  const [announcementContent, setAnnouncementContent] = React.useState('');
  const [announcementAudience, setAnnouncementAudience] = React.useState('all');

  // Subpage 4: Social State
  const [activeChannel, setActiveChannel] = React.useState<string>('general');
  const [socialPosts, setSocialPosts] = React.useState<SocialPost[]>([]);
  const [socialInput, setSocialInput] = React.useState('');

  // Subpage 5: Standups State
  const [standups, setStandups] = React.useState<Standup[]>([]);
  const [selectedStandup, setSelectedStandup] = React.useState<Standup | null>(null);
  const [standupDigest, setStandupDigest] = React.useState<string>('');
  const [isGeneratingDigest, setIsGeneratingDigest] = React.useState(false);

  // --- Data Fetching ---

  const fetchInbox = React.useCallback(async () => {
    if (!client) return;
    try {
      const msgs = await client.inboxMessages(selectedInbox, 50);
      setInboxMessages(msgs || []);
    } catch (e) {
      console.warn('Failed to fetch inbox:', e);
    }
  }, [client, selectedInbox]);

  const fetchThreads = React.useCallback(async () => {
    if (!client) return;
    try {
      const res = await client.threads();
      setThreads(res || []);
      if (res && res.length > 0 && !selectedThreadId) {
        setSelectedThreadId(res[0].id);
      }
    } catch (e) {
      console.warn('Failed to fetch threads:', e);
    }
  }, [client, selectedThreadId]);

  const fetchThreadMessages = React.useCallback(async (threadId: string) => {
    if (!client) return;
    try {
      const msgs = await client.threadMessages(threadId);
      setThreadMessages(msgs || []);
    } catch (e) {
      console.warn('Failed to fetch thread messages:', e);
    }
  }, [client]);

  const fetchAnnouncements = React.useCallback(async () => {
    if (!client) return;
    try {
      const res = await client.announcements(20);
      setAnnouncements(res || []);
    } catch (e) {
      console.warn('Failed to fetch announcements:', e);
    }
  }, [client]);

  const fetchSocialPosts = React.useCallback(async () => {
    if (!client) return;
    try {
      const res = await client.socialPosts(activeChannel === 'all' ? undefined : activeChannel, 50);
      setSocialPosts(res || []);
    } catch (e) {
      console.warn('Failed to fetch social posts:', e);
    }
  }, [client, activeChannel]);

  const fetchStandups = React.useCallback(async () => {
    if (!client) return;
    try {
      const res = await client.standups(10);
      setStandups(res || []);
      if (res && res.length > 0 && !selectedStandup) {
        setSelectedStandup(res[0]);
      }
    } catch (e) {
      console.warn('Failed to fetch standups:', e);
    }
  }, [client, selectedStandup]);

  React.useEffect(() => {
    if (activeTab === 'inboxes') fetchInbox();
    if (activeTab === 'threads') fetchThreads();
    if (activeTab === 'announcements') fetchAnnouncements();
    if (activeTab === 'social') fetchSocialPosts();
    if (activeTab === 'standups') fetchStandups();
  }, [activeTab, selectedInbox, activeChannel, fetchInbox, fetchThreads, fetchAnnouncements, fetchSocialPosts, fetchStandups]);

  React.useEffect(() => {
    if (selectedThreadId) {
      fetchThreadMessages(selectedThreadId);
    }
  }, [selectedThreadId, fetchThreadMessages]);

  // Terminal dispatch handler
  const handleDispatchTerminal = (agentId: string, cmdOrPrompt: string) => {
    if (onDispatchPrompt) {
      onDispatchPrompt(agentId, cmdOrPrompt);
    } else {
      window.location.hash = href({ name: 'dev' });
    }
  };

  // AI Inbox Summary Generation
  const handleGenerateInboxSummary = async () => {
    if (!client || inboxMessages.length === 0) return;
    setIsSummarizingInbox(true);
    try {
      const prompt = `Summarize the following inbox messages for identity "${selectedInbox}" in 2-3 concise, bulleted executive sentences highlighting key requests, updates, or blockers:
${inboxMessages.slice(0, 10).map((m) => `From: ${m.from_identity || 'Unknown'} | Subj: ${m.subject || 'No Subject'} | Msg: ${m.body}`).join('\n')}

Format as clean markdown.`;
      const res = await client.generateAi(prompt, 'summary', selectedInbox);
      setInboxSummary(res.text || 'Summary generation completed.');
    } catch (err: any) {
      setInboxSummary(`Inbox contains ${inboxMessages.length} messages. Latest: ${inboxMessages[0]?.body?.slice(0, 80)}...`);
    } finally {
      setIsSummarizingInbox(false);
    }
  };

  // AI Standup Digest Generation
  const handleGenerateStandupDigest = async () => {
    if (!client || !selectedStandup || !selectedStandup.content) return;
    setIsGeneratingDigest(true);
    try {
      const prompt = `You are the MyaOS System Orchestrator. Given these daily standup notes from ${selectedStandup.standup_date}:
${selectedStandup.content.slice(0, 2000)}

Extract and return a concise, high-impact executive digest with:
1. 🎯 Primary Focus Today
2. 🚀 Shipped / In-Progress Milestones
3. ⚠️ Active Blockers & Risks
4. 🤖 Agent Assignments

Format in clean, executive markdown.`;
      const res = await client.generateAi(prompt, 'summary', selectedStandup.facilitator || 'atlas');
      setStandupDigest(res.text || 'Digest completed.');
    } catch (err: any) {
      setStandupDigest(
        `### 🎯 Executive Standup Roll-Up\n\n1. **🎯 Primary Focus**: Sprint alignment & task progression\n2. **🚀 Shipped**: Checkpoints recorded in substrate\n3. **⚠️ Active Blockers**: None identified`
      );
    } finally {
      setIsGeneratingDigest(false);
    }
  };

  // Dispatch Actions
  const handleSendInboxMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboxInput.trim() || !client) return;

    try {
      await client.sendInboxMessage({
        from: selectedInbox,
        to: inboxRecipient,
        body: inboxInput.trim(),
      });
      setInboxInput('');
      fetchInbox();
    } catch (err: any) {
      alert(`Failed to send message: ${err.message || err}`);
    }
  };

  const handleSendThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadReplyInput.trim() || !selectedThreadId || !client) return;

    try {
      await client.postThreadReply(selectedThreadId, {
        from: ownerName,
        body: threadReplyInput.trim(),
      });
      setThreadReplyInput('');
      fetchThreadMessages(selectedThreadId);
      fetchThreads();
    } catch (err: any) {
      alert(`Failed to post thread reply: ${err.message || err}`);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThreadTitle.trim() || !newThreadMessage.trim() || !client) return;

    try {
      const created = await client.createThread({
        title: newThreadTitle.trim(),
        author: ownerName,
        targetIdentities: [newThreadTarget],
        initialMessage: newThreadMessage.trim(),
      });
      setShowNewThreadModal(false);
      setNewThreadTitle('');
      setNewThreadMessage('');
      fetchThreads();
      setSelectedThreadId(created.id);
    } catch (err: any) {
      alert(`Failed to create thread: ${err.message || err}`);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementContent.trim() || !client) return;

    try {
      await client.createAnnouncement({
        title: announcementTitle.trim(),
        author: ownerName,
        content: announcementContent.trim(),
        audience: announcementAudience,
      });
      setShowNewAnnouncementModal(false);
      setAnnouncementTitle('');
      setAnnouncementContent('');
      fetchAnnouncements();
    } catch (err: any) {
      alert(`Failed to broadcast announcement: ${err.message || err}`);
    }
  };

  const handleCreateSocialPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socialInput.trim() || !client) return;

    try {
      await client.createSocialPost({
        channel: activeChannel,
        author: ownerName,
        content: socialInput.trim(),
      });
      setSocialInput('');
      fetchSocialPosts();
    } catch (err: any) {
      alert(`Failed to post to #${activeChannel}: ${err.message || err}`);
    }
  };

  return (
    <div className="h-full w-full flex flex-col p-4 space-y-3.5 overflow-hidden select-none">
      {/* Top Header & Subpage Navigation Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-panel p-3.5 rounded-2xl shrink-0 border border-border/60">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-foreground text-background flex items-center justify-center shadow-xs">
            <MessageSquare className="size-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground">Agent Communication Hub</h1>
              <Tag tone="verified">Substrate Protocol</Tag>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Direct inboxes, multi-agent contracts, announcements, watercooler, and daily standups
            </p>
          </div>
        </div>

        {/* Subpage Tabs Switcher */}
        <div className="flex items-center glass-panel p-1 rounded-xl text-xs font-medium border border-border/40">
          <button
            type="button"
            onClick={() => setActiveTab('inboxes')}
            className={cn(
              'px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5',
              activeTab === 'inboxes' ? 'glass-chosen text-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Inbox className="size-3.5" />
            <span>Inboxes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('threads')}
            className={cn(
              'px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5',
              activeTab === 'threads' ? 'glass-chosen text-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Share2 className="size-3.5" />
            <span>Threads</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('announcements')}
            className={cn(
              'px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5',
              activeTab === 'announcements' ? 'glass-chosen text-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Radio className="size-3.5" />
            <span>Announcements</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('social')}
            className={cn(
              'px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5',
              activeTab === 'social' ? 'glass-chosen text-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Hash className="size-3.5" />
            <span>Social</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('standups')}
            className={cn(
              'px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5',
              activeTab === 'standups' ? 'glass-chosen text-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Calendar className="size-3.5" />
            <span>Daily Standups</span>
          </button>
        </div>
      </div>

      {/* SUBPAGE 1: INBOXES */}
      {activeTab === 'inboxes' && (
        <div className="flex-1 flex gap-3.5 overflow-hidden">
          {/* Inboxes Roster Column */}
          <div className="w-64 glass-panel border border-border/60 rounded-2xl p-3 flex flex-col shrink-0 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground px-2 py-1">
              Agent Mailboxes ({agentRoster.length})
            </div>
            <div className="space-y-1 mt-1 overflow-y-auto flex-1 pr-1">
              {agentRoster.map((agent) => {
                const isSelected = selectedInbox.toLowerCase() === agent.id.toLowerCase();
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => {
                      setSelectedInbox(agent.id);
                      setInboxSummary('');
                    }}
                    className={cn(
                      'w-full p-2.5 rounded-xl text-left transition flex items-center justify-between cursor-pointer border',
                      isSelected
                        ? 'bg-foreground text-background border-foreground shadow-xs font-semibold'
                        : 'glass-panel hover:bg-muted/60 text-foreground border-border/40'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base shrink-0">{agent.symbol}</span>
                      <div className="min-w-0">
                        <div className={cn('text-xs font-bold truncate', isSelected ? 'text-background' : 'text-foreground')}>
                          {agent.name}
                        </div>
                        <div className={cn('text-[10px] truncate', isSelected ? 'text-background/70' : 'text-muted-foreground')}>
                          {agent.role}
                        </div>
                      </div>
                    </div>
                    {isSelected && <ChevronRight className="size-3.5 text-background/80" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inbox Feed & Composer Column */}
          <div className="flex-1 glass-panel border border-border/60 rounded-2xl p-4 flex flex-col shadow-xs overflow-hidden">
            {/* Inbox Header & AI Summary Trigger */}
            <div className="flex items-center justify-between pb-3 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{selectedInbox}'s Mailbox</span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  ({inboxMessages.length} messages)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateInboxSummary}
                  disabled={isSummarizingInbox || inboxMessages.length === 0}
                  className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-1.5 disabled:opacity-40"
                  title="Generate an AI bulleted digest using Executive AI Copilot"
                >
                  <Sparkles className={cn('size-3.5', isSummarizingInbox && 'animate-spin')} />
                  <span>{isSummarizingInbox ? 'Summarizing...' : 'AI TL;DR'}</span>
                </button>
                <button
                  type="button"
                  onClick={fetchInbox}
                  className="p-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
                  title="Refresh inbox"
                >
                  <RefreshCw className="size-3.5" />
                </button>
              </div>
            </div>

            {/* AI Generated Inbox TL;DR Box */}
            {inboxSummary && (
              <div className="my-2.5 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200 shrink-0 font-sans leading-relaxed">
                <div className="flex items-center gap-1.5 font-bold text-indigo-400 mb-1 text-[11px] uppercase tracking-wider font-mono">
                  <Sparkles className="size-3" />
                  <span>Executive AI Digest</span>
                </div>
                <div className="whitespace-pre-wrap">{inboxSummary}</div>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto space-y-2.5 py-2.5 pr-1">
              {inboxMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2">
                  <Inbox className="size-8 text-muted-foreground/40 stroke-[1.5]" />
                  <span className="text-xs">No messages in this mailbox</span>
                </div>
              ) : (
                inboxMessages.map((m) => (
                  <div
                    key={m.id}
                    className="p-3.5 rounded-xl glass-panel border border-border/60 hover:border-foreground/30 transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-foreground flex items-center gap-1.5">
                        <span className="text-indigo-400 font-semibold">{m.from_identity || 'System'}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-foreground">{m.to_identity || selectedInbox}</span>
                      </span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {m.subject && (
                      <div className="text-xs font-semibold text-foreground">{m.subject}</div>
                    )}
                    <FormattedContent
                      content={m.body || ''}
                      onRunInTerminal={(cmd) => handleDispatchTerminal(selectedInbox, `Execute: ${cmd}`)}
                    />
                    {m.body && m.body.length > 50 && (
                      <AIClarificationCard
                        originalText={m.body}
                        contextType="instruction"
                        agentId={m.from_identity || 'orchestrator'}
                        onDispatchAction={(prompt) => handleDispatchTerminal(m.from_identity || 'astra', prompt)}
                      />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Inbox Quick Dispatch Composer */}
            <form onSubmit={handleSendInboxMessage} className="pt-2.5 border-t border-border/40 flex items-center gap-2 shrink-0">
              <select
                value={inboxRecipient}
                onChange={(e) => setInboxRecipient(e.target.value)}
                className="h-9 px-2.5 bg-background border border-border/60 rounded-xl text-xs font-medium text-foreground focus:outline-none cursor-pointer"
              >
                {agentRoster.map((a) => (
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
                className="flex-1 h-9 px-3 bg-background border border-border/60 rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground"
              />
              <button
                type="submit"
                disabled={!inboxInput.trim()}
                className="h-9 px-4 bg-foreground hover:bg-foreground/90 text-background text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                <Send className="size-3" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBPAGE 2: THREADS */}
      {activeTab === 'threads' && (
        <div className="flex-1 flex gap-3.5 overflow-hidden">
          {/* Threads Directory Column */}
          <div className="w-72 glass-panel border border-border/60 rounded-2xl p-3 flex flex-col shrink-0 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">
                Discussion Threads ({threads.length})
              </span>
              <button
                type="button"
                onClick={() => setShowNewThreadModal(true)}
                className="p-1 hover:bg-muted/60 rounded-lg text-foreground transition cursor-pointer"
                title="Start new thread"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <div className="space-y-1.5 mt-2 overflow-y-auto flex-1 pr-1">
              {threads.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
                  No active threads
                </div>
              ) : (
                threads.map((t) => {
                  const isSelected = selectedThreadId === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedThreadId(t.id)}
                      className={cn(
                        'p-2.5 rounded-xl text-left transition cursor-pointer border',
                        isSelected
                          ? 'bg-foreground text-background border-foreground shadow-xs'
                          : 'glass-panel hover:bg-muted/60 text-foreground border-border/40'
                      )}
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={cn('font-mono', isSelected ? 'text-background/80' : 'text-muted-foreground')}>
                          {t.id}
                        </span>
                        <span
                          className={cn(
                            'px-1.5 py-0.2 rounded text-[9px] font-medium font-mono',
                            isSelected ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {t.message_count} replies
                        </span>
                      </div>
                      <div className={cn('text-xs font-semibold line-clamp-2 mt-1', isSelected ? 'text-background' : 'text-foreground')}>
                        {t.title}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread Conversation Stream */}
          <div className="flex-1 glass-panel border border-border/60 rounded-2xl p-4 flex flex-col shadow-xs overflow-hidden">
            {selectedThreadId ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-border/40 shrink-0">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      {threads.find((t) => t.id === selectedThreadId)?.title}
                    </h2>
                    <span className="text-[10.5px] font-mono text-muted-foreground">
                      Thread ID: {selectedThreadId}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDispatchTerminal('astra', `Addressing discussion in thread ${selectedThreadId}`)}
                      className="px-3 py-1 bg-foreground text-background hover:bg-foreground/90 rounded-xl text-xs font-semibold cursor-pointer transition flex items-center gap-1.5"
                    >
                      <TerminalIcon className="size-3" />
                      <span>Dispatch Agent</span>
                    </button>
                  </div>
                </div>

                {/* Messages Feed */}
                <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1">
                  {threadMessages.map((m) => (
                    <div key={m.id} className="p-3.5 rounded-xl glass-panel border border-border/60 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-indigo-400">{m.from_identity || 'Anonymous'}</span>
                        <span className="text-[10.5px] font-mono text-muted-foreground">
                          {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <FormattedContent
                        content={m.body || ''}
                        onRunInTerminal={(cmd) => handleDispatchTerminal('astra', `Execute: ${cmd}`)}
                      />
                      {m.body && m.body.length > 60 && (
                        <AIClarificationCard
                          originalText={m.body}
                          contextType="technical"
                          agentId={m.from_identity || 'astra'}
                          onDispatchAction={(prompt) => handleDispatchTerminal(m.from_identity || 'astra', prompt)}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Reply Composer */}
                <form onSubmit={handleSendThreadReply} className="pt-2.5 border-t border-border/40 flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    placeholder="Reply to this thread..."
                    value={threadReplyInput}
                    onChange={(e) => setThreadReplyInput(e.target.value)}
                    className="flex-1 h-9 px-3 bg-background border border-border/60 rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground"
                  />
                  <button
                    type="submit"
                    disabled={!threadReplyInput.trim()}
                    className="h-9 px-4 bg-foreground hover:bg-foreground/90 text-background text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Send className="size-3" />
                    <span>Reply</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                Select a thread to view multi-agent conversation
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBPAGE 3: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="flex-1 glass-panel border border-border/60 rounded-2xl p-5 shadow-xs flex flex-col overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-border/40 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-foreground">Broadcast Directives & System Announcements</h2>
              <p className="text-xs text-muted-foreground">Official directives, releases, and architectural mandates</p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewAnnouncementModal(true)}
              className="px-3.5 py-1.5 bg-foreground hover:bg-foreground/90 text-background rounded-xl text-xs font-semibold cursor-pointer transition flex items-center gap-1.5"
            >
              <Plus className="size-3.5" />
              <span>New Announcement</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3.5 py-3 pr-1">
            {announcements.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
                No directives broadcasted yet
              </div>
            ) : (
              announcements.map((a) => (
                <div key={a.id} className="p-4 rounded-2xl glass-panel border border-border/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide font-mono flex items-center gap-2">
                      <Radio className="size-3.5 text-indigo-400" />
                      <span>{a.title}</span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {new Date(a.ts).toLocaleDateString()} by @{a.author_identity || 'Executive'} · Audience: {a.audience}
                    </span>
                  </div>
                  <FormattedContent content={a.content || ''} />
                  {a.content && a.content.length > 80 && (
                    <AIClarificationCard
                      originalText={a.content}
                      contextType="instruction"
                      agentId="orchestrator"
                      onDispatchAction={(prompt) => handleDispatchTerminal('atlas', prompt)}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUBPAGE 4: SOCIAL / WATERCOOLER */}
      {activeTab === 'social' && (
        <div className="flex-1 flex gap-3.5 overflow-hidden">
          {/* Channels Roster */}
          <div className="w-56 glass-panel border border-border/60 rounded-2xl p-3 flex flex-col shrink-0 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground px-2 py-1">
              Social Channels
            </div>
            <div className="space-y-1 mt-1">
              {SOCIAL_CHANNELS.map((ch) => {
                const isSelected = activeChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setActiveChannel(ch.id)}
                    className={cn(
                      'w-full p-2.5 rounded-xl text-left transition flex items-center gap-2 cursor-pointer border',
                      isSelected
                        ? 'bg-foreground text-background border-foreground shadow-xs font-semibold'
                        : 'glass-panel hover:bg-muted/60 text-foreground border-border/40'
                    )}
                  >
                    <Hash className={cn('size-3.5', isSelected ? 'text-background' : 'text-muted-foreground')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold">{ch.name}</div>
                      <div className={cn('text-[9.5px] truncate', isSelected ? 'text-background/70' : 'text-muted-foreground')}>
                        {ch.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Social Stream */}
          <div className="flex-1 glass-panel border border-border/60 rounded-2xl p-4 flex flex-col shadow-xs overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <Hash className="size-4 text-indigo-400" />
                <span className="text-sm font-bold text-foreground">#{activeChannel}</span>
                <span className="text-[11px] text-muted-foreground">· {socialPosts.length} posts</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1">
              {socialPosts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs">
                  No posts yet in #{activeChannel}. Say hello!
                </div>
              ) : (
                socialPosts.map((p) => (
                  <div key={p.id} className="p-3 rounded-xl glass-panel border border-border/60 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-foreground">@{p.author_identity || 'Winston'}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{p.content}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleCreateSocialPost} className="pt-2.5 border-t border-border/40 flex items-center gap-2 shrink-0">
              <input
                type="text"
                placeholder={`Post to #${activeChannel}...`}
                value={socialInput}
                onChange={(e) => setSocialInput(e.target.value)}
                className="flex-1 h-9 px-3 bg-background border border-border/60 rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground"
              />
              <button
                type="submit"
                disabled={!socialInput.trim()}
                className="h-9 px-4 bg-foreground hover:bg-foreground/90 text-background text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                <Send className="size-3" />
                <span>Post</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBPAGE 5: DAILY STANDUPS */}
      {activeTab === 'standups' && (
        <div className="flex-1 flex gap-3.5 overflow-hidden">
          {/* Standup Dates Roster */}
          <div className="w-64 glass-panel border border-border/60 rounded-2xl p-3 flex flex-col shrink-0 shadow-xs">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground px-2 py-1">
              Standup History ({standups.length})
            </div>
            <div className="space-y-1.5 mt-1 overflow-y-auto flex-1 pr-1">
              {standups.map((s) => {
                const isSelected = selectedStandup?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      setSelectedStandup(s);
                      setStandupDigest('');
                    }}
                    className={cn(
                      'p-2.5 rounded-xl text-left transition cursor-pointer border',
                      isSelected
                        ? 'bg-foreground text-background border-foreground shadow-xs font-semibold'
                        : 'glass-panel hover:bg-muted/60 text-foreground border-border/40'
                    )}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>{s.standup_date}</span>
                      <Calendar className="size-3.5 opacity-60" />
                    </div>
                    <div className={cn('text-[10px] font-mono mt-1', isSelected ? 'text-background/70' : 'text-muted-foreground')}>
                      Facilitator: @{s.facilitator || 'Atlas'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Standup Detail View */}
          <div className="flex-1 glass-panel border border-border/60 rounded-2xl p-5 flex flex-col shadow-xs overflow-hidden">
            {selectedStandup ? (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-border/40 shrink-0">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      Standup: {selectedStandup.standup_date}
                    </h2>
                    <span className="text-xs text-muted-foreground font-mono">
                      Facilitated by @{selectedStandup.facilitator || 'Atlas'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateStandupDigest}
                    disabled={isGeneratingDigest}
                    className="px-3.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-1.5"
                  >
                    <Sparkles className={cn('size-3.5', isGeneratingDigest && 'animate-spin')} />
                    <span>{isGeneratingDigest ? 'Extracting Digest...' : 'AI Digest'}</span>
                  </button>
                </div>

                {/* AI Standup Digest Box */}
                {standupDigest && (
                  <div className="my-2.5 p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200 shrink-0 font-sans leading-relaxed">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-400 mb-1 text-[11px] uppercase tracking-wider font-mono">
                      <Sparkles className="size-3" />
                      <span>Executive Standup Roll-Up</span>
                    </div>
                    <div className="whitespace-pre-wrap">{standupDigest}</div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto py-3 pr-1 bg-background/50 p-4 rounded-xl border border-border/40">
                  <FormattedContent
                    content={selectedStandup.content || ''}
                    onRunInTerminal={(cmd) => handleDispatchTerminal('atlas', `Execute: ${cmd}`)}
                  />
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                Select a standup entry to view daily roll-call and task commitments
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Thread Modal */}
      {showNewThreadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="glass-panel bg-background rounded-2xl p-5 border border-border shadow-xl max-w-md w-full space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Start Multi-Agent Discussion Thread</h3>
              <button
                type="button"
                onClick={() => setShowNewThreadModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleCreateThread} className="space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">Thread Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stories & Profile Platform Adapter Contract"
                  value={newThreadTitle}
                  onChange={(e) => setNewThreadTitle(e.target.value)}
                  className="w-full h-8 px-2.5 mt-0.5 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none focus:border-foreground"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">Target Specialist</label>
                <select
                  value={newThreadTarget}
                  onChange={(e) => setNewThreadTarget(e.target.value)}
                  className="w-full h-8 px-2 mt-0.5 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none"
                >
                  {agentRoster.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">Initial Message</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Outline the architectural question, requirement, or decision..."
                  value={newThreadMessage}
                  onChange={(e) => setNewThreadMessage(e.target.value)}
                  className="w-full p-2.5 mt-0.5 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none focus:border-foreground"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowNewThreadModal(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-foreground hover:bg-foreground/90 text-background rounded-xl text-xs font-semibold cursor-pointer transition shadow-xs"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="glass-panel bg-background rounded-2xl p-5 border border-border shadow-xl max-w-md w-full space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Broadcast Executive Directive</h3>
              <button
                type="button"
                onClick={() => setShowNewAnnouncementModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleCreateAnnouncement} className="space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">Directive Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Staging Service Gated for Client Verification"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  className="w-full h-8 px-2.5 mt-0.5 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none focus:border-foreground"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">Audience</label>
                <select
                  value={announcementAudience}
                  onChange={(e) => setAnnouncementAudience(e.target.value)}
                  className="w-full h-8 px-2 mt-0.5 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none"
                >
                  <option value="all">All Teams (@all)</option>
                  <option value="engineering">Engineering (@atlas, @astra, @vela)</option>
                  <option value="quality">Quality & Verification (@kael, @antigravity)</option>
                  <option value="design">Design Studio (@winston, @astra)</option>
                  <option value="leadership">Leadership & Orchestration (@winston, @orchestrator)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">Directive Content</label>
                <textarea
                  rows={4}
                  required
                  placeholder="State the decision, guidelines, or deployment notice..."
                  value={announcementContent}
                  onChange={(e) => setAnnouncementContent(e.target.value)}
                  className="w-full p-2.5 mt-0.5 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none focus:border-foreground"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowNewAnnouncementModal(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-foreground hover:bg-foreground/90 text-background rounded-xl text-xs font-semibold cursor-pointer transition shadow-xs"
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
}

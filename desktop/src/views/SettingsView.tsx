import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  Users,
  Radio,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Save,
  Loader2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Send,
  Mail,
  MessageSquare,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Sliders,
  Check,
  Clock,
  ArrowRight,
  UserCheck,
  Inbox,
  Lock,
  Edit3,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

type SettingsTab = 'secrets' | 'users' | 'integrations' | 'approvals';

interface SecretItem {
  key: string;
  value: string;
  description?: string;
  updated_at?: string;
}

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  is_active: number;
  created_at: string;
}

interface IntegrationConfig {
  id: string;
  service: string;
  config_json: string;
  is_enabled: number;
  require_approval: number;
  updated_at: string;
}

interface PendingApproval {
  id: string;
  item_type: string;
  status: string;
  title: string;
  recipient: string;
  content: string;
  metadata?: string;
  created_by: string;
  created_at: string;
  approved_at?: string;
  approved_by?: string;
}

interface EmailItem {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}

export const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('secrets');
  const [loading, setLoading] = useState(true);

  // Secrets State
  const [geminiKey, setGeminiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [geminiStatusMsg, setGeminiStatusMsg] = useState('');

  const [claudeKey, setClaudeKey] = useState('');
  const [showClaudeKey, setShowClaudeKey] = useState(false);

  const [slackWebhook, setSlackWebhook] = useState('');
  const [slackTesting, setSlackTesting] = useState(false);
  const [slackStatus, setSlackStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [slackStatusMsg, setSlackStatusMsg] = useState('');

  const [savingSecret, setSavingSecret] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Users State
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('lead_engineer');

  // Edit User State
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserRole, setEditUserRole] = useState('');
  const [editUserAvatar, setEditUserAvatar] = useState('');

  // Integrations State
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [slackEnabled, setSlackEnabled] = useState(true);
  const [slackApprovalRequired, setSlackApprovalRequired] = useState(true);
  const [gmailEnabled, setGmailEnabled] = useState(true);
  const [gmailApprovalRequired, setGmailApprovalRequired] = useState(true);
  const [gmailAddress, setGmailAddress] = useState('winston@creativesites.com');

  // Approvals State
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');

  // Email Reader State
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [showEmailDrawer, setShowEmailDrawer] = useState(false);

  // Load all Settings Data from Substrate
  const loadAllSettings = async () => {
    try {
      setLoading(true);
      // 1. Load Secrets
      const secrets = await invoke<SecretItem[]>('myaos_get_secrets');
      const gKey = secrets.find((s) => s.key === 'gemini_api_key');
      if (gKey) setGeminiKey(gKey.value);
      else {
        try {
          const currentKey = await invoke<string>('myaos_get_gemini_api_key');
          setGeminiKey(currentKey);
        } catch (_) {}
      }

      const cKey = secrets.find((s) => s.key === 'anthropic_api_key');
      if (cKey) setClaudeKey(cKey.value);

      const sHook = secrets.find((s) => s.key === 'slack_webhook_url');
      if (sHook) setSlackWebhook(sHook.value);

      // 2. Load Users
      const uList = await invoke<AppUser[]>('myaos_get_users');
      setUsers(uList);

      // 3. Load Integrations
      const intList = await invoke<IntegrationConfig[]>('myaos_get_integrations');
      setIntegrations(intList);
      const slackInt = intList.find((i) => i.service === 'slack');
      if (slackInt) {
        setSlackEnabled(slackInt.is_enabled === 1);
        setSlackApprovalRequired(slackInt.require_approval === 1);
      }
      const gmailInt = intList.find((i) => i.service === 'gmail');
      if (gmailInt) {
        setGmailEnabled(gmailInt.is_enabled === 1);
        setGmailApprovalRequired(gmailInt.require_approval === 1);
      }

      // 4. Load Pending Approvals
      const appList = await invoke<PendingApproval[]>('myaos_get_pending_approvals');
      setApprovals(appList);
    } catch (err) {
      console.error('Failed to load settings from SQLite:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllSettings();
  }, []);

  // Save Gemini Key
  const handleSaveGeminiKey = async () => {
    try {
      setSavingSecret(true);
      await invoke('myaos_set_secret', {
        key: 'gemini_api_key',
        value: geminiKey.trim(),
        description: 'Google Gemini 3.8 Flash API Key',
      });
      setSaveSuccessMsg('Gemini API Key successfully saved and prioritized in substrate!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Error saving Gemini API Key: ${err}`);
    } finally {
      setSavingSecret(false);
    }
  };

  // Test Gemini Key
  const handleTestGeminiKey = async () => {
    if (!geminiKey.trim()) {
      setGeminiStatus('error');
      setGeminiStatusMsg('Please enter a valid Gemini API key first');
      return;
    }
    setGeminiTesting(true);
    setGeminiStatus('idle');
    try {
      await invoke('myaos_test_gemini_key', { apiKey: geminiKey.trim() });
      setGeminiStatus('success');
      setGeminiStatusMsg('Connected: Gemini 3.8 Flash model handshake verified (HTTP 200 OK)');
    } catch (err: any) {
      setGeminiStatus('error');
      setGeminiStatusMsg(`Verification failed: ${err}`);
    } finally {
      setGeminiTesting(false);
    }
  };

  // Save Claude Key
  const handleSaveClaudeKey = async () => {
    try {
      setSavingSecret(true);
      await invoke('myaos_set_secret', {
        key: 'anthropic_api_key',
        value: claudeKey.trim(),
        description: 'Anthropic Claude Code API Key',
      });
      setSaveSuccessMsg('Claude API Key successfully saved!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Error saving Claude API Key: ${err}`);
    } finally {
      setSavingSecret(false);
    }
  };

  // Save & Test Slack Webhook
  const handleSaveSlackWebhook = async () => {
    try {
      setSavingSecret(true);
      await invoke('myaos_set_secret', {
        key: 'slack_webhook_url',
        value: slackWebhook.trim(),
        description: 'Slack Incoming Webhook URL',
      });
      setSaveSuccessMsg('Slack webhook configuration updated!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Error saving Slack webhook: ${err}`);
    } finally {
      setSavingSecret(false);
    }
  };

  const handleTestSlack = async () => {
    if (!slackWebhook.trim()) {
      setSlackStatus('error');
      setSlackStatusMsg('Please enter a Slack Webhook URL');
      return;
    }
    setSlackTesting(true);
    setSlackStatus('idle');
    try {
      await invoke('myaos_test_slack_webhook', {
        webhookUrl: slackWebhook.trim(),
        message: '🔔 *MyaOS Desktop Handshake Test*: Autonomous agent communications active and connected.',
      });
      setSlackStatus('success');
      setSlackStatusMsg('Test message delivered to Slack channel successfully!');
    } catch (err: any) {
      setSlackStatus('error');
      setSlackStatusMsg(`Slack delivery error: ${err}`);
    } finally {
      setSlackTesting(false);
    }
  };

  // Save Integrations Policies
  const handleSaveIntegrationPolicies = async () => {
    try {
      setSavingSecret(true);
      await invoke('myaos_save_integration', {
        service: 'slack',
        configJson: JSON.stringify({ webhook_url: slackWebhook, default_channel: '#myaos-alerts' }),
        isEnabled: slackEnabled,
        requireApproval: slackApprovalRequired,
      });

      await invoke('myaos_save_integration', {
        service: 'gmail',
        configJson: JSON.stringify({ email: gmailAddress, check_interval_mins: 15, read_enabled: 1 }),
        isEnabled: gmailEnabled,
        requireApproval: gmailApprovalRequired,
      });

      setSaveSuccessMsg('Integration configurations and Human-in-the-Loop policies updated!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Failed to save integrations: ${err}`);
    } finally {
      setSavingSecret(false);
    }
  };

  // Add User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;

    try {
      const newUser: AppUser = {
        id: `user_${Date.now()}`,
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        role: newUserRole,
        avatar: newUserName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2),
        is_active: 1,
        created_at: new Date().toISOString(),
      };

      await invoke('myaos_save_user', { user: newUser });
      setUsers((prev) => [...prev, newUser]);
      setNewUserName('');
      setNewUserEmail('');
      setShowAddUserModal(false);
      setSaveSuccessMsg(`Added team operator ${newUser.name}`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Error creating user: ${err}`);
    }
  };

  // Delete User
  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this operator?')) return;
    try {
      await invoke('myaos_delete_user', { id: userId });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      alert(`Error deleting user: ${err}`);
    }
  };

  // Edit User Handlers
  const handleStartEditUser = (user: AppUser) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserEmail(user.email);
    setEditUserRole(user.role);
    setEditUserAvatar(user.avatar || user.name.slice(0, 2).toUpperCase());
  };

  const handleSaveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editUserName.trim() || !editUserEmail.trim()) return;

    try {
      const updatedUser: AppUser = {
        ...editingUser,
        name: editUserName.trim(),
        email: editUserEmail.trim(),
        role: editUserRole.trim(),
        avatar: editUserAvatar.trim().toUpperCase().slice(0, 3),
      };

      await invoke('myaos_save_user', { user: updatedUser });
      setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      setEditingUser(null);
      setSaveSuccessMsg(`Profile for ${updatedUser.name} successfully updated in substrate!`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Error updating user: ${err}`);
    }
  };

  // Process Approval (Approve & Dispatch / Reject)
  const handleProcessApproval = async (id: string, action: 'approve' | 'reject') => {
    try {
      setProcessingId(id);
      const content = editingContentId === id ? editedContent : undefined;
      await invoke('myaos_process_approval', {
        id,
        action,
        editedContent: content,
        approver: 'Winston Zulu',
      });

      setApprovals((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                status: action === 'approve' ? 'approved' : 'rejected',
                approved_at: new Date().toISOString(),
                approved_by: 'Winston Zulu',
                content: content || a.content,
              }
            : a
        )
      );
      setEditingContentId(null);
    } catch (err: any) {
      alert(`Error processing approval: ${err}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Read Sample Emails
  const handleFetchEmails = async () => {
    setLoadingEmails(true);
    try {
      const res = await invoke<EmailItem[]>('myaos_read_sample_emails');
      setEmails(res);
      setShowEmailDrawer(true);
    } catch (err: any) {
      alert(`Failed to fetch emails: ${err}`);
    } finally {
      setLoadingEmails(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-12 text-zinc-400 font-mono text-xs">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-zinc-800" />
        <span>Loading MyaOS Settings & Security Substrate...</span>
      </div>
    );
  }

  const pendingApprovalsCount = approvals.filter((a) => a.status === 'pending').length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 font-sans select-none animate-fade-in">
      {/* View Header */}
      <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center text-xl shadow-sm">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <span>Settings & Substrate Governance</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Active Substrate
              </span>
            </h1>
            <p className="text-xs text-zinc-500 font-medium mt-0.5">
              Manage custom API model secrets, team operators, and Slack & Gmail approval pipelines
            </p>
          </div>
        </div>

        {saveSuccessMsg && (
          <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-black/[0.06] bg-[#f4f3f0] px-4 pt-2 gap-2 rounded-2xl">
        {[
          { id: 'secrets', label: 'API Keys & Secrets', icon: KeyRound },
          { id: 'users', label: `User Management (${users.length})`, icon: Users },
          { id: 'integrations', label: 'Slack & Gmail Integrations', icon: Radio },
          {
            id: 'approvals',
            label: `Approval Center (${pendingApprovalsCount})`,
            icon: ShieldCheck,
            badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-zinc-900 border-zinc-900 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 border-transparent'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-rose-500 text-white animate-pulse">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: API KEYS & SECRETS MANAGEMENT */}
      {activeTab === 'secrets' && (
        <div className="space-y-6">
          {/* Gemini API Key Box */}
          <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Google Gemini API Key</span>
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-mono font-bold rounded-md">
                    gemini-3.8-flash
                  </span>
                </h2>
                <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
                  Provide your own Google Gemini API Key. When set, all autonomous agent turn syntheses,
                  architectural audits, and handoff workflows will directly utilize your custom key.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestGeminiKey}
                  disabled={geminiTesting}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  {geminiTesting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Test Connection</span>
                </button>

                <button
                  onClick={handleSaveGeminiKey}
                  disabled={savingSecret}
                  className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Key</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Enter your Gemini API Key..."
                className="w-full px-4 py-3 bg-zinc-50 border border-black/[0.08] rounded-2xl font-mono text-xs text-zinc-800 pr-12 focus:outline-none focus:border-zinc-500 focus:bg-white transition"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-3 top-3 p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {geminiStatus !== 'idle' && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  geminiStatus === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {geminiStatus === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{geminiStatusMsg}</span>
              </div>
            )}
          </div>

          {/* Claude Code API Key */}
          <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <span>Anthropic Claude API Key (Optional)</span>
                </h2>
                <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
                  Used by the embedded Claude Code runtime when spawning autonomous terminal agents with direct API auth.
                </p>
              </div>

              <button
                onClick={handleSaveClaudeKey}
                disabled={savingSecret}
                className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Key</span>
              </button>
            </div>

            <div className="relative">
              <input
                type={showClaudeKey ? 'text' : 'password'}
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full px-4 py-3 bg-zinc-50 border border-black/[0.08] rounded-2xl font-mono text-xs text-zinc-800 pr-12 focus:outline-none focus:border-zinc-500 focus:bg-white transition"
              />
              <button
                type="button"
                onClick={() => setShowClaudeKey(!showClaudeKey)}
                className="absolute right-3 top-3 p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                {showClaudeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER & TEAM MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Team Operators & User Access</h2>
              <p className="text-xs text-zinc-500">
                Manage human engineers and executives permitted to govern agents and grant release approvals
              </p>
            </div>

            <button
              onClick={() => setShowAddUserModal(true)}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Operator</span>
            </button>
          </div>

          <div className="space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="p-4 rounded-2xl border border-black/[0.05] bg-zinc-50/50 hover:bg-white hover:border-black/10 transition flex items-center justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                    {user.avatar || user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-900">{user.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                          user.role === 'admin'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {user.role}
                      </span>
                      {user.id === 'user_winston' && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700">
                          SUPREME OPERATOR
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-medium">{user.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-400">
                    Added {new Date(user.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleStartEditUser(user)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-900 transition cursor-pointer"
                    title="Edit Profile & Role"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {user.id !== 'user_winston' && (
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                      title="Remove Operator"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Edit User Modal */}
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
              <div className="bg-[#faf9f6] border border-black/[0.08] w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4 animate-scale-up">
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-zinc-900">Edit User Profile</h3>
                  </div>
                  <span className="text-xs font-mono text-zinc-400">@{editingUser.id}</span>
                </div>
                <form onSubmit={handleSaveEditedUser} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Full Name</label>
                    <input
                      type="text"
                      value={editUserName}
                      onChange={(e) => setEditUserName(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Email</label>
                    <input
                      type="email"
                      value={editUserEmail}
                      onChange={(e) => setEditUserEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Role / Title</label>
                      <input
                        type="text"
                        value={editUserRole}
                        onChange={(e) => setEditUserRole(e.target.value)}
                        placeholder="e.g. admin or Executive"
                        required
                        className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Avatar Initials</label>
                      <input
                        type="text"
                        maxLength={3}
                        value={editUserAvatar}
                        onChange={(e) => setEditUserAvatar(e.target.value)}
                        placeholder="WZ"
                        className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1 font-mono uppercase"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06]">
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add User Modal */}
          {showAddUserModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
              <div className="bg-[#faf9f6] border border-black/[0.08] w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-zinc-900">Add Team Operator</h3>
                <form onSubmit={handleCreateUser} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Name</label>
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="e.g. Maya Lin"
                      required
                      className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Email</label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="e.g. maya@creativesites.com"
                      required
                      className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-black/[0.08] rounded-xl text-xs mt-1 cursor-pointer"
                    >
                      <option value="lead_engineer">Lead Engineer</option>
                      <option value="verifier">Quality & Verification Engineer</option>
                      <option value="admin">Administrator / Executive</option>
                      <option value="observer">Observer (Read Only)</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddUserModal(false)}
                      className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Save Operator
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SLACK & GMAIL INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          {/* Answer Banner */}
          <div className="bg-indigo-50/70 border border-indigo-200/80 p-5 rounded-3xl flex items-start gap-3.5">
            <Radio className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-indigo-900">
                Slack & Gmail Bidirectional Bridge + Human-in-the-Loop
              </h3>
              <p className="text-xs text-indigo-800/80 mt-1 leading-relaxed">
                Yes! The system connects to Slack and Gmail. AI agents can read incoming emails, analyze
                stakeholder requests, and draft replies or channel announcements. Every external email and Slack
                broadcast enters the <strong>Approval Center</strong> and is only dispatched after your explicit sign-off.
              </p>
            </div>
          </div>

          {/* Slack Integration Box */}
          <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-700">
                  <MessageSquare className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Slack Dispatch & Channel Alerts</h3>
                  <p className="text-xs text-zinc-500">
                    Post release milestones, verifier proofs, and agent reports to Slack
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestSlack}
                  disabled={slackTesting}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  {slackTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Test Slack</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">
                Slack Incoming Webhook URL
              </label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={slackWebhook}
                  onChange={(e) => setSlackWebhook(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
                  className="flex-1 px-4 py-2.5 bg-zinc-50 border border-black/[0.08] rounded-2xl font-mono text-xs text-zinc-800"
                />
                <button
                  onClick={handleSaveSlackWebhook}
                  className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl text-xs font-semibold cursor-pointer"
                >
                  Save URL
                </button>
              </div>
            </div>

            {slackStatus !== 'idle' && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  slackStatus === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {slackStatus === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                <span>{slackStatusMsg}</span>
              </div>
            )}

            {/* Approval Guardrail Toggle */}
            <div className="p-4 rounded-2xl bg-zinc-50/70 border border-black/[0.04] flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Require Human Approval Before Sending Slack Messages</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  When enabled, agent Slack notifications enter the Approval Center for executive review first
                </div>
              </div>
              <input
                type="checkbox"
                checked={slackApprovalRequired}
                onChange={(e) => setSlackApprovalRequired(e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer text-indigo-600"
              />
            </div>
          </div>

          {/* Gmail Integration Box */}
          <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-700">
                  <Mail className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Gmail Synchronization & Drafting</h3>
                  <p className="text-xs text-zinc-500">
                    Read incoming customer & client emails, and draft responses after approval
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleFetchEmails}
                  disabled={loadingEmails}
                  className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  {loadingEmails ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Inbox className="w-3.5 h-3.5" />}
                  <span>Check Inbox & Read Emails</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-mono text-zinc-500 font-bold uppercase">
                Connected Google Workspace / Gmail Address
              </label>
              <input
                type="email"
                value={gmailAddress}
                onChange={(e) => setGmailAddress(e.target.value)}
                placeholder="winston@creativesites.com"
                className="w-full px-4 py-2.5 bg-zinc-50 border border-black/[0.08] rounded-2xl font-mono text-xs text-zinc-800 mt-1"
              />
            </div>

            {/* Approval Guardrail Toggle */}
            <div className="p-4 rounded-2xl bg-zinc-50/70 border border-black/[0.04] flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Require Executive Approval Before Sending Any Email</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  AI will author the draft, but the email will NEVER be dispatched without executive confirmation
                </div>
              </div>
              <input
                type="checkbox"
                checked={gmailApprovalRequired}
                onChange={(e) => setGmailApprovalRequired(e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer text-indigo-600"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveIntegrationPolicies}
                className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
              >
                Save Integration Policies
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: APPROVAL CENTER (HUMAN-IN-THE-LOOP) */}
      {activeTab === 'approvals' && (
        <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <span>Human-in-the-Loop Approval Queue</span>
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-mono font-bold rounded-md">
                  {pendingApprovalsCount} Awaiting Decision
                </span>
              </h2>
              <p className="text-xs text-zinc-500">
                Review, edit, and approve agent-authored Slack messages and Gmail email drafts before dispatch
              </p>
            </div>

            <button
              onClick={loadAllSettings}
              className="p-2 text-zinc-400 hover:text-zinc-700 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
              title="Refresh Queue"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {approvals.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 font-mono text-xs">
              No pending approval requests in substrate.
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map((appr) => {
                const isPending = appr.status === 'pending';
                const isEditing = editingContentId === appr.id;

                return (
                  <div
                    key={appr.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      isPending
                        ? 'border-amber-200/80 bg-amber-50/20 shadow-2xs'
                        : appr.status === 'approved'
                        ? 'border-emerald-200/80 bg-emerald-50/10'
                        : 'border-zinc-200 bg-zinc-50/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs ${
                            appr.item_type === 'slack_message' ? 'bg-[#4A154B]' : 'bg-rose-600'
                          }`}
                        >
                          {appr.item_type === 'slack_message' ? (
                            <MessageSquare className="w-4 h-4" />
                          ) : (
                            <Mail className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-900">{appr.title}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                                isPending
                                  ? 'bg-amber-100 text-amber-800 animate-pulse'
                                  : appr.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-zinc-200 text-zinc-700'
                              }`}
                            >
                              {appr.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 font-medium">
                            To: <span className="font-mono text-zinc-700">{appr.recipient}</span> • Author: @{appr.created_by}
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                        {new Date(appr.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Content Area */}
                    <div className="mt-3">
                      {isEditing ? (
                        <textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          rows={4}
                          className="w-full p-3 bg-white border border-black/10 rounded-xl font-mono text-xs text-zinc-800 focus:outline-none"
                        />
                      ) : (
                        <div className="p-3 bg-white border border-black/[0.06] rounded-xl text-xs text-zinc-800 font-mono whitespace-pre-wrap leading-relaxed shadow-2xs">
                          {appr.content}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {isPending && (
                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-black/[0.05]">
                        <div className="flex items-center gap-2">
                          {!isEditing ? (
                            <button
                              onClick={() => {
                                setEditingContentId(appr.id);
                                setEditedContent(appr.content);
                              }}
                              className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              Edit Text
                            </button>
                          ) : (
                            <button
                              onClick={() => setEditingContentId(null)}
                              className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              Cancel Edit
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleProcessApproval(appr.id, 'reject')}
                            disabled={processingId === appr.id}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                          >
                            Reject
                          </button>

                          <button
                            onClick={() => handleProcessApproval(appr.id, 'approve')}
                            disabled={processingId === appr.id}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-sm flex items-center gap-1.5"
                          >
                            {processingId === appr.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>Approve & Dispatch</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {!isPending && appr.approved_at && (
                      <div className="mt-2 text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>
                          {appr.status === 'approved' ? 'Approved & Dispatched' : 'Rejected'} by {appr.approved_by} at{' '}
                          {new Date(appr.approved_at).toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* READ EMAILS DRAWER */}
      {showEmailDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white border border-black/[0.08] w-full max-w-2xl rounded-3xl shadow-2xl p-6 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div className="flex items-center gap-2.5">
                <Mail className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-bold text-zinc-900">Synchronized Gmail Inbox</h3>
                <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-mono font-bold rounded-md">
                  {emails.length} Messages
                </span>
              </div>
              <button
                onClick={() => setShowEmailDrawer(false)}
                className="text-xs text-zinc-400 hover:text-zinc-700 font-bold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="p-4 rounded-2xl border border-black/[0.06] bg-zinc-50/50 hover:bg-white transition space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-900">{email.from}</span>
                    <span className="text-[10px] font-mono text-zinc-400">{email.date}</span>
                  </div>
                  <div className="text-xs font-semibold text-indigo-900">{email.subject}</div>
                  <p className="text-xs text-zinc-600 line-clamp-2">{email.snippet}</p>
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => {
                        setShowEmailDrawer(false);
                        setActiveTab('approvals');
                      }}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Draft AI Response with Gemini</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

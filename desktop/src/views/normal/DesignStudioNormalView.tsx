import React, { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Send,
  Monitor,
  Tablet,
  Smartphone,
  MessageSquare,
  Code2,
  Sparkle,
  X,
  Loader2,
  RefreshCw,
  FolderGit2,
  ChevronDown,
} from 'lucide-react';
import { DesignComment } from '../../types/normalMode';
import {
  reconstructProjectScreenFromSource,
  ProjectUiScanData,
  DesignPhilosophyData,
} from '../../services/geminiOrchestrator';
import { extractDesignPhilosophy } from '../../services/designSystemExtractor';

interface DesignStudioNormalViewProps {
  currentWorkspace: string;
  onBuildWithMyaOS: (projectTitle: string, screenHtml: string, workspacePath: string) => void;
}

interface NormalChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  tokensUsed?: number;
  costUsd?: number;
}

interface RealDesignProject {
  id: string;
  name: string;
  kind: 'wordpress' | 'nextjs' | 'widget' | 'react-native';
  workspacePath: string;
  fidelityNote: string;
}

// Phase 1 stopgap: a hardcoded list of the real Myavana repos on disk.
// TODO: replace with `registered_workspaces` once project registration is
// designed (see community/threads/026_myaos_design_studio_vision_and_audit.md §5).
const REAL_PROJECTS: RealDesignProject[] = [
  {
    id: 'myavana_hair_journey',
    name: 'Myavana Hair Journey',
    kind: 'wordpress',
    workspacePath:
      '/Users/winstonzulu/Local Sites/myavana-hair-journey/app/public/wp-content/plugins/myavana-hair-journey-next',
    fidelityNote: 'Faithful recreation from real PHP templates + tokens.css',
  },
  {
    id: 'myavana_chatbot_dashboard',
    name: 'Myavana Chatbot Dashboard',
    kind: 'nextjs',
    workspacePath: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot-Dashboard',
    fidelityNote: 'Faithful recreation from real Next.js routes + globals.css',
  },
  {
    id: 'myavana_chatbot_widget',
    name: 'Myavana Chatbot Widget',
    kind: 'widget',
    workspacePath: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/widget',
    fidelityNote: 'Faithful recreation from the real embeddable widget source',
  },
  {
    id: 'myavana_mobile_app',
    name: 'Myavana Mobile App (React Native)',
    kind: 'react-native',
    workspacePath: '/Users/winstonzulu/WebstormProjects/MyAvana_FrontEnd_RN',
    fidelityNote: 'HTML approximation styled to match — React Native has no DOM to render faithfully',
  },
];

interface ScreenVersionRow {
  id: string;
  project_id: string;
  screen_name: string;
  flow_name: string | null;
  version: number;
  viewport: string;
  html_content: string;
  prompt: string;
  change_summary: string | null;
  is_approved: number;
  created_at: string;
}

interface PhilosophyRow {
  id: string;
  project_id: string;
  brand_name: string;
  heading_font: string;
  body_font: string;
  code_font: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  surface_color: string;
  border_radius: string;
  tokens_json?: string;
  philosophy_markdown?: string;
  updated_at: string;
}

function philosophyRowToData(row: PhilosophyRow): DesignPhilosophyData {
  return {
    brandName: row.brand_name,
    headingFont: row.heading_font,
    bodyFont: row.body_font,
    codeFont: row.code_font,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    surfaceColor: row.surface_color,
    borderRadius: row.border_radius,
    tokensJson: row.tokens_json,
    philosophyMarkdown: row.philosophy_markdown,
  };
}

function philosophyDataToRow(projectId: string, data: DesignPhilosophyData): PhilosophyRow {
  return {
    id: `phil_${projectId}`,
    project_id: projectId,
    brand_name: data.brandName,
    heading_font: data.headingFont,
    body_font: data.bodyFont,
    code_font: data.codeFont,
    primary_color: data.primaryColor,
    secondary_color: data.secondaryColor,
    accent_color: data.accentColor,
    surface_color: data.surfaceColor,
    border_radius: data.borderRadius,
    tokens_json: data.tokensJson,
    philosophy_markdown: data.philosophyMarkdown,
    updated_at: new Date().toISOString(),
  };
}

interface ScreenRef {
  key: string; // stable lowercase id used for generation + version storage
  label: string; // human display label
  flow: string;
}

function cleanLabel(raw: string): string {
  const base = (raw.split('/').pop() || raw).replace(/\.(tsx|jsx|js|php|vue|html)$/i, '');
  const spaced = base.replace(/[-_]+/g, ' ').trim();
  const label = spaced.length ? spaced.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Home';
  return label === 'Page' || label === 'Index' ? 'Home' : label;
}

function deriveScreens(scan: ProjectUiScanData): ScreenRef[] {
  const byKey = new Map<string, ScreenRef>();
  scan.screens.forEach((s) => {
    const key = s.replace(/\\/g, '/').replace(/\.(tsx|jsx|js|php|vue|html)$/i, '').toLowerCase();
    if (key && !byKey.has(key)) byKey.set(key, { key, label: cleanLabel(s), flow: 'Views' });
  });
  scan.routes.forEach((r) => {
    const key = r.replace(/\\/g, '/').replace(/\.(tsx|jsx|js|php|vue|html)$/i, '').toLowerCase();
    if (key && !byKey.has(key)) byKey.set(key, { key, label: cleanLabel(r), flow: 'Pages' });
  });
  return Array.from(byKey.values()).slice(0, 16);
}

export const DesignStudioNormalView: React.FC<DesignStudioNormalViewProps> = ({ currentWorkspace, onBuildWithMyaOS }) => {
  const currentWorkspaceProject: RealDesignProject = {
    id: 'current_workspace',
    name: 'Current workspace',
    kind: 'nextjs',
    workspacePath: currentWorkspace,
    fidelityNote: 'Scan and design the project currently open in MyaOS',
  };
  const availableProjects = currentWorkspace && !REAL_PROJECTS.some((p) => p.workspacePath === currentWorkspace)
    ? [...REAL_PROJECTS, currentWorkspaceProject]
    : REAL_PROJECTS;
  const [selectedProjectId, setSelectedProjectId] = useState(REAL_PROJECTS[0].id);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const project = availableProjects.find((p) => p.id === selectedProjectId) || REAL_PROJECTS[0];

  const [isScanning, setIsScanning] = useState(false);
  const [scanAttempt, setScanAttempt] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [scanData, setScanData] = useState<ProjectUiScanData | null>(null);
  const [philosophy, setPhilosophy] = useState<DesignPhilosophyData | null>(null);
  const [screens, setScreens] = useState<ScreenRef[]>([]);
  const [activeScreenKey, setActiveScreenKey] = useState<string | null>(null);
  const [versionsByScreen, setVersionsByScreen] = useState<Record<string, ScreenVersionRow>>({});

  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [chatPrompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ selector: string; text: string } | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [showAddCommentPin, setShowAddCommentPin] = useState(false);
  const [commentsByScreen, setCommentsByScreen] = useState<Record<string, DesignComment[]>>({});
  const [chatMessages, setChatMessages] = useState<NormalChatMessage[]>([]);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const activeScreen = screens.find((s) => s.key === activeScreenKey) || null;
  const activeVersion = activeScreenKey ? versionsByScreen[activeScreenKey] : undefined;
  const activeComments = (activeScreenKey && commentsByScreen[activeScreenKey]) || [];

  const pushMessage = (msg: Omit<NormalChatMessage, 'id' | 'timestamp'>) => {
    setChatMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const runReconstruction = async (
    screenKey: string,
    flowName: string,
    instruction?: string,
    sourceScan = scanData,
    sourcePhilosophy = philosophy,
  ) => {
    if (!sourceScan || !sourcePhilosophy || isGenerating) return;
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const result = await reconstructProjectScreenFromSource(
        screenKey,
        flowName,
        sourceScan,
        sourcePhilosophy,
        viewport,
        instruction
      );
      const nextVersion = (versionsByScreen[screenKey]?.version || 0) + 1;
      const versionRow: ScreenVersionRow = {
        id: `screenver_${project.id}_${screenKey}_${Date.now()}`,
        project_id: project.id,
        screen_name: screenKey,
        flow_name: flowName,
        version: nextVersion,
        viewport,
        html_content: result.html,
        prompt: instruction || `Initial faithful reconstruction of ${screenKey}`,
        change_summary: result.summary,
        is_approved: 0,
        created_at: new Date().toISOString(),
      };
      await invoke('myaos_save_project_screen_version', { version: versionRow });
      setVersionsByScreen((prev) => ({ ...prev, [screenKey]: versionRow }));
      pushMessage({
        sender: 'assistant',
        text: `${instruction ? 'Updated' : 'Reconstructed'} **${cleanLabel(screenKey)}** (v${nextVersion}) from the real source of ${project.name}. ${result.summary}`,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
      });
    } catch (e: any) {
      console.error('Faithful reconstruction failed:', e);
      setGenerationError(e?.message || String(e) || 'Design generation failed.');
      pushMessage({
        sender: 'system',
        text: `Reconstruction failed: ${e?.message || e || 'Unknown error'}. Please try again.`,
      });
    } finally {
      setIsGenerating(false);
      setSelectedElement(null);
    }
  };

  // Scan the selected real project on load / project change
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsScanning(true);
      setScanError(null);
      setGenerationError(null);
      setApprovalError(null);
      setScanData(null);
      setPhilosophy(null);
      setScreens([]);
      setActiveScreenKey(null);
      setVersionsByScreen({});
      setCommentsByScreen({});
      setChatMessages([
        {
          id: 'msg_scanning',
          sender: 'system',
          text: `Scanning real source of **${project.name}**...`,
          timestamp: 'Just now',
        },
      ]);

      try {
        const scan = await invoke<ProjectUiScanData>('myaos_inspect_workspace_ui_structure', {
          projectId: project.id,
          workspacePath: project.workspacePath,
        });
        if (cancelled) return;

        if (scan.totalFiles === 0) {
          setScanError(`No UI source files found at ${project.workspacePath}. Check the path still exists.`);
          setIsScanning(false);
          return;
        }

        setScanData(scan);
        const derivedScreens = deriveScreens(scan);
        setScreens(derivedScreens);

        let philData: DesignPhilosophyData;
        try {
          const savedRow = await invoke<PhilosophyRow | null>('myaos_get_project_design_philosophy', {
            projectId: project.id,
          });
          if (savedRow) {
            philData = philosophyRowToData(savedRow);
          } else {
            philData = extractDesignPhilosophy(project.id, project.name, scan);
            invoke('myaos_save_project_design_philosophy', {
              philosophy: philosophyDataToRow(project.id, philData),
            }).catch(() => {});
          }
        } catch {
          philData = extractDesignPhilosophy(project.id, project.name, scan);
        }
        if (cancelled) return;
        setPhilosophy(philData);

        let existingVersions: ScreenVersionRow[] = [];
        try {
          existingVersions = await invoke<ScreenVersionRow[]>('myaos_list_project_screen_versions', {
            projectId: project.id,
          });
        } catch {
          existingVersions = [];
        }
        if (cancelled) return;

        const latestByScreen: Record<string, ScreenVersionRow> = {};
        existingVersions.forEach((v) => {
          if (!latestByScreen[v.screen_name]) latestByScreen[v.screen_name] = v; // query orders version DESC
        });
        setVersionsByScreen(latestByScreen);

        const firstScreen = derivedScreens[0];
        if (firstScreen) {
          setActiveScreenKey(firstScreen.key);
          const hasVersion = latestByScreen[firstScreen.key];
          pushMessage({
            sender: 'system',
            text: `Scanned **${scan.totalFiles} real files** in ${project.name} (${derivedScreens.length} screens detected). ${
              hasVersion
                ? `Loaded saved v${hasVersion.version} of **${firstScreen.label}**.`
                : `Building a faithful first pass of **${firstScreen.label}**...`
            }`,
          });
          if (!hasVersion) {
            await runReconstruction(firstScreen.key, firstScreen.flow, undefined, scan, philData);
          }
        } else {
          setScanError('Scan completed but no screens/routes could be identified in this project.');
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Workspace scan failed:', err);
          setScanError(err?.message || String(err));
        }
      } finally {
        if (!cancelled) setIsScanning(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, scanAttempt]);

  // Handle postMessage from preview iframe for click-to-pin element selection
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CANVAS_ELEMENT_SELECTED') {
        setSelectedElement({
          selector: event.data.selector,
          text: event.data.text || event.data.selector,
        });
        setShowAddCommentPin(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isGenerating]);

  const handleSelectScreen = async (screen: ScreenRef) => {
    setActiveScreenKey(screen.key);
    setSelectedElement(null);
    setShowAddCommentPin(false);
    if (!versionsByScreen[screen.key]) {
      pushMessage({ sender: 'system', text: `Building a faithful first pass of **${screen.label}**...` });
      await runReconstruction(screen.key, screen.flow);
    }
  };

  const handleSend = async () => {
    if (!chatPrompt.trim() || isGenerating || !activeScreen) return;
    const instruction = chatPrompt.trim();
    setPrompt('');
    pushMessage({ sender: 'user', text: instruction });
    const elementContext = selectedElement
      ? `Focus the change on the selected element: \`${selectedElement.selector}\` containing text: "${selectedElement.text}".`
      : '';
    await runReconstruction(activeScreen.key, activeScreen.flow, [instruction, elementContext].filter(Boolean).join('\n'));
  };

  const handleApprove = async () => {
    if (!activeScreen || !activeVersion || activeVersion.is_approved) return;
    setApprovalError(null);
    const approved = { ...activeVersion, is_approved: 1 };
    try {
      await invoke('myaos_save_project_screen_version', { version: approved });
      setVersionsByScreen((prev) => ({ ...prev, [activeScreen.key]: approved }));
      pushMessage({ sender: 'system', text: `Approved **${activeScreen.label} v${approved.version}**. Starting the implementation session in ${project.name}.` });
      onBuildWithMyaOS(`${project.name} — ${activeScreen.label} v${approved.version}`, approved.html_content, project.workspacePath);
    } catch (e: any) {
      setApprovalError(`Could not approve this design: ${e?.message || e}`);
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !activeScreenKey) return;
    const newComment: DesignComment = {
      id: `c_${Date.now()}`,
      screenId: activeScreenKey,
      selector: selectedElement?.selector || 'body',
      text: newCommentText.trim(),
      author: 'Winston',
      xPercentage: 50,
      yPercentage: 30,
      status: 'open',
      createdAt: 'Just now',
    };
    setCommentsByScreen((prev) => ({
      ...prev,
      [activeScreenKey]: [...(prev[activeScreenKey] || []), newComment],
    }));
    setNewCommentText('');
    setShowAddCommentPin(false);
  };

  const viewportWidthClass = useMemo(
    () => (viewport === 'desktop' ? 'w-full max-w-5xl' : viewport === 'tablet' ? 'w-[768px]' : 'w-[390px]'),
    [viewport]
  );

  return (
    <div className="h-full w-full bg-[#faf9f6] flex flex-col font-sans select-none overflow-hidden rounded-2xl border border-black/[0.06]">
      {/* ──────────────────  TOP HEADER BAR  ────────────────── */}
      <header className="h-11 px-4 bg-white border-b border-black/[0.06] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-fuchsia-600 text-white font-bold flex items-center justify-center text-xs shadow-2xs">
            MU
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-900">MyaOS Design Studio</span>
            <span className="text-[10px] font-mono text-fuchsia-700 bg-fuchsia-50 px-2 py-0.5 rounded-full border border-fuchsia-200">
              Muse · Gemini API
            </span>
          </div>
        </div>

        {/* Project Picker */}
        <div className="relative ml-4">
          <button
            onClick={() => setShowProjectMenu((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 cursor-pointer"
          >
            <FolderGit2 className="w-3.5 h-3.5 text-zinc-500" />
            <span>{project.name}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>
          {showProjectMenu && (
            <div className="absolute top-8 left-0 w-72 bg-white border border-black/10 rounded-xl shadow-xl z-50 p-1.5 space-y-0.5">
              {availableProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setShowProjectMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition cursor-pointer ${
                    p.id === selectedProjectId ? 'bg-fuchsia-50 text-fuchsia-950' : 'hover:bg-zinc-50 text-zinc-700'
                  }`}
                >
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">{p.fidelityNote}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Screen Tabs */}
        <div className="flex items-center gap-1 border-l border-zinc-200 pl-4 mr-auto ml-4 overflow-x-auto">
          {screens.map((scr) => (
            <button
              key={scr.key}
              onClick={() => handleSelectScreen(scr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                activeScreenKey === scr.key
                  ? 'bg-zinc-100 text-zinc-900 font-bold'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {scr.label}
            </button>
          ))}
        </div>

        {/* Viewport Switcher Pills */}
        <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-xl border border-zinc-200/60">
          <button
            onClick={() => setViewport('desktop')}
            className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
              viewport === 'desktop' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
            }`}
            title="Desktop Viewport (1440px)"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewport('tablet')}
            className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
              viewport === 'tablet' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
            }`}
            title="Tablet Viewport (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewport('mobile')}
            className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
              viewport === 'mobile' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
            }`}
            title="Mobile Viewport (390px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Handoff */}
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={handleApprove}
            disabled={!activeVersion || !activeScreen || isGenerating || activeVersion.is_approved === 1}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer active:scale-[0.97]"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>{activeVersion?.is_approved ? 'Approved · Build started' : 'Approve & build'}</span>
          </button>
        </div>
      </header>

      {/* ──────────────────  3-LEVEL MAIN BODY  ────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-12 overflow-hidden">
        {/* LEFT PANEL: Conversation & Controls */}
        <div className="col-span-4 bg-white border-r border-black/[0.06] flex flex-col h-full min-w-[320px] overflow-hidden">
          <div className="p-3.5 border-b border-zinc-100 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isScanning || isGenerating ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="text-xs font-bold text-zinc-900">Design Assistant</span>
              </div>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono truncate" title={project.workspacePath}>
              {project.workspacePath}
            </div>
          </div>

          <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 text-xs leading-relaxed">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-2xl border space-y-2 ${
                  msg.sender === 'user'
                    ? 'bg-indigo-50 border-indigo-100'
                    : msg.sender === 'system'
                    ? 'bg-amber-50 border-amber-100'
                    : 'bg-zinc-50 border-zinc-100'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span className="font-bold">
                    {msg.sender === 'user' ? 'Winston' : msg.sender === 'system' ? 'System' : 'Muse [Design Specialist]'}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>
                <div
                  className={`text-zinc-700 ${msg.sender === 'user' ? 'text-indigo-950 font-medium' : ''}`}
                  dangerouslySetInnerHTML={{
                    __html: msg.text
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/`(.*?)`/g, '<code class="bg-black/5 px-1 py-0.5 rounded font-mono text-[10.5px]">$1</code>'),
                  }}
                />
                {(msg.tokensUsed !== undefined || msg.costUsd !== undefined) && (
                  <div className="text-[10px] font-mono text-zinc-400 pt-1.5 border-t border-zinc-100 flex items-center gap-2">
                    <span>Tokens: {msg.tokensUsed}</span>
                    <span>·</span>
                    <span>Cost: ${msg.costUsd?.toFixed(4)}</span>
                  </div>
                )}
              </div>
            ))}

            {(isGenerating || isScanning) && (
              <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-2xl animate-pulse space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                  <Loader2 className="w-3 h-3 animate-spin text-fuchsia-600" />
                  <span>{isScanning ? 'Scanning real project source...' : 'Muse is generating faithful HTML...'}</span>
                </div>
              </div>
            )}

            {scanError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-red-800 text-[11px] space-y-2">
                <div>{scanError}</div>
                <button onClick={() => setScanAttempt((attempt) => attempt + 1)} disabled={isScanning} className="px-2.5 py-1 rounded-lg bg-white border border-red-200 font-semibold hover:bg-red-100 disabled:opacity-50">Retry scan</button>
              </div>
            )}
            {generationError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-red-800 text-[11px] space-y-2">
                <div>{generationError}</div>
                {activeScreen && <button onClick={() => runReconstruction(activeScreen.key, activeScreen.flow)} disabled={isGenerating || isScanning} className="px-2.5 py-1 rounded-lg bg-white border border-red-200 font-semibold hover:bg-red-100 disabled:opacity-50">Retry design generation</button>}
              </div>
            )}
            {approvalError && <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-red-800 text-[11px]">{approvalError}</div>}
          </div>

          {philosophy && (
            <div className="px-4 py-2 border-t border-zinc-100 bg-fuchsia-50/20 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-800 font-bold">
                Real Design Tokens ({project.name})
              </span>
              <div className="flex flex-wrap gap-1">
                <span className="px-2 py-0.5 rounded-md bg-white text-zinc-700 text-[10px] font-mono border border-zinc-200">
                  Font: {philosophy.headingFont}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white text-zinc-700 text-[10px] font-mono border border-zinc-200 flex items-center gap-1">
                  Primary: <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ backgroundColor: philosophy.primaryColor }} />{' '}
                  {philosophy.primaryColor}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white text-zinc-700 text-[10px] font-mono border border-zinc-200 flex items-center gap-1">
                  Accent: <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ backgroundColor: philosophy.accentColor }} />{' '}
                  {philosophy.accentColor}
                </span>
              </div>
            </div>
          )}

          {/* Composer */}
          <div className="p-3 border-t border-zinc-100 space-y-2 bg-white">
            {selectedElement && (
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-fuchsia-50 border border-fuchsia-150 rounded-xl text-[10.5px]">
                <div className="flex items-center gap-1.5 text-fuchsia-950 font-medium truncate">
                  <Sparkle className="w-3 h-3 text-fuchsia-600 shrink-0" />
                  <span>
                    Targeting: <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-[10px] text-fuchsia-800">{selectedElement.selector}</code>
                  </span>
                </div>
                <X className="w-3.5 h-3.5 text-fuchsia-400 hover:text-fuchsia-600 cursor-pointer" onClick={() => setSelectedElement(null)} />
              </div>
            )}
            <div className="flex items-end gap-2 bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 focus-within:border-fuchsia-500 transition">
              <textarea
                rows={2}
                value={chatPrompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={activeScreen ? `Describe a change to ${activeScreen.label}...` : 'Select a screen first...'}
                disabled={!activeScreen}
                className="w-full bg-transparent resize-none text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none leading-relaxed disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!chatPrompt.trim() || isGenerating || !activeScreen}
                className="h-8 w-8 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-40 text-white rounded-lg flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* CENTER/RIGHT: Live Interactive Canvas */}
        <div className="col-span-8 bg-[#f4f3f0] flex flex-col h-full overflow-hidden relative">
          <div className="h-9 px-4 bg-white/80 backdrop-blur-md border-b border-black/[0.04] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-700">{activeScreen?.label || 'No screen selected'}</span>
              {activeVersion && <span className="text-[10px] font-mono text-zinc-400">v{activeVersion.version}</span>}
            </div>

            <div className="flex items-center gap-2">
              {activeScreen && (
                <button
                  onClick={() => runReconstruction(activeScreen.key, activeScreen.flow)}
                  disabled={isGenerating}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40"
                  title="Regenerate from real source"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={() => setShowAddCommentPin(!showAddCommentPin)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                  showAddCommentPin ? 'bg-amber-500 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Add Comment</span>
              </button>
            </div>
          </div>

          {showAddCommentPin && (
            <form
              onSubmit={handleAddComment}
              className="absolute top-12 left-1/2 -translate-x-1/2 w-80 bg-white border border-black/10 rounded-2xl p-3 shadow-xl z-50 space-y-2"
            >
              <div className="text-xs font-bold text-zinc-900 flex items-center justify-between">
                <span>Pin Feedback to Canvas</span>
                <X className="w-3.5 h-3.5 text-zinc-400 cursor-pointer" onClick={() => setShowAddCommentPin(false)} />
              </div>
              {selectedElement && (
                <div className="p-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-[10px] font-mono text-indigo-900 truncate">
                  Target: {selectedElement.selector}
                </div>
              )}
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="e.g. 'Make this CTA button green'..."
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-zinc-800 focus:outline-none focus:border-indigo-500"
              />
              <button type="submit" className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold">
                Save Comment Pin
              </button>
            </form>
          )}

          <div className="flex-1 p-6 overflow-auto flex justify-center items-start">
            {activeVersion ? (
              <div className={`${viewportWidthClass} bg-white rounded-2xl shadow-xl overflow-hidden border border-black/10 transition-all duration-300 relative`}>
                <iframe
                  srcDoc={activeVersion.html_content}
                  title="MyaOS Faithful Design Prototype Canvas"
                  className="w-full h-[640px] border-0 select-text"
                />
              </div>
            ) : (
              <div className="text-xs text-zinc-400 mt-24 text-center max-w-xs">
                {isScanning || isGenerating
                  ? 'Building your first faithful recreation...'
                  : scanError
                  ? scanError
                  : 'Select a screen to see its faithful recreation.'}
              </div>
            )}
          </div>

          {activeComments.length > 0 && (
            <div className="px-4 py-2 border-t border-black/[0.04] bg-amber-50/20 max-h-32 overflow-y-auto space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-800 font-bold flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-amber-600" />
                <span>Comments on This Screen ({activeComments.length})</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeComments.map((c) => (
                  <div key={c.id} className="p-1.5 bg-amber-50/80 border border-amber-200 rounded-xl text-[10.5px]">
                    <span className="font-mono text-[9px] text-amber-800 font-bold">Winston on `{c.selector}`: </span>
                    <span className="text-amber-950 font-medium">{c.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

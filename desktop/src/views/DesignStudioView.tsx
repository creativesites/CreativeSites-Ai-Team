import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Palette,
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  Minimize2,
  Code,
  Eye,
  Columns,
  Download,
  Copy,
  Check,
  Sparkles,
  Send,
  RefreshCw,
  FolderOpen,
  Trash2,
  ExternalLink,
  Layers,
  Zap,
  Layout,
  Component,
  X,
  History,
  GitBranch,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ArrowRight,
  GitCommit,
  UploadCloud,
  ChevronDown,
  BookOpen,
  Terminal,
  MousePointer,
  Crosshair,
  FileText,
  FileCheck,
  LayoutGrid,
  ZoomIn,
  ZoomOut,
  Plus,
  FolderPlus,
  Navigation,
  Play,
  Film,
  Loader2,
} from 'lucide-react';
import { AddProjectModal } from '../components/AddProjectModal';
import {
  generateHtmlDesignWithGemini,
  reconstructProjectScreenFromSource,
  generateFaithfulCodebaseFallback,
  convertHtmlToReactTsx,
  generateDesignUpdateSpecification,
  DesignGenerationOptions,
  ProjectUiScanData,
  DesignPhilosophyData,
} from '../services/geminiOrchestrator';

export type ViewportMode = 'desktop' | 'tablet' | 'mobile' | 'fluid';
export type DisplayMode = 'preview' | 'board' | 'tsx' | 'code' | 'split';

interface ProjectOption {
  id: string;
  name: string;
  repo: string;
  description: string;
}

interface ScreenVersion {
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

interface ProjectPhilosophy {
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

interface ProjectComponentItem {
  id: string;
  project_id: string;
  name: string;
  category: string;
  source_file?: string;
  html_preview?: string;
  created_at: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  version?: number;
  timestamp: string;
  taskData?: {
    taskId: string;
    screenName: string;
    version: number;
    branch: string;
    agent: string;
    spec: string;
    pushed?: boolean;
  };
}

export const DesignStudioView: React.FC = () => {
  // --- WORKSPACE & PROJECT SELECTION ---
  const [projects, setProjects] = useState<ProjectOption[]>([
    { id: 'proj_deployfleet', name: 'DeployFleet Continuous Cloud Orchestration', repo: '/Users/winstonzulu/Documents/GitHub/DeployFleet-website', description: 'Logistics Mission Control & Fleet Orchestrator' },
    { id: 'proj_myaos', name: 'MyaOS Orchestration & Telemetry Platform', repo: '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team', description: 'Autonomous Agent Orchestration' },
    { id: 'proj_chatbot', name: 'Myavana AI Chatbot & Streaming Core', repo: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot', description: 'Realtime hair diagnostic intelligence' },
  ]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('proj_deployfleet');
  const [currentProject, setCurrentProject] = useState<ProjectOption | null>(null);
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);

  // --- SCAN DATA & RECONSTRUCTION ---
  const [scanData, setScanData] = useState<ProjectUiScanData | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [availableScreens, setAvailableScreens] = useState<string[]>([
    'Executive Overview Cockpit',
    'Dispatch & Realtime Fleet Tracker',
    'Driver Trip & Profitability Calculator',
    'Border Clearance & Compliance Tracker',
    'Fleet Telemetry & Fuel Optimization'
  ]);
  const [selectedScreenName, setSelectedScreenName] = useState<string>('Executive Overview Cockpit');
  const [selectedFlowName, setSelectedFlowName] = useState<string>('Main Application Flow');

  // --- DESIGN PHILOSOPHY ---
  const [philosophy, setPhilosophy] = useState<ProjectPhilosophy | null>(null);
  const [isPhilosophyModalOpen, setIsPhilosophyModalOpen] = useState(false);
  const [savingPhilosophy, setSavingPhilosophy] = useState(false);

  // --- COMPONENT LIBRARY ---
  const [components, setComponents] = useState<ProjectComponentItem[]>([]);
  const [isComponentLibraryOpen, setIsComponentLibraryOpen] = useState(false);

  // --- SCREEN VERSIONS ---
  const [versions, setVersions] = useState<ScreenVersion[]>([]);
  const [currentVersionNumber, setCurrentVersionNumber] = useState<number>(1);
  const [isVersionDropdownOpen, setIsVersionDropdownOpen] = useState(false);

  // --- ACTIVE CANVAS & DISPLAY ---
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('preview');
  const [canvasBg, setCanvasBg] = useState<'grid' | 'dark' | 'white'>('grid');
  const [canvasZoom, setCanvasZoom] = useState<number>(100);
  const [fullScreen, setFullScreen] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [tsxContent, setTsxContent] = useState<string>('');
  const [isConvertingTsx, setIsConvertingTsx] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);
  const [copiedTsx, setCopiedTsx] = useState(false);
  const [isNewScreenModalOpen, setIsNewScreenModalOpen] = useState(false);
  const [newScreenNameInput, setNewScreenNameInput] = useState('');
  const [isGeneratingNewScreen, setIsGeneratingNewScreen] = useState(false);

  // --- CLAUDE DESIGN INTERACTIVE INSPECTOR & STATE ---
  const [selectedElement, setSelectedElement] = useState<{
    selector: string;
    tag: string;
    text: string;
    classes: string;
  } | null>(null);
  const [isInspectorActive, setIsInspectorActive] = useState<boolean>(true);
  const [interactiveState, setInteractiveState] = useState<'default' | 'loading' | 'empty'>('default');

  // --- ORCHESTRATOR CHAT & AUTOMATION ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [tokensUsed, setTokensUsed] = useState<number>(0);
  const [costUsd, setCostUsd] = useState<number>(0);

  // --- PUSH / COMMIT STATUS ---
  const [pushingTaskId, setPushingTaskId] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isProcessing]);

  // Handle postMessage from preview iframe for Claude Designer click-to-inspect
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CANVAS_ELEMENT_SELECTED') {
        setSelectedElement({
          selector: event.data.selector,
          tag: event.data.tag,
          text: event.data.text,
          classes: event.data.classes,
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Update iframe
  useEffect(() => {
    if (iframeRef.current && htmlContent) {
      iframeRef.current.srcdoc = htmlContent;
    }
  }, [htmlContent, viewport, displayMode]);

  // 1. Initial Load: Projects
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const list = await invoke<any[]>('myaos_list_projects');
      if (list && list.length > 0) {
        const mapped: ProjectOption[] = list.map((p) => ({
          id: p.id,
          name: p.name,
          repo: p.repo || '',
          description: p.description || '',
        }));
        setProjects(mapped);

        // Pick initial project: Prefer DeployFleet or first
        const initial =
          mapped.find((p) => p.id.toLowerCase().includes('deployfleet')) || mapped[0];
        setSelectedProjectId(initial.id);
        setCurrentProject(initial);
      }
    } catch (err) {
      console.warn('Failed to load projects:', err);
    }
  };

  // 2. When Project Changes: Load Philosophy, Versions, Components, and Scan
  useEffect(() => {
    if (!selectedProjectId) return;
    const proj = projects.find((p) => p.id === selectedProjectId) || null;
    setCurrentProject(proj);
    loadProjectSubstrateData(selectedProjectId, proj?.repo);
  }, [selectedProjectId]);

  const loadProjectSubstrateData = async (projId: string, repoPath?: string) => {
    try {
      // 1. Load Design Philosophy
      let phil = await invoke<ProjectPhilosophy | null>(
        'myaos_get_project_design_philosophy',
        { projectId: projId }
      );
      if (!phil) {
        // Initialize default brand philosophy for project
        const isDeployFleet = projId.toLowerCase().includes('deployfleet');
        const defaultPhil: ProjectPhilosophy = {
          id: `phil_${projId.toLowerCase()}`,
          project_id: projId,
          brand_name: isDeployFleet ? 'DeployFleet Mission Control' : 'Myavana Hair Intelligence',
          heading_font: 'Plus Jakarta Sans',
          body_font: 'Inter',
          code_font: 'JetBrains Mono',
          primary_color: isDeployFleet ? '#0a1128' : '#1e1b4b',
          secondary_color: isDeployFleet ? '#00d2ff' : '#ec4899',
          accent_color: isDeployFleet ? '#0b93d3' : '#f59e0b',
          surface_color: '#f8fafc',
          border_radius: '16px',
          tokens_json: JSON.stringify({
            '--brand-primary': isDeployFleet ? '#0a1128' : '#1e1b4b',
            '--brand-accent': isDeployFleet ? '#00d2ff' : '#ec4899',
          }),
          philosophy_markdown: isDeployFleet
            ? 'High-contrast, data-dense logistics cockpit. Clean dark navy containers, bright cyan telemetry accents, and crisp sans-serif metrics.'
            : 'Luxury personalized hair care intelligence. Warm gradients, high-fashion typography, and clean diagnostic health score dials.',
          updated_at: '',
        };
        await invoke('myaos_save_project_design_philosophy', { philosophy: defaultPhil });
        phil = defaultPhil;
      }
      setPhilosophy(phil);

      // 2. Load Screen Versions
      const vers = await invoke<ScreenVersion[]>('myaos_list_project_screen_versions', {
        projectId: projId,
      });
      setVersions(vers || []);

      // 3. Load Components
      const comps = await invoke<ProjectComponentItem[]>(
        'myaos_list_project_components',
        { projectId: projId }
      );
      setComponents(comps || []);

      // 4. Scan Project Codebase with intelligent path resolution
      let targetPath = repoPath || '';
      if (projId.toLowerCase().includes('deployfleet')) {
        targetPath = '/Users/winstonzulu/Documents/GitHub/DeployFleet-website';
      } else if (projId.toLowerCase().includes('chatbot')) {
        targetPath = '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot';
      } else if (!targetPath || !targetPath.startsWith('/')) {
        targetPath = '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team';
      }

      scanProjectFiles(projId, targetPath, vers);
    } catch (err) {
      console.error('Failed to load project substrate data:', err);
    }
  };

  const scanProjectFiles = async (
    projId: string,
    workspacePath: string,
    existingVersions: ScreenVersion[]
  ) => {
    setIsScanning(true);
    try {
      const scan = await invoke<ProjectUiScanData>('myaos_inspect_workspace_ui_structure', {
        projectId: projId,
        workspacePath,
      });
      setScanData(scan);

      // Consolidate screen list
      const detectedScreens: string[] = [];
      if (scan.routes && scan.routes.length > 0) {
        scan.routes.forEach((r) => {
          const clean = r
            .replace('/src/app/', '')
            .replace('/page.tsx', '')
            .replace('/page.jsx', '')
            .replace('src/app/', '')
            .replace('/', ' › ');
          if (clean && clean !== 'src' && !detectedScreens.includes(clean)) {
            detectedScreens.push(clean || 'Home Dashboard');
          }
        });
      }
      if (scan.screens && scan.screens.length > 0) {
        scan.screens.forEach((s) => {
          const clean = s.replace('.tsx', '').replace('.jsx', '');
          if (!detectedScreens.includes(clean)) detectedScreens.push(clean);
        });
      }

      if (detectedScreens.length === 0) {
        detectedScreens.push('Executive Overview Cockpit', 'Dispatch & Realtime Fleet Tracker');
      }

      setAvailableScreens(detectedScreens);

      // If we already have saved versions for this project, display the latest one
      if (existingVersions && existingVersions.length > 0) {
        const latest = existingVersions[0];
        setHtmlContent(latest.html_content);
        setSelectedScreenName(latest.screen_name);
        setCurrentVersionNumber(latest.version);
        setChatMessages([
          {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: `Loaded approved screen **${latest.screen_name}** (v${latest.version}) from SQLite substrate. Codebase scan complete (${scan.totalFiles} UI files identified).`,
            version: latest.version,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } else {
        // Initial clean state: prompt user to reconstruct
        const firstScreen = detectedScreens[0];
        setSelectedScreenName(firstScreen);
        setHtmlContent('');
        setChatMessages([
          {
            id: `msg_${Date.now()}`,
            role: 'system',
            content: `**Codebase scanned successfully:** Identified ${scan.totalFiles} files, ${scan.routes.length} routes, and ${scan.components.length} components in \`${workspacePath}\`.\n\nClick **"Reconstruct Screen from Source"** below to generate the faithful initial UI (v1) without generic placeholders.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err) {
      console.warn('Scan failed, using project defaults:', err);
    } finally {
      setIsScanning(false);
    }
  };

  // --- PROJECT ADDED HANDLER ---
  const handleProjectAdded = async (newProj: any) => {
    try {
      await loadProjects();
      if (newProj?.id) {
        setSelectedProjectId(newProj.id);
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          role: 'system',
          content: `**New project connected:** \`${newProj?.name || newProj?.id}\`. Codebase structure scanned and ready.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      console.error('Failed to handle project added:', err);
    }
  };

  // --- RECONSTRUCT FAITHFUL SCREEN FROM SOURCE ---
  const handleReconstructFromSource = async (targetScreenName?: string, customInstruction?: string) => {
    const screenToUse = targetScreenName || selectedScreenName || availableScreens[0] || 'Executive Overview Cockpit';
    setSelectedScreenName(screenToUse);

    // Ensure fallback philosophy if loading
    const activePhil: ProjectPhilosophy = philosophy || {
      id: `phil_${(selectedProjectId || 'proj_deployfleet').toLowerCase()}`,
      project_id: selectedProjectId || 'proj_deployfleet',
      brand_name: (selectedProjectId || '').toLowerCase().includes('deployfleet')
        ? 'DeployFleet Mission Control'
        : 'Myavana Hair Intelligence',
      heading_font: 'Plus Jakarta Sans',
      body_font: 'Inter',
      code_font: 'JetBrains Mono',
      primary_color: (selectedProjectId || '').toLowerCase().includes('deployfleet') ? '#0a1128' : '#1e1b4b',
      secondary_color: (selectedProjectId || '').toLowerCase().includes('deployfleet') ? '#00d2ff' : '#ec4899',
      accent_color: (selectedProjectId || '').toLowerCase().includes('deployfleet') ? '#0b93d3' : '#f59e0b',
      surface_color: '#f8fafc',
      border_radius: '16px',
      updated_at: '',
    };

    // Ensure fallback scanData if not yet scanned
    const activeScan: ProjectUiScanData = scanData || {
      projectId: selectedProjectId || 'proj_deployfleet',
      workspacePath: currentProject?.repo || '/Users/winstonzulu/Documents/GitHub/DeployFleet-website',
      totalFiles: 1,
      routes: [screenToUse],
      components: ['Header', 'MetricCard', 'DataTable'],
      screens: [screenToUse],
      scannedFiles: [],
    };

    setIsProcessing(true);

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: customInstruction || `Reconstruct screen "${screenToUse}" faithfully from actual project codebase and brand tokens.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, userMsg]);

    const philData: DesignPhilosophyData = {
      brandName: activePhil.brand_name,
      headingFont: activePhil.heading_font,
      bodyFont: activePhil.body_font,
      codeFont: activePhil.code_font,
      primaryColor: activePhil.primary_color,
      secondaryColor: activePhil.secondary_color,
      accentColor: activePhil.accent_color,
      surfaceColor: activePhil.surface_color,
      borderRadius: activePhil.border_radius,
      tokensJson: activePhil.tokens_json,
      philosophyMarkdown: activePhil.philosophy_markdown,
    };

    try {
      const result = await reconstructProjectScreenFromSource(
        screenToUse,
        selectedFlowName,
        activeScan,
        philData,
        viewport,
        customInstruction
      );

      setHtmlContent(result.html);
      setCurrentVersionNumber(1);
      setTokensUsed((t) => t + result.tokensUsed);
      setCostUsd((c) => c + result.costUsd);

      // Save version 1 to SQLite
      const verRecord: ScreenVersion = {
        id: `ver_${selectedProjectId || 'proj'}_${screenToUse.replace(/[^a-z0-9]/gi, '_')}_1`,
        project_id: selectedProjectId || 'proj_deployfleet',
        screen_name: screenToUse,
        flow_name: selectedFlowName,
        version: 1,
        viewport,
        html_content: result.html,
        prompt: `Faithful initial reconstruction from ${activeScan.workspacePath}`,
        change_summary: 'Initial faithful reconstruction from project codebase',
        is_approved: 0,
        created_at: new Date().toISOString(),
      };
      await invoke('myaos_save_project_screen_version', { version: verRecord });
      setVersions((prev) => [verRecord, ...prev.filter((v) => v.id !== verRecord.id)]);

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: `**Screen Reconstructed (v1):** ${result.summary}\n\nGrounding: Applied brand palette (\`${activePhil.primary_color}\`, \`${activePhil.secondary_color}\`), typography (\`${activePhil.heading_font}\`), and detected route components. You can now prompt iterations, tweak philosophy tokens, or approve for autonomous agent dispatch.`,
        version: 1,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.warn('Reconstruction encountered error, applying faithful direct codebase synthesis:', err);
      const fallbackResult = generateFaithfulCodebaseFallback(
        screenToUse,
        selectedFlowName,
        activeScan,
        philData,
        viewport
      );

      setHtmlContent(fallbackResult.html);
      setCurrentVersionNumber(1);

      const verRecord: ScreenVersion = {
        id: `ver_${selectedProjectId || 'proj'}_${screenToUse.replace(/[^a-z0-9]/gi, '_')}_1`,
        project_id: selectedProjectId || 'proj_deployfleet',
        screen_name: screenToUse,
        flow_name: selectedFlowName,
        version: 1,
        viewport,
        html_content: fallbackResult.html,
        prompt: `Faithful initial reconstruction from ${activeScan.workspacePath}`,
        change_summary: 'Initial faithful reconstruction from project codebase tokens',
        is_approved: 0,
        created_at: new Date().toISOString(),
      };
      invoke('myaos_save_project_screen_version', { version: verRecord }).catch(() => {});
      setVersions((prev) => [verRecord, ...prev.filter((v) => v.id !== verRecord.id)]);

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: `**Screen Reconstructed (v1):** ${fallbackResult.summary}\n\nGrounding: Applied brand palette (\`${activePhil.primary_color}\`, \`${activePhil.secondary_color}\`), typography (\`${activePhil.heading_font}\`), and detected route components.`,
        version: 1,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- UNIFIED PROMPT SUBMISSION (INITIAL OR ITERATIVE) ---
  const handleUserPromptSubmit = async (promptText: string) => {
    if (!promptText.trim() || isProcessing) return;
    setInputPrompt('');

    if (htmlContent) {
      const finalPrompt = selectedElement
        ? `For selected element <${selectedElement.tag}> ("${selectedElement.text || selectedElement.selector}"): ${promptText}`
        : promptText;
      setSelectedElement(null);
      await handleIterateDesign(finalPrompt);
    } else {
      await handleReconstructFromSource(undefined, promptText);
    }
  };

  // --- ITERATE ON SCREEN (CLAUDE DESIGN STYLE) ---
  const handleIterateDesign = async (instruction: string) => {
    if (!instruction.trim() || !htmlContent) return;
    setIsProcessing(true);
    setInputPrompt('');

    const nextVer = currentVersionNumber + 1;
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: instruction,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const options: DesignGenerationOptions = {
        prompt: instruction,
        designType: 'dashboard',
        viewport,
        currentHtml: htmlContent,
        iterationInstruction: instruction,
      };

      const result = await generateHtmlDesignWithGemini(options);
      if (result.html) {
        setHtmlContent(result.html);
        setCurrentVersionNumber(nextVer);
        setTokensUsed((t) => t + result.tokensUsed);
        setCostUsd((c) => c + result.costUsd);

        // Save new version
        const verRecord: ScreenVersion = {
          id: `ver_${selectedProjectId}_${selectedScreenName.replace(/[^a-z0-9]/gi, '_')}_${nextVer}`,
          project_id: selectedProjectId,
          screen_name: selectedScreenName,
          flow_name: selectedFlowName,
          version: nextVer,
          viewport,
          html_content: result.html,
          prompt: instruction,
          change_summary: instruction,
          is_approved: 0,
          created_at: new Date().toISOString(),
        };
        await invoke('myaos_save_project_screen_version', { version: verRecord });
        setVersions((prev) => [verRecord, ...prev]);

        const assistantMsg: ChatMessage = {
          id: `msg_${Date.now() + 1}`,
          role: 'assistant',
          content: `**Updated Screen to v${nextVer}:** ${result.summary}\n\nPreview updated on canvas. If this meets your expectations, click **"Approve & Dispatch"** to generate the engineering update specification for the autonomous AI team.`,
          version: nextVer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      alert(`Iteration failed: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- SWITCH SCREEN ---
  const handleSelectScreen = (screenName: string) => {
    setSelectedScreenName(screenName);
    const screenVers = versions.filter((v) => v.screen_name === screenName);
    if (screenVers.length > 0) {
      // Find latest version for this screen
      const sorted = [...screenVers].sort((a, b) => b.version - a.version);
      const latest = sorted[0];
      setHtmlContent(latest.html_content);
      setCurrentVersionNumber(latest.version);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          role: 'system',
          content: `Switched active screen to **${screenName}** (v${latest.version}).`,
          version: latest.version,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } else {
      setHtmlContent('');
      setCurrentVersionNumber(1);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          role: 'system',
          content: `Selected screen **${screenName}**. No generated versions yet. Click **"Reconstruct Screen from Source"** below to generate v1.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  // --- CREATE NEW SCREEN ---
  const handleCreateNewScreen = async () => {
    if (!newScreenNameInput.trim()) return;
    const cleanName = newScreenNameInput.trim();
    if (!availableScreens.includes(cleanName)) {
      setAvailableScreens((prev) => [...prev, cleanName]);
    }
    setIsNewScreenModalOpen(false);
    setNewScreenNameInput('');
    handleSelectScreen(cleanName);
  };

  // --- SWITCH VERSION ---
  const handleSelectVersion = (ver: ScreenVersion) => {
    setHtmlContent(ver.html_content);
    setCurrentVersionNumber(ver.version);
    setIsVersionDropdownOpen(false);
    setChatMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}`,
        role: 'system',
        content: `Switched active preview to **Version ${ver.version}** (${ver.change_summary || 'Saved snapshot'}).`,
        version: ver.version,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // --- APPROVE & DISPATCH TO ORCHESTRATOR ---
  const handleApproveAndDispatch = async () => {
    if (!htmlContent) return;
    setIsProcessing(true);

    const changeSum =
      versions.find((v) => v.version === currentVersionNumber)?.change_summary ||
      `Approved UI screen design for ${selectedScreenName}`;

    try {
      // 1. Generate Technical Implementation Specification
      const spec = await generateDesignUpdateSpecification(
        selectedScreenName,
        currentVersionNumber,
        htmlContent,
        changeSum
      );

      // 2. Select assigned agent
      const assignedAgent =
        selectedProjectId.toLowerCase().includes('mobile') ? 'lyra' : 'astra';
      const branchName = `design/${selectedScreenName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-v${currentVersionNumber}`;

      // 3. Dispatch task to MyaOS SQLite substrate
      const task = await invoke<any>('myaos_dispatch_design_update_task', {
        projectId: selectedProjectId,
        screenName: selectedScreenName,
        version: currentVersionNumber,
        updateSpec: spec,
        assignedAgent,
        branchName,
      });

      // 4. Mark current version as approved in DB
      const currentVerObj = versions.find((v) => v.version === currentVersionNumber);
      if (currentVerObj) {
        currentVerObj.is_approved = 1;
        await invoke('myaos_save_project_screen_version', { version: currentVerObj });
      }

      // 5. Append interactive task card message to chat
      const taskMsg: ChatMessage = {
        id: `msg_task_${Date.now()}`,
        role: 'assistant',
        content: `🎉 **Design Approved & Dispatched to AI Team!**\n\nMyaOS Orchestrator created task \`${task.id}\` and assigned implementation to **@${assignedAgent}** on branch \`${branchName}\`.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        taskData: {
          taskId: task.id,
          screenName: selectedScreenName,
          version: currentVersionNumber,
          branch: branchName,
          agent: assignedAgent,
          spec,
          pushed: false,
        },
      };
      setChatMessages((prev) => [...prev, taskMsg]);
    } catch (err) {
      alert(`Dispatch failed: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- 1-CLICK PUSH UPDATES TO GIT ---
  const handlePushGitUpdates = async (taskId: string, branch: string) => {
    setPushingTaskId(taskId);
    try {
      const repoPath =
        currentProject?.repo ||
        '/Users/winstonzulu/Documents/GitHub/DeployFleet-website';

      // 1. Create branch if not exists
      try {
        await invoke('myaos_create_git_branch', {
          cwd: repoPath,
          branchName: branch,
        });
      } catch (e) {
        // Branch might already exist; ignore
      }

      // 2. Commit and Push
      await invoke('myaos_create_git_commit', {
        cwd: repoPath,
        message: `feat(design): implement approved ${selectedScreenName} v${currentVersionNumber} design spec`,
      });

      await invoke('myaos_push_git_branch', {
        cwd: repoPath,
        branch,
      });

      // Update task card in chat
      setChatMessages((prev) =>
        prev.map((m) => {
          if (m.taskData && m.taskData.taskId === taskId) {
            return {
              ...m,
              taskData: { ...m.taskData, pushed: true },
            };
          }
          return m;
        })
      );
    } catch (err) {
      alert(`Git push failed: ${err}`);
    } finally {
      setPushingTaskId(null);
    }
  };

  // --- SAVE DESIGN PHILOSOPHY ---
  const handleSavePhilosophy = async () => {
    if (!philosophy) return;
    setSavingPhilosophy(true);
    try {
      await invoke('myaos_save_project_design_philosophy', { philosophy });
      setIsPhilosophyModalOpen(false);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          role: 'system',
          content: `Updated design philosophy tokens for **${philosophy.brand_name}** (Heading: ${philosophy.heading_font}, Primary: ${philosophy.primary_color}). Future iterations will adhere to these tokens.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      alert(`Failed to save philosophy: ${err}`);
    } finally {
      setSavingPhilosophy(false);
    }
  };

  // Copy HTML helper
  const handleCopyHtml = () => {
    if (!htmlContent) return;
    navigator.clipboard.writeText(htmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Convert HTML to React TSX component helper
  const handleConvertToTsx = async () => {
    if (!htmlContent) return;
    setIsConvertingTsx(true);
    try {
      const tsx = await convertHtmlToReactTsx(
        selectedScreenName,
        htmlContent,
        philosophy?.brand_name || 'DeployFleet'
      );
      setTsxContent(tsx);
      setDisplayMode('tsx');
    } catch (err) {
      alert(`TSX conversion failed: ${err}`);
    } finally {
      setIsConvertingTsx(false);
    }
  };

  const handleCopyTsx = () => {
    if (!tsxContent) return;
    navigator.clipboard.writeText(tsxContent);
    setCopiedTsx(true);
    setTimeout(() => setCopiedTsx(false), 2000);
  };

  // Export HTML helper
  const handleExportHtml = () => {
    if (!htmlContent) return;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedScreenName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-v${currentVersionNumber}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Viewport dimensions
  const getViewportDimensions = () => {
    switch (viewport) {
      case 'mobile':
        return 'w-[390px] h-[780px]';
      case 'tablet':
        return 'w-[768px] h-[820px]';
      case 'desktop':
        return 'w-[1080px] h-[720px]';
      case 'fluid':
      default:
        return 'w-full h-full';
    }
  };

  return (
    <div
      className={`h-full w-full bg-[#fbfbfa] text-zinc-900 font-sans select-none flex flex-col overflow-hidden ${
        fullScreen ? 'fixed inset-0 z-50 p-2 bg-zinc-950' : 'p-3'
      }`}
    >
      {/* MINIMAL TOP CONTROL HEADER */}
      <header className="h-13 bg-white border border-black/[0.08] rounded-2xl px-4 shadow-2xs flex items-center justify-between gap-3 shrink-0 mb-3">
        {/* Left: Project & Screen Dropdown Switchers */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <Palette className="w-4 h-4 text-indigo-400" />
          </div>

          {/* Project Selector */}
          <div className="relative flex items-center">
            <select
              value={selectedProjectId}
              onChange={(e) => {
                if (e.target.value === '__new_project__') {
                  setIsAddProjectModalOpen(true);
                  return;
                }
                setSelectedProjectId(e.target.value);
              }}
              className="appearance-none text-xs font-bold text-zinc-900 bg-zinc-100 hover:bg-zinc-200/80 pl-3 pr-7 py-1.5 rounded-xl border border-black/[0.06] focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer transition"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__new_project__">+ New Project...</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 pointer-events-none" />
          </div>

          {/* Add Project Button */}
          <button
            onClick={() => setIsAddProjectModalOpen(true)}
            className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="Create new project or connect repository"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline text-[11px]">Project</span>
          </button>

          <span className="text-zinc-300 font-mono">/</span>

          {/* Screen / Flow Selector */}
          <div className="relative flex items-center">
            <select
              value={selectedScreenName}
              onChange={(e) => handleSelectScreen(e.target.value)}
              className="appearance-none text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200/80 pl-3 pr-7 py-1.5 rounded-xl border border-black/[0.06] focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer transition max-w-[220px] truncate"
            >
              {availableScreens.map((s, idx) => (
                <option key={idx} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 pointer-events-none" />
          </div>

          {/* Add Screen Button */}
          <button
            onClick={() => setIsNewScreenModalOpen(true)}
            className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="Create new screen"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline text-[11px]">Screen</span>
          </button>

          {/* Version Switcher Pill */}
          {versions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setIsVersionDropdownOpen((p) => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold font-mono transition cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                <span>v{currentVersionNumber}</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {isVersionDropdownOpen && (
                <div className="absolute top-8 left-0 w-64 bg-white rounded-2xl shadow-xl border border-black/[0.08] p-2 z-50 space-y-1 animate-card-entry">
                  <div className="text-[10px] font-mono text-zinc-400 font-bold px-2 py-1 uppercase">
                    Version History
                  </div>
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => handleSelectVersion(v)}
                      className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                        v.version === currentVersionNumber
                          ? 'bg-zinc-900 text-white font-bold'
                          : 'hover:bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      <span className="font-mono">v{v.version}</span>
                      <span className="text-[10px] opacity-75 truncate max-w-[140px]">
                        {v.change_summary || 'Revision'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center: Device Viewport Switcher */}
        <div className="flex items-center bg-zinc-100/90 p-1 rounded-xl border border-black/[0.05]">
          {[
            { id: 'desktop', label: 'Desktop', icon: Monitor },
            { id: 'tablet', label: 'Tablet', icon: Tablet },
            { id: 'mobile', label: 'Mobile', icon: Smartphone },
            { id: 'fluid', label: 'Fluid', icon: Maximize2 },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setViewport(v.id as ViewportMode)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewport === v.id
                  ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                  : 'hover:text-zinc-900 text-zinc-500'
              }`}
            >
              <v.icon className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{v.label}</span>
            </button>
          ))}
        </div>

        {/* Right: Modals & Actions */}
        <div className="flex items-center gap-2">
          {/* Design Philosophy Button */}
          <button
            onClick={() => setIsPhilosophyModalOpen(true)}
            className="px-3 py-1.5 bg-white hover:bg-zinc-50 text-zinc-700 border border-black/[0.08] rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Configure Project Design Philosophy & Tokens"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-600" />
            <span>Design Philosophy</span>
          </button>

          {/* Component Library Button */}
          <button
            onClick={() => setIsComponentLibraryOpen(true)}
            className="px-3 py-1.5 bg-white hover:bg-zinc-50 text-zinc-700 border border-black/[0.08] rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="View Project Components & Templates"
          >
            <Component className="w-3.5 h-3.5 text-amber-600" />
            <span>Components ({scanData?.components.length || 0})</span>
          </button>

          {/* Display Mode Switcher */}
          <div className="flex items-center bg-zinc-100/90 p-1 rounded-xl border border-black/[0.05]">
            <button
              onClick={() => setDisplayMode('preview')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                displayMode === 'preview'
                  ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
              title="Single Screen Canvas"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDisplayMode('board')}
              className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-mono px-2 ${
                displayMode === 'board'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
              title="Multi-Screen Canvas Board (Claude Designer Style)"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-500" />
              <span>Board</span>
            </button>
            <button
              onClick={() => {
                if (!tsxContent && htmlContent) {
                  handleConvertToTsx();
                } else {
                  setDisplayMode('tsx');
                }
              }}
              className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-mono px-2 ${
                displayMode === 'tsx'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
              title="React TSX Component"
            >
              <FileCode className="w-3.5 h-3.5 text-indigo-500" />
              <span>TSX</span>
            </button>
            <button
              onClick={() => setDisplayMode('code')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                displayMode === 'code'
                  ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
              title="HTML Code"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDisplayMode('split')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                displayMode === 'split'
                  ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
              title="Split View"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Full Screen */}
          <button
            onClick={() => setFullScreen((p) => !p)}
            className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl transition cursor-pointer"
            title={fullScreen ? 'Exit Full Screen' : 'Full Screen'}
          >
            {fullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* 2-COLUMN SPLIT WORKSPACE */}
      <div className="flex-1 flex gap-3 overflow-hidden relative">
        {/* LEFT COLUMN: INTERACTIVE ORCHESTRATOR CHAT & CONTROL PANEL (40% width) */}
        <div className="w-[430px] bg-white border border-black/[0.08] rounded-3xl flex flex-col shadow-xs overflow-hidden shrink-0">
          {/* Chat Panel Header */}
          <div className="p-3.5 border-b border-black/[0.06] bg-zinc-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <div>
                <h2 className="text-xs font-bold text-zinc-900 leading-tight">
                  Design Studio Orchestrator
                </h2>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Grounding: {currentProject?.name || 'Codebase'}
                </span>
              </div>
            </div>

            {/* Approve & Dispatch Button */}
            {htmlContent && (
              <button
                onClick={handleApproveAndDispatch}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Approve Design and Dispatch Implementation Task to AI Team"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve & Dispatch</span>
              </button>
            )}
          </div>

          {/* Chat Messages Timeline */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user'
                    ? 'items-end'
                    : msg.role === 'system'
                    ? 'items-center text-center'
                    : 'items-start'
                }`}
              >
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[92%] shadow-2xs ${
                    msg.role === 'user'
                      ? 'bg-zinc-900 text-white rounded-br-xs'
                      : msg.role === 'system'
                      ? 'bg-zinc-100/90 text-zinc-600 border border-zinc-200/80 rounded-2xl w-full text-left'
                      : 'bg-[#f4f3f0] text-zinc-900 border border-black/[0.05] rounded-bl-xs'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* If message has an autonomous task card attached */}
                  {msg.taskData && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-black/[0.08] shadow-xs space-y-2 text-zinc-800">
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                        <span className="text-[10px] font-mono font-bold uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          Task Dispatched
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          Branch: {msg.taskData.branch}
                        </span>
                      </div>

                      <div className="text-xs font-bold text-zinc-900">
                        {msg.taskData.screenName} (v{msg.taskData.version})
                      </div>

                      <p className="text-[11px] text-zinc-600 line-clamp-2 font-mono">
                        {msg.taskData.spec}
                      </p>

                      {/* 1-Click Push Button directly in chat */}
                      <div className="pt-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-zinc-400">
                          Assignee: @{msg.taskData.agent}
                        </span>

                        {msg.taskData.pushed ? (
                          <span className="text-xs font-bold font-mono text-emerald-600 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            Pushed to Git
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              handlePushGitUpdates(
                                msg.taskData!.taskId,
                                msg.taskData!.branch
                              )
                            }
                            disabled={pushingTaskId === msg.taskData.taskId}
                            className="px-3 py-1.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold font-mono transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                          >
                            {pushingTaskId === msg.taskData.taskId ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                                <span>Pushing...</span>
                              </>
                            ) : (
                              <>
                                <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Push Updates</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[9.5px] font-mono text-zinc-400 mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {isProcessing && (
              <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60 w-fit">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>Orchestrating design changes with Gemini...</span>
              </div>
            )}
          </div>

            {/* Bottom Chat Prompt Input Bar */}
          <div className="p-3 border-t border-black/[0.06] bg-white space-y-2">
            {/* Claude Designer Targeted Element Indicator & Quick Tweaks */}
            {htmlContent && selectedElement && (
              <div className="p-2 bg-indigo-50/80 border border-indigo-200/80 rounded-xl space-y-1.5 animate-card-entry">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-indigo-900 truncate">
                    <Crosshair className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="bg-indigo-200/60 px-1.5 py-0.5 rounded text-[10px] text-indigo-800 uppercase">
                      {selectedElement.tag}
                    </span>
                    <span className="truncate max-w-[160px]" title={selectedElement.selector}>
                      {selectedElement.text ? `"${selectedElement.text}"` : selectedElement.selector}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedElement(null)}
                    className="p-1 text-indigo-400 hover:text-indigo-700 transition cursor-pointer"
                    title="Clear element target"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Quick 1-Click Action Chips */}
                <div className="flex items-center gap-1 flex-wrap text-[10px] font-medium">
                  {[
                    'Make higher contrast',
                    'Dark mode palette',
                    'Add pulse animation',
                    'Make more compact',
                  ].map((quick) => (
                    <button
                      key={quick}
                      onClick={() => {
                        const targetedInstruction = `For selected element <${selectedElement.tag}> ("${selectedElement.text || selectedElement.selector}"): ${quick}`;
                        handleIterateDesign(targetedInstruction);
                      }}
                      disabled={isProcessing}
                      className="px-2 py-0.5 bg-white hover:bg-indigo-100 text-indigo-800 rounded-lg border border-indigo-200/60 transition cursor-pointer shadow-2xs"
                    >
                      {quick}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick action bar */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleReconstructFromSource()}
                disabled={isProcessing}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-black text-white rounded-xl text-[11px] font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                )}
                <span>{htmlContent ? 'Re-sync from Source' : `Reconstruct ${selectedScreenName || 'Screen'} (v1)`}</span>
              </button>

              {!htmlContent && (
                <>
                  <button
                    type="button"
                    onClick={() => handleUserPromptSubmit('Generate executive dashboard with KPI metric cards, interactive telemetry charts, and live status')}
                    disabled={isProcessing}
                    className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-[11px] font-medium transition cursor-pointer"
                  >
                    + Executive Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUserPromptSubmit('Design high-contrast dark mode logistics cockpit with interactive filter tabs and route tracking')}
                    disabled={isProcessing}
                    className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-[11px] font-medium transition cursor-pointer"
                  >
                    + Dark Cockpit
                  </button>
                </>
              )}
            </div>

            {/* Always-Visible Prompt Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!inputPrompt.trim() || isProcessing) return;
                handleUserPromptSubmit(inputPrompt);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder={
                  selectedElement
                    ? `Refine <${selectedElement.tag}> ("${(selectedElement.text || '').slice(0, 18) || selectedElement.selector}")...`
                    : htmlContent
                    ? `Iterate ${selectedScreenName} (e.g., 'Add telemetry charts', 'Dark mode')...`
                    : `Describe screen to design or reconstruct (e.g., 'Fleet mission cockpit with live map')...`
                }
                disabled={isProcessing}
                className="flex-1 h-9 px-3 bg-zinc-50 border border-black/[0.08] rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isProcessing || !inputPrompt.trim()}
                className="h-9 px-3.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-40 active:scale-95"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-indigo-400" />
                )}
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 px-1">
              <span>Tokens: {tokensUsed.toLocaleString()}</span>
              <span>Cost: ${costUsd.toFixed(4)}</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE INTERACTIVE PREVIEW CANVAS & CODE (60% width) */}
        <div className="flex-1 bg-white border border-black/[0.08] rounded-3xl flex flex-col shadow-xs overflow-hidden relative">
          {/* Canvas Subheader Bar */}
          <div className="h-10 bg-zinc-50/90 border-b border-black/[0.06] px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-800">
                {selectedScreenName}
              </span>
              <span className="text-[10px] font-mono bg-zinc-200/80 px-2 py-0.5 rounded text-zinc-600 font-bold">
                v{currentVersionNumber}
              </span>

              {/* Claude Designer Interactive Inspector Badge */}
              <div className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200/60 rounded-full text-[10px] font-mono font-bold text-indigo-700">
                <Crosshair className="w-3 h-3 text-indigo-500 animate-pulse" />
                <span>Click Canvas to Inspect</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyHtml}
                disabled={!htmlContent}
                className="h-7 px-2.5 bg-white hover:bg-zinc-100 text-zinc-700 border border-black/[0.06] rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 disabled:opacity-40"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={handleExportHtml}
                disabled={!htmlContent}
                className="h-7 px-2.5 bg-white hover:bg-zinc-100 text-zinc-700 border border-black/[0.06] rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 disabled:opacity-40"
              >
                <Download className="w-3 h-3 text-zinc-400" />
                <span>Export</span>
              </button>

              {/* Zoom Controls */}
              <div className="flex items-center bg-zinc-200/60 p-0.5 rounded-lg text-[10px] font-mono">
                <button
                  onClick={() => setCanvasZoom((z) => Math.max(40, z - 15))}
                  className="p-1 text-zinc-600 hover:text-zinc-900 rounded hover:bg-white transition cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1.5 font-bold text-zinc-700 min-w-[36px] text-center">
                  {canvasZoom}%
                </span>
                <button
                  onClick={() => setCanvasZoom((z) => Math.min(150, z + 15))}
                  className="p-1 text-zinc-600 hover:text-zinc-900 rounded hover:bg-white transition cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              {/* Backdrop Style */}
              <div className="flex bg-zinc-200/60 p-0.5 rounded-lg text-[10px] font-mono ml-1">
                <button
                  onClick={() => setCanvasBg('grid')}
                  className={`px-1.5 py-0.5 rounded ${canvasBg === 'grid' ? 'bg-white font-bold text-zinc-800' : 'text-zinc-500'}`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setCanvasBg('dark')}
                  className={`px-1.5 py-0.5 rounded ${canvasBg === 'dark' ? 'bg-zinc-900 text-white font-bold' : 'text-zinc-500'}`}
                >
                  Dark
                </button>
                <button
                  onClick={() => setCanvasBg('white')}
                  className={`px-1.5 py-0.5 rounded ${canvasBg === 'white' ? 'bg-white font-bold text-zinc-800' : 'text-zinc-500'}`}
                >
                  White
                </button>
              </div>
            </div>
          </div>

          {/* Canvas Center Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Live Interactive Iframe Shell */}
            {(displayMode === 'preview' || displayMode === 'split') && (
              <div
                className={`flex-1 overflow-auto p-4 flex justify-center items-start transition-all ${
                  canvasBg === 'dark'
                    ? 'bg-[#0b0e14]'
                    : canvasBg === 'white'
                    ? 'bg-white'
                    : 'bg-[#f4f3f0] bg-[radial-gradient(#d1cfc7_1px,transparent_1px)] [background-size:16px_16px]'
                }`}
              >
                {htmlContent ? (
                  <div
                    style={{
                      transform: canvasZoom !== 100 ? `scale(${canvasZoom / 100})` : undefined,
                      transformOrigin: 'top center',
                    }}
                    className={`flex flex-col bg-white overflow-hidden transition-all duration-300 shadow-2xl border ${
                      viewport === 'mobile'
                        ? 'border-zinc-800 ring-8 ring-zinc-900 rounded-[44px]'
                        : viewport === 'tablet'
                        ? 'border-zinc-700 ring-8 ring-zinc-800 rounded-[32px]'
                        : 'border-zinc-200 rounded-2xl'
                    } ${getViewportDimensions()}`}
                  >
                    {/* Device Header */}
                    {viewport === 'desktop' && (
                      <div className="h-7 bg-zinc-100 border-b border-zinc-200 px-3 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 truncate max-w-xs">
                          {philosophy?.brand_name || 'Project UI'} • {selectedScreenName}
                        </div>
                        <div className="w-6" />
                      </div>
                    )}

                    {viewport === 'mobile' && (
                      <div className="h-6 bg-zinc-950 px-4 flex items-center justify-between shrink-0 text-zinc-400 font-mono text-[9px]">
                        <span>9:41</span>
                        <div className="w-16 h-3 bg-black rounded-full border border-zinc-800" />
                        <span>5G 100%</span>
                      </div>
                    )}

                    <iframe
                      ref={iframeRef}
                      title="Canvas Frame"
                      srcDoc={htmlContent}
                      sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
                      className="w-full flex-1 border-none bg-white overflow-auto"
                    />
                  </div>
                ) : isProcessing ? (
                  <div
                    className={`flex flex-col bg-white overflow-hidden transition-all duration-300 shadow-2xl border ${
                      viewport === 'mobile'
                        ? 'border-zinc-800 ring-8 ring-zinc-900 rounded-[44px]'
                        : viewport === 'tablet'
                        ? 'border-zinc-700 ring-8 ring-zinc-800 rounded-[32px]'
                        : 'border-zinc-200 rounded-2xl'
                    } ${getViewportDimensions()} min-h-[560px] animate-pulse`}
                  >
                    {/* Device Header */}
                    <div className="h-8 bg-zinc-900 px-4 flex items-center justify-between text-zinc-300 text-xs font-mono shrink-0">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                        <span className="font-bold text-white">Reconstructing {selectedScreenName || 'Screen'}</span>
                      </div>
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold">
                        Synthesizing v1
                      </span>
                    </div>

                    {/* High-Fidelity Animated Skeleton Preview */}
                    <div className="p-6 space-y-6 flex-1 bg-zinc-50/60 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 flex items-center justify-center">
                              <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                            </div>
                            <div className="space-y-1.5">
                              <div className="h-4 w-48 bg-zinc-300 rounded-md animate-pulse" />
                              <div className="h-3 w-32 bg-zinc-200 rounded-md animate-pulse" />
                            </div>
                          </div>
                          <div className="h-7 w-28 bg-zinc-200 rounded-xl animate-pulse" />
                        </div>

                        {/* Metric Skeleton Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-2xs space-y-2">
                              <div className="h-3 w-16 bg-zinc-200 rounded animate-pulse" />
                              <div className="h-6 w-24 bg-zinc-300 rounded animate-pulse" />
                              <div className="h-2.5 w-32 bg-zinc-100 rounded animate-pulse" />
                            </div>
                          ))}
                        </div>

                        {/* Telemetry Wavefeed Skeleton */}
                        <div className="p-5 rounded-3xl bg-white border border-zinc-200 shadow-2xs space-y-3">
                          <div className="flex justify-between items-center">
                            <div className="h-4 w-36 bg-zinc-300 rounded animate-pulse" />
                            <div className="h-3 w-20 bg-zinc-200 rounded animate-pulse" />
                          </div>
                          <div className="space-y-2 pt-1">
                            <div className="h-10 bg-zinc-100 rounded-xl animate-pulse" />
                            <div className="h-10 bg-zinc-100 rounded-xl animate-pulse" />
                          </div>
                        </div>
                      </div>

                      {/* Live Grounding Status Banner */}
                      <div className="p-3.5 rounded-2xl bg-indigo-900/5 border border-indigo-200/60 flex items-center justify-between text-xs font-mono text-indigo-900">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                          <span>Compiling authentic codebase routes and design tokens...</span>
                        </div>
                        <span className="text-[10px] text-indigo-700 font-bold">gemini-3.8-flash</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto p-6 space-y-4">
                    <div className="w-14 h-14 rounded-3xl bg-zinc-100 flex items-center justify-center text-zinc-400 shadow-inner">
                      <Layout className="w-7 h-7 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-zinc-900">
                        Design {selectedScreenName || 'Screen'}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto leading-relaxed">
                        Reconstruct faithfully from project routes or enter a custom prompt to generate an interactive screen with brand tokens.
                      </p>
                    </div>

                    <div className="w-full space-y-2.5">
                      <button
                        onClick={() => handleReconstructFromSource()}
                        disabled={isProcessing}
                        className="w-full py-3 bg-zinc-900 hover:bg-black text-white rounded-2xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-2 active:scale-98"
                      >
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <span>Reconstruct {selectedScreenName || 'Screen'} from Codebase (v1)</span>
                      </button>

                      <div className="pt-1 text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
                        Or pick a design preset
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-left">
                        {[
                          { title: 'Executive Cockpit', desc: 'KPI cards, telemetry charts & status feed' },
                          { title: 'Corridor GPS Map', desc: 'Live truck positions, waypoints & routes' },
                          { title: 'Dark Operations UI', desc: 'High-contrast data tables & filter chips' },
                          { title: 'Driver Telemetry View', desc: 'Mobile trip hours, logs & compliance' },
                        ].map((preset) => (
                          <button
                            key={preset.title}
                            onClick={() => handleUserPromptSubmit(`Generate ${preset.title} with ${preset.desc}`)}
                            disabled={isProcessing}
                            className="p-3 bg-white hover:bg-zinc-50 border border-zinc-200/80 rounded-2xl text-left transition shadow-2xs hover:border-zinc-300 cursor-pointer group"
                          >
                            <div className="text-xs font-bold text-zinc-900 group-hover:text-indigo-600 transition">
                              {preset.title}
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">
                              {preset.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MULTI-SCREEN CANVAS BOARD (CLAUDE DESIGNER STYLE) */}
            {displayMode === 'board' && (
              <div
                className={`flex-1 overflow-auto p-6 transition-all ${
                  canvasBg === 'dark'
                    ? 'bg-[#0b0e14]'
                    : canvasBg === 'white'
                    ? 'bg-white'
                    : 'bg-[#f4f3f0] bg-[radial-gradient(#d1cfc7_1px,transparent_1px)] [background-size:20px_20px]'
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-xs font-bold text-zinc-900">
                      Multi-Screen Project Board ({availableScreens.length} Total Screens)
                    </h3>
                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-200/80 px-2 py-0.5 rounded-full">
                      {versions.length} generated snapshots
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsNewScreenModalOpen(true)}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Add New Screen</span>
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    transform: canvasZoom !== 100 ? `scale(${canvasZoom / 100})` : undefined,
                    transformOrigin: 'top left',
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 transition-all"
                >
                  {availableScreens.map((screenName) => {
                    const screenVers = versions.filter((v) => v.screen_name === screenName);
                    const latestVer = screenVers.sort((a, b) => b.version - a.version)[0];
                    const isSelected = selectedScreenName === screenName;

                    return (
                      <div
                        key={screenName}
                        onClick={() => {
                          handleSelectScreen(screenName);
                        }}
                        className={`group relative flex flex-col bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-xl cursor-pointer overflow-hidden ${
                          isSelected
                            ? 'ring-2 ring-indigo-600 border-indigo-600 shadow-indigo-100'
                            : 'border-zinc-200/90 hover:border-zinc-400'
                        }`}
                      >
                        {/* Card Header */}
                        <div className="p-3 bg-zinc-50/90 border-b border-zinc-100 flex items-center justify-between">
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span className="text-xs font-bold text-zinc-900 truncate">
                              {screenName}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {latestVer ? (
                              <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">
                                v{latestVer.version}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono bg-zinc-200 text-zinc-500 px-2 py-0.5 rounded-md">
                                Unrendered
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Card Screen Preview Container */}
                        <div className="relative h-64 bg-zinc-100 flex items-center justify-center overflow-hidden">
                          {latestVer?.html_content ? (
                            <iframe
                              srcDoc={latestVer.html_content}
                              title={`Preview ${screenName}`}
                              sandbox="allow-scripts allow-same-origin"
                              className="w-[200%] h-[200%] transform scale-50 origin-top-left border-none pointer-events-none bg-white"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-4 text-center">
                              <Layout className="w-8 h-8 text-zinc-300 mb-2" />
                              <span className="text-xs font-semibold text-zinc-600">
                                No preview generated yet
                              </span>
                              <span className="text-[10px] text-zinc-400 mt-0.5 font-mono">
                                Click to open & reconstruct
                              </span>
                            </div>
                          )}

                          {/* Hover Overlay with Action Buttons */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 backdrop-blur-2xs transition-all flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectScreen(screenName);
                                setDisplayMode('preview');
                              }}
                              className="px-3 py-1.5 bg-white hover:bg-zinc-100 text-zinc-900 rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Focus Screen</span>
                            </button>
                            {!latestVer && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectScreen(screenName);
                                  setDisplayMode('preview');
                                  handleReconstructFromSource(screenName);
                                }}
                                className="px-3 py-1.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1 cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Reconstruct</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card Footer */}
                        <div className="p-2.5 bg-white border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                          <span className="truncate max-w-[180px]">
                            {latestVer?.change_summary || 'Ready for generation'}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {screenVers.length} {screenVers.length === 1 ? 'version' : 'versions'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* React TSX View */}
            {displayMode === 'tsx' && (
              <div className="flex-1 border-l border-zinc-800 bg-[#0d1117] text-zinc-200 flex flex-col overflow-hidden">
                <div className="h-9 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between text-xs font-mono text-zinc-400 shrink-0">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-zinc-200">
                      {selectedScreenName.replace(/[^a-zA-Z0-9]/g, '')}.tsx
                    </span>
                    <span className="text-[10px] bg-indigo-900/60 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-700/50">
                      React + Lucide + Tailwind
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleConvertToTsx}
                      disabled={isConvertingTsx || !htmlContent}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3 h-3 ${isConvertingTsx ? 'animate-spin text-indigo-400' : ''}`} />
                      <span>{isConvertingTsx ? 'Synthesizing...' : 'Regenerate TSX'}</span>
                    </button>
                    <button
                      onClick={handleCopyTsx}
                      disabled={!tsxContent}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      {copiedTsx ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedTsx ? 'Copied TSX' : 'Copy Component'}</span>
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-300">
                  {isConvertingTsx ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                      <span>Synthesizing clean React TSX component from canvas...</span>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap">{tsxContent || '// Click "Regenerate TSX" above to synthesize React component.'}</pre>
                  )}
                </div>
              </div>
            )}

            {/* Code View */}
            {(displayMode === 'code' || displayMode === 'split') && (
              <div
                className={`border-l border-zinc-800 bg-[#0d1117] text-zinc-200 flex flex-col overflow-hidden ${
                  displayMode === 'split' ? 'w-1/2' : 'flex-1'
                }`}
              >
                <div className="h-8 bg-zinc-900 border-b border-zinc-800 px-3 flex items-center justify-between text-xs font-mono text-zinc-400 shrink-0">
                  <span>{selectedScreenName}.html</span>
                  <span>{htmlContent.length} bytes</span>
                </div>
                <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-300">
                  <pre className="whitespace-pre-wrap">{htmlContent || '// No HTML generated yet.'}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DESIGN PHILOSOPHY MODAL */}
      {isPhilosophyModalOpen && philosophy && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-black/[0.08] shadow-2xl w-full max-w-xl p-6 space-y-4 animate-card-entry">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-zinc-900">
                  Project Design Philosophy & Tokens
                </h3>
              </div>
              <button
                onClick={() => setIsPhilosophyModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                  Brand Name
                </label>
                <input
                  type="text"
                  value={philosophy.brand_name}
                  onChange={(e) =>
                    setPhilosophy({ ...philosophy, brand_name: e.target.value })
                  }
                  className="w-full h-8 px-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-semibold text-zinc-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                  Border Radius
                </label>
                <input
                  type="text"
                  value={philosophy.border_radius}
                  onChange={(e) =>
                    setPhilosophy({ ...philosophy, border_radius: e.target.value })
                  }
                  className="w-full h-8 px-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-mono text-zinc-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                  Heading Font
                </label>
                <input
                  type="text"
                  value={philosophy.heading_font}
                  onChange={(e) =>
                    setPhilosophy({ ...philosophy, heading_font: e.target.value })
                  }
                  className="w-full h-8 px-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                  Body Font
                </label>
                <input
                  type="text"
                  value={philosophy.body_font}
                  onChange={(e) =>
                    setPhilosophy({ ...philosophy, body_font: e.target.value })
                  }
                  className="w-full h-8 px-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800"
                />
              </div>

              {/* Colors */}
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                  Primary Brand Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={philosophy.primary_color}
                    onChange={(e) =>
                      setPhilosophy({ ...philosophy, primary_color: e.target.value })
                    }
                    className="w-8 h-8 rounded-lg cursor-pointer border border-zinc-200"
                  />
                  <input
                    type="text"
                    value={philosophy.primary_color}
                    onChange={(e) =>
                      setPhilosophy({ ...philosophy, primary_color: e.target.value })
                    }
                    className="flex-1 h-8 px-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-mono text-zinc-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                  Secondary / Telemetry Accent
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={philosophy.secondary_color}
                    onChange={(e) =>
                      setPhilosophy({ ...philosophy, secondary_color: e.target.value })
                    }
                    className="w-8 h-8 rounded-lg cursor-pointer border border-zinc-200"
                  />
                  <input
                    type="text"
                    value={philosophy.secondary_color}
                    onChange={(e) =>
                      setPhilosophy({ ...philosophy, secondary_color: e.target.value })
                    }
                    className="flex-1 h-8 px-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-mono text-zinc-800"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                Design Principles & Tone of Voice
              </label>
              <textarea
                value={philosophy.philosophy_markdown || ''}
                onChange={(e) =>
                  setPhilosophy({
                    ...philosophy,
                    philosophy_markdown: e.target.value,
                  })
                }
                rows={3}
                className="w-full p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-800 font-sans"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => setIsPhilosophyModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePhilosophy}
                disabled={savingPhilosophy}
                className="px-5 py-2 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {savingPhilosophy ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Save to SQLite</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPONENT LIBRARY MODAL */}
      {isComponentLibraryOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-black/[0.08] shadow-2xl w-full max-w-2xl p-6 space-y-4 animate-card-entry flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <Component className="w-4 h-4 text-amber-600" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    Project Component & Template Library
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {scanData?.components.length || 0} scanned UI elements from codebase
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsComponentLibraryOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {scanData?.scannedFiles && scanData.scannedFiles.length > 0 ? (
                scanData.scannedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800 font-mono">
                        {file.fileName}
                      </span>
                      <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700 uppercase font-bold">
                        {file.category}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500 truncate">
                      {file.path}
                    </div>
                    {file.snippet && (
                      <pre className="text-[10px] font-mono bg-white p-2 rounded-lg text-zinc-600 border border-zinc-100 max-h-24 overflow-auto">
                        {file.snippet.slice(0, 300)}...
                      </pre>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-zinc-400">
                  No components scanned yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW SCREEN MODAL */}
      {isNewScreenModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-black/[0.08] shadow-2xl w-full max-w-md p-6 space-y-4 animate-card-entry">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-zinc-900">
                  Add Screen to Canvas Board
                </h3>
              </div>
              <button
                onClick={() => setIsNewScreenModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                  Screen Name / Route
                </label>
                <input
                  type="text"
                  placeholder="e.g. Telemetry Analytics Cockpit, Settings › Integrations..."
                  value={newScreenNameInput}
                  onChange={(e) => setNewScreenNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateNewScreen();
                  }}
                  autoFocus
                  className="w-full h-9 px-3 rounded-xl border border-zinc-200 bg-zinc-50 font-semibold text-zinc-800 focus:outline-none focus:border-zinc-400"
                />
              </div>

              {/* Suggestions from Scanned Codebase */}
              {availableScreens.length > 0 && (
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-zinc-400 mb-1">
                    Quick Add Scanned Route
                  </label>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-1 bg-zinc-50 rounded-xl border border-zinc-100">
                    {availableScreens.map((s) => (
                      <button
                        key={s}
                        onClick={() => setNewScreenNameInput(s)}
                        className="px-2 py-1 bg-white hover:bg-zinc-200/80 rounded-lg border border-zinc-200 text-[11px] text-zinc-700 transition cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => setIsNewScreenModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewScreen}
                disabled={!newScreenNameInput.trim()}
                className="px-5 py-2 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                <span>Add Screen to Canvas</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Connect Project Modal */}
      <AddProjectModal
        isOpen={isAddProjectModalOpen}
        onClose={() => setIsAddProjectModalOpen(false)}
        onProjectAdded={handleProjectAdded}
      />
    </div>
  );
};

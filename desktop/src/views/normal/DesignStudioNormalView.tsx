import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Send,
  Plus,
  Play,
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  MessageSquare,
  ShieldCheck,
  Code2,
  Share2,
  Maximize2,
  CheckCircle2,
  Paperclip,
  FolderGit2,
  Sparkle,
  Layers,
  Sliders,
  Type,
  Palette,
  LayoutGrid,
  Zap,
  Check,
  X,
  FileCode,
  ArrowRight,
} from 'lucide-react';
import { DesignProject, DesignScreen, DesignDirection, DesignComment } from '../../types/normalMode';

interface DesignStudioNormalViewProps {
  currentWorkspace: string;
  onBuildWithMyaOS: (projectTitle: string, screenHtml: string) => void;
}

const SAMPLE_DIRECTIONS: DesignDirection[] = [
  {
    id: 'dir_saas',
    name: 'SaaS Minimalist',
    description: 'Clean indigo & zinc surfaces, tight typography, high contrast CTAs.',
    primaryColor: '#4f46e5',
    accentColor: '#10b981',
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
  {
    id: 'dir_editorial',
    name: 'Editorial Warm',
    description: 'Serif headings, warm ivory backdrop, elegant card borders.',
    primaryColor: '#18181b',
    accentColor: '#d97706',
    fontHeading: 'Playfair Display',
    fontBody: 'DM Sans',
  },
  {
    id: 'dir_dark',
    name: 'High-Contrast Cyber',
    description: 'Midnight slate, glowing emerald accents, frosted glass cards.',
    primaryColor: '#09090b',
    accentColor: '#06b6d4',
    fontHeading: 'JetBrains Mono',
    fontBody: 'Inter',
  },
];

const INITIAL_SCREENS: DesignScreen[] = [
  {
    id: 'scr_01',
    projectId: 'proj_myaos_landing',
    name: '01 Hero & Platform Overview',
    versionNumber: 1,
    comments: [
      {
        id: 'c_01',
        screenId: 'scr_01',
        selector: 'h1',
        text: 'Make the headline copy slightly bolder and add sub-bullet benefits.',
        author: 'Winston',
        xPercentage: 45,
        yPercentage: 22,
        status: 'open',
        createdAt: '10m ago',
      },
    ],
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>body { font-family: 'Inter', sans-serif; background: #faf9f6; color: #18181b; }</style>
</head>
<body class="p-8 sm:p-12 min-h-screen flex flex-col justify-between">
  <!-- Header -->
  <header class="flex items-center justify-between border-b border-black/5 pb-6">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-2xl bg-zinc-900 text-white font-bold flex items-center justify-center text-sm shadow-md">M</div>
      <span class="text-base font-bold tracking-tight">MyaOS Work</span>
    </div>
    <div className="flex items-center gap-4 text-xs font-semibold text-zinc-600">
      <a href="#" class="hover:text-zinc-900">Coworkers</a>
      <a href="#" class="hover:text-zinc-900">Connected Tools</a>
      <a href="#" class="hover:text-zinc-900">Routines</a>
      <button class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition">Ask MyaOS</button>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="my-12 max-w-3xl space-y-6">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold">
      <span class="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
      Autonomous Digital Coworker Operating System
    </div>

    <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-900 leading-tight">
      Tell MyaOS what you need. <br><span class="text-indigo-600">It gets done.</span>
    </h1>

    <p class="text-base text-zinc-600 leading-relaxed max-w-xl">
      Assign work to persistent digital coworkers like Muse, Astra, and Kael. They use real tools, execute background routines, and deliver verified evidence proofs.
    </p>

    <!-- Natural Language Box Preview -->
    <div class="p-4 bg-white border border-black/10 rounded-2xl shadow-lg space-y-3">
      <div class="flex items-center gap-3 text-sm text-zinc-400">
        <span class="text-indigo-600 font-bold">✨</span>
        <span>"Check my website for broken pages and prepare a summary report"</span>
      </div>
      <div class="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-100">
        <span>Assigned to Vela & Kael</span>
        <span class="px-3 py-1 bg-indigo-600 text-white font-semibold rounded-lg">Delegate Job →</span>
      </div>
    </div>
  </main>

  <!-- Feature Grid -->
  <footer class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8 border-t border-black/5 text-xs">
    <div class="p-4 bg-white rounded-2xl border border-black/5 shadow-2xs space-y-1">
      <div class="font-bold text-zinc-900">🤖 Digital Coworkers</div>
      <p class="text-zinc-500">Persistent role-based AI teammates with specialized duties.</p>
    </div>
    <div class="p-4 bg-white rounded-2xl border border-black/5 shadow-2xs space-y-1">
      <div class="font-bold text-zinc-900">🛡️ Verified Proofs</div>
      <p class="text-zinc-500">Independent regression checks and evidence ledgers.</p>
    </div>
    <div class="p-4 bg-white rounded-2xl border border-black/5 shadow-2xs space-y-1">
      <div class="font-bold text-zinc-900">⏰ Background Routines</div>
      <p class="text-zinc-500">Automated daily digests and uptime monitoring.</p>
    </div>
  </footer>
</body>
</html>`,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'scr_02',
    projectId: 'proj_myaos_landing',
    name: '02 Coworkers Roster & Task Flow',
    versionNumber: 1,
    comments: [],
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-8 bg-[#faf9f6] font-sans text-zinc-800">
  <div class="max-w-2xl mx-auto space-y-6">
    <h2 class="text-xl font-bold">Your Coworkers</h2>
    <div class="p-4 bg-white border border-zinc-200 rounded-2xl flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-fuchsia-600 text-white font-bold flex items-center justify-center">MU</div>
        <div>
          <div class="font-bold">Muse</div>
          <div class="text-xs text-zinc-500">Design & Prototyping Specialist</div>
        </div>
      </div>
      <span class="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">Available</span>
    </div>
  </div>
</body>
</html>`,
    createdAt: new Date().toISOString(),
  },
];

export const DesignStudioNormalView: React.FC<DesignStudioNormalViewProps> = ({
  currentWorkspace,
  onBuildWithMyaOS,
}) => {
  const [screens, setScreens] = useState<DesignScreen[]>(INITIAL_SCREENS);
  const [activeScreenId, setActiveScreenId] = useState<string>('scr_01');
  const [direction, setDirection] = useState<DesignDirection>(SAMPLE_DIRECTIONS[0]);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [canvasMode, setCanvasMode] = useState<'single' | 'flow' | 'play'>('single');
  const [chatPrompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ selector: string; text: string } | null>(null);
  const [comments, setComments] = useState<DesignComment[]>(INITIAL_SCREENS[0].comments);
  const [newCommentText, setNewCommentText] = useState('');
  const [showAddCommentPin, setShowAddCommentPin] = useState(false);

  const activeScreen = screens.find((s) => s.id === activeScreenId) || screens[0];

  const handleGenerateDesign = () => {
    if (!chatPrompt.trim()) return;
    setIsGenerating(true);

    setTimeout(() => {
      // Create updated or new screen HTML
      const updatedHtml = activeScreen.htmlContent.replace(
        /Tell MyaOS what you need\./g,
        chatPrompt.trim()
      );

      setScreens((prev) =>
        prev.map((s) =>
          s.id === activeScreenId
            ? { ...s, htmlContent: updatedHtml, versionNumber: s.versionNumber + 1 }
            : s
        )
      );

      setIsGenerating(false);
      setPrompt('');
    }, 1200);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const newComment: DesignComment = {
      id: `c_${Date.now()}`,
      screenId: activeScreenId,
      selector: selectedElement?.selector || 'body',
      text: newCommentText.trim(),
      author: 'Winston',
      xPercentage: 50,
      yPercentage: 30,
      status: 'open',
      createdAt: 'Just now',
    };

    setComments((prev) => [...prev, newComment]);
    setNewCommentText('');
    setShowAddCommentPin(false);
  };

  const viewportWidthClass =
    viewport === 'desktop' ? 'w-full max-w-5xl' : viewport === 'tablet' ? 'w-[768px]' : 'w-[390px]';

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
              Muse & Astra
            </span>
          </div>
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
            <span className="hidden sm:inline text-[10.5px]">1440px</span>
          </button>
          <button
            onClick={() => setViewport('tablet')}
            className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
              viewport === 'tablet' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
            }`}
            title="Tablet Viewport (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[10.5px]">768px</span>
          </button>
          <button
            onClick={() => setViewport('mobile')}
            className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
              viewport === 'mobile' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800'
            }`}
            title="Mobile Viewport (390px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[10.5px]">390px</span>
          </button>
        </div>

        {/* Action Handoff */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onBuildWithMyaOS(activeScreen.name, activeScreen.htmlContent)}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer active:scale-[0.97]"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Build with MyaOS →</span>
          </button>
        </div>
      </header>

      {/* ──────────────────  3-LEVEL MAIN BODY  ────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-12 overflow-hidden">
        {/* LEFT PANEL: Conversation & Controls (360px - col-span-4) */}
        <div className="col-span-4 bg-white border-r border-black/[0.06] flex flex-col h-full min-w-[320px] overflow-hidden">
          {/* Muse Assistant Header */}
          <div className="p-3.5 border-b border-zinc-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-zinc-900">Design Assistant</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">gemini-3.8-flash</span>
            </div>

            {/* Direction Selector */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                Design Direction
              </span>
              <div className="grid grid-cols-3 gap-1">
                {SAMPLE_DIRECTIONS.map((dir) => (
                  <button
                    key={dir.id}
                    onClick={() => setDirection(dir)}
                    className={`p-1.5 rounded-xl border text-[10.5px] font-medium transition cursor-pointer text-left truncate ${
                      direction.id === dir.id
                        ? 'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-950 font-bold'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    {dir.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs leading-relaxed">
            <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                <span>Muse [Design Specialist]</span>
                <span>Just now</span>
              </div>
              <p className="text-zinc-700">
                I've calibrated the design system for <strong>{direction.name}</strong>. You can refine any component by chatting or clicking elements on the canvas.
              </p>
            </div>

            {/* Extracted Tokens */}
            <div className="space-y-1.5 p-3 bg-fuchsia-50/50 rounded-2xl border border-fuchsia-100">
              <span className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-800 font-bold">
                Extracted Design Tokens
              </span>
              <div className="flex flex-wrap gap-1">
                <span className="px-2 py-0.5 rounded-md bg-white text-zinc-700 text-[10px] font-mono border border-zinc-200">
                  Font: {direction.fontHeading}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white text-zinc-700 text-[10px] font-mono border border-zinc-200 flex items-center gap-1">
                  Primary: <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: direction.primaryColor }} />
                </span>
              </div>
            </div>

            {/* Comment Pins List */}
            {comments.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1">
                  <MessageSquare className="w-3 h-3 text-indigo-600" />
                  <span>Canvas Feedback Pins ({comments.length})</span>
                </span>
                {comments.map((c) => (
                  <div key={c.id} className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] space-y-1">
                    <div className="flex items-center justify-between font-mono text-[10px] text-amber-900">
                      <span>{c.author} on `{c.selector}`</span>
                      <span>{c.createdAt}</span>
                    </div>
                    <p className="text-amber-950 font-medium">{c.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-zinc-100 space-y-2 bg-white">
            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
              <span>Refine with Muse</span>
            </div>
            <div className="flex items-end gap-2 bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 focus-within:border-fuchsia-500 transition">
              <textarea
                rows={2}
                value={chatPrompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerateDesign();
                  }
                }}
                placeholder="Describe changes e.g. 'Add customer testimonial quotes' or 'Make primary button emerald'..."
                className="w-full bg-transparent resize-none text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none leading-relaxed"
              />
              <button
                onClick={handleGenerateDesign}
                disabled={!chatPrompt.trim() || isGenerating}
                className="h-8 w-8 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-40 text-white rounded-lg flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* CENTER/RIGHT: Live Interactive Canvas (col-span-8) */}
        <div className="col-span-8 bg-[#f4f3f0] flex flex-col h-full overflow-hidden relative">
          {/* Sub-header canvas mode bar */}
          <div className="h-9 px-4 bg-white/80 backdrop-blur-md border-b border-black/[0.04] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-700">{activeScreen.name}</span>
              <span className="text-[10px] font-mono text-zinc-400">v{activeScreen.versionNumber}</span>
            </div>

            <div className="flex items-center gap-2">
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

          {/* Add Comment Popover */}
          {showAddCommentPin && (
            <form
              onSubmit={handleAddComment}
              className="absolute top-12 left-1/2 -translate-x-1/2 w-80 bg-white border border-black/10 rounded-2xl p-3 shadow-xl z-50 animate-card-entry space-y-2"
            >
              <div className="text-xs font-bold text-zinc-900 flex items-center justify-between">
                <span>Pin Feedback to Canvas</span>
                <X className="w-3.5 h-3.5 text-zinc-400 cursor-pointer" onClick={() => setShowAddCommentPin(false)} />
              </div>
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="e.g. 'Make this CTA button green'..."
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-zinc-800 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
              >
                Save Comment Pin
              </button>
            </form>
          )}

          {/* Real Live HTML Iframe Canvas */}
          <div className="flex-1 p-6 overflow-auto flex justify-center items-start">
            <div className={`${viewportWidthClass} bg-white rounded-2xl shadow-xl overflow-hidden border border-black/10 transition-all duration-300 relative`}>
              <iframe
                srcDoc={activeScreen.htmlContent}
                title="MyaOS Live Design Prototype Canvas"
                className="w-full h-[640px] border-0 select-text"
              />
            </div>
          </div>

          {/* Bottom Bar: Accessibility & Quality Evidence Check */}
          <div className="h-10 px-4 bg-white border-t border-black/[0.06] flex items-center justify-between shrink-0 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Accessibility: 96/100 (Passed)</span>
              </span>
              <span className="text-zinc-300">·</span>
              <span className="text-zinc-500">WCAG AA Contrast Verified by Kael</span>
            </div>

            <div className="text-zinc-400">
              MyaOS Prototyping Engine
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Cpu,
  ChevronDown,
  ChevronUp,
  Terminal,
  ShieldCheck,
  Zap,
} from '@/components/icons';

interface MarkdownDocumentProps {
  content: string;
  defaultExpanded?: boolean;
  maxInitialHeight?: number;
}

export function MarkdownDocument({
  content,
  defaultExpanded = false,
  maxInitialHeight = 240,
}: MarkdownDocumentProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!content) return null;

  // Clean frontmatter if present
  let cleanContent = content;
  let metadata: Record<string, string> = {};
  if (content.startsWith('---')) {
    const endMatch = content.indexOf('---', 3);
    if (endMatch !== -1) {
      const frontmatter = content.substring(3, endMatch).trim();
      cleanContent = content.substring(endMatch + 3).trim();
      frontmatter.split('\n').forEach((line) => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join(':').trim().replace(/^["']|["']$/g, '');
          metadata[key] = val;
        }
      });
    }
  }

  // Parse custom blocks
  const lines = cleanContent.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        renderedElements.push(
          <div key={`code-${i}`} className="my-3 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xs">
            <div className="flex justify-between items-center px-3.5 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Terminal />
                <span>{codeLanguage || 'terminal'}</span>
              </span>
              <span>Command / Snippet</span>
            </div>
            <pre className="p-3.5 font-mono text-xs text-indigo-300 overflow-x-auto whitespace-pre leading-relaxed">
              {codeBuffer.join('\n')}
            </pre>
          </div>
        );
        codeBuffer = [];
      } else {
        inCodeBlock = true;
        codeLanguage = line.trim().replace('```', '');
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Dividers
    if (line.trim() === '---' || line.trim() === '***') {
      renderedElements.push(<hr key={`hr-${i}`} className="my-4 border-slate-200" />);
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      renderedElements.push(
        <h1 key={`h1-${i}`} className="text-base font-bold text-slate-900 mt-4 mb-2 tracking-tight flex items-center gap-2">
          <span>{line.replace('# ', '')}</span>
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      renderedElements.push(
        <h2 key={`h2-${i}`} className="text-sm font-bold text-slate-800 mt-3.5 mb-1.5 tracking-tight">
          {line.replace('## ', '')}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      renderedElements.push(
        <h3 key={`h3-${i}`} className="text-xs font-bold text-slate-800 uppercase tracking-wider mt-3 mb-1 text-indigo-600">
          {line.replace('### ', '')}
        </h3>
      );
      continue;
    }

    // Bullet points / lists
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const rawText = line.trim().substring(2);
      renderedElements.push(
        <div key={`li-${i}`} className="flex items-start gap-2.5 my-1 text-xs text-slate-700 leading-relaxed pl-1">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
          <span>{renderFormattedText(rawText)}</span>
        </div>
      );
      continue;
    }

    // Numbered lists
    const numMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      renderedElements.push(
        <div key={`num-${i}`} className="flex items-start gap-2 my-1 text-xs text-slate-700 leading-relaxed pl-1">
          <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
            {numMatch[1]}
          </span>
          <span>{renderFormattedText(numMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Empty lines
    if (!line.trim()) {
      renderedElements.push(<div key={`empty-${i}`} className="h-2" />);
      continue;
    }

    // Regular paragraphs
    renderedElements.push(
      <p key={`p-${i}`} className="my-1.5 text-xs text-slate-700 leading-relaxed">
        {renderFormattedText(line)}
      </p>
    );
  }

  const isLong = lines.length > 7 || cleanContent.length > 350;

  return (
    <div className="space-y-2">
      {/* Frontmatter Metadata Header if present */}
      {Object.keys(metadata).length > 0 && (
        <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200/80 mb-3 grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-600">
          {metadata.from && (
            <div>
              <span className="text-slate-400 font-semibold">From: </span>
              <strong className="text-slate-800">{metadata.from}</strong>
            </div>
          )}
          {metadata.to && (
            <div>
              <span className="text-slate-400 font-semibold">To: </span>
              <strong className="text-slate-800">{metadata.to}</strong>
            </div>
          )}
          {metadata.type && (
            <div>
              <span className="text-slate-400 font-semibold">Type: </span>
              <span className="px-1.5 py-0.5 bg-slate-200 rounded font-bold">{metadata.type}</span>
            </div>
          )}
          {metadata.related_task && (
            <div>
              <span className="text-slate-400 font-semibold">Task: </span>
              <span className="text-indigo-600 font-bold">{metadata.related_task}</span>
            </div>
          )}
        </div>
      )}

      {/* Expandable Container */}
      <div
        className={`relative overflow-hidden transition-all duration-300 ${
          !isExpanded && isLong ? 'max-h-56' : 'max-h-none'
        }`}
      >
        <div className="space-y-0.5">{renderedElements}</div>

        {!isExpanded && isLong && (
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
        )}
      </div>

      {/* Expand / Collapse Control Button */}
      {isLong && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer transition py-1"
        >
          {isExpanded ? (
            <>
              <ChevronUp />
              <span>Show Less</span>
            </>
          ) : (
            <>
              <ChevronDown />
              <span>Read Full Thread ({lines.length} lines)</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

// Inline formatting helper for bold, code, and links
function renderFormattedText(text: string): React.ReactNode {
  // Regex to split by **bold** or `code`
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 mx-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[11px] text-indigo-700 font-semibold"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

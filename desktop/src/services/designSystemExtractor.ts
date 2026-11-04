import { DesignPhilosophyData, ProjectUiScanData } from './geminiOrchestrator';

/**
 * Real, project-grounded design-token extraction. Parses CSS custom properties
 * and font-family declarations out of whatever style source the workspace
 * scanner found (tokens.css, globals.css, tailwind.config.*) rather than
 * returning a fixed palette regardless of project.
 */

interface ParsedCssVar {
  name: string;
  value: string;
}

function parseCssCustomProperties(css: string): ParsedCssVar[] {
  const vars: ParsedCssVar[] = [];
  const re = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    vars.push({ name: match[1].toLowerCase(), value: match[2].trim() });
  }
  return vars;
}

function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function pickVar(vars: ParsedCssVar[], keywords: string[], mustBeHex = true): string | undefined {
  for (const kw of keywords) {
    const found = vars.find((v) => v.name.includes(kw) && (!mustBeHex || isHexColor(v.value)));
    if (found) return found.value.trim();
  }
  return undefined;
}

function extractAllHexColors(css: string): string[] {
  const found = new Set<string>();
  const re = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    found.add(match[0].toLowerCase());
  }
  return Array.from(found);
}

function extractFontFamily(css: string, cssVars: ParsedCssVar[], varNameHints: string[]): string | undefined {
  const fromVar = pickVar(cssVars, varNameHints, false);
  if (fromVar) {
    const first = fromVar.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (first) return first;
  }
  const familyMatch = css.match(/font-family:\s*([^;]+);/i);
  if (familyMatch) {
    return familyMatch[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}

function extractRadius(cssVars: ParsedCssVar[]): string | undefined {
  const v = pickVar(cssVars, ['radius-md', 'radius', 'border-radius'], false);
  return v ? v.split(',')[0].trim() : undefined;
}

const NOT_A_COLOR = new Set(['#ffffff', '#fff', '#000000', '#000']);

/**
 * Builds a real DesignPhilosophyData from a project's actual scanned style
 * source. Falls back to reasonable generic defaults only for fields the
 * source genuinely doesn't declare — never silently substitutes a whole
 * fake palette for a project that has a real one.
 */
export function extractDesignPhilosophy(
  projectId: string,
  brandName: string,
  scan: ProjectUiScanData | null
): DesignPhilosophyData {
  const css = scan?.styleTokens || '';
  const cssVars = parseCssCustomProperties(css);
  const allHex = extractAllHexColors(css).filter((c) => !NOT_A_COLOR.has(c));

  const primaryColor =
    pickVar(cssVars, ['primary', 'brand', 'onyx', 'ink', 'dark']) || allHex[0] || '#18181b';
  const accentColor =
    pickVar(cssVars, ['accent', 'coral', 'highlight', 'cta']) ||
    allHex.find((c) => c !== primaryColor) ||
    '#e7a690';
  const secondaryColor =
    pickVar(cssVars, ['secondary', 'muted']) ||
    allHex.find((c) => c !== primaryColor && c !== accentColor) ||
    accentColor;
  const surfaceColor =
    pickVar(cssVars, ['surface', 'stone', 'background', 'bg-']) || '#faf9f6';

  const headingFont = extractFontFamily(css, cssVars, ['font-heading', 'heading-font', 'display-font']) || 'Inter';
  const bodyFont = extractFontFamily(css, cssVars, ['font-body', 'body-font']) || headingFont || 'Inter';
  const borderRadius = extractRadius(cssVars) || '12px';

  const source = css ? 'real project stylesheet (tokens.css / globals.css / tailwind config)' : 'no stylesheet found in scan — using generic defaults';

  return {
    brandName,
    headingFont,
    bodyFont,
    codeFont: 'JetBrains Mono',
    primaryColor,
    secondaryColor,
    accentColor,
    surfaceColor,
    borderRadius,
    tokensJson: cssVars.length ? JSON.stringify(cssVars.slice(0, 60)) : undefined,
    philosophyMarkdown: `Extracted from ${source} for project "${projectId}". ${
      cssVars.length ? `${cssVars.length} real CSS custom properties found.` : 'No custom properties found; relying on generic defaults.'
    }`,
  };
}

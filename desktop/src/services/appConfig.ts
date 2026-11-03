import { invoke } from '@tauri-apps/api/core';

// Machine-specific paths, resolved by the Rust side from ~/.myaos/config.json
// (or $MYAOS_CONFIG). Nothing in the frontend may hard-code a home directory.

export interface WorkspaceEntry {
  id: string;
  name: string;
  path: string;
}

export interface AppConfig {
  configPath: string | null;
  configFound: boolean;
  teamRepo: string | null;
  dbPath: string | null;
  home: string | null;
  workspaces: WorkspaceEntry[];
  agentWorkspaces: Record<string, string>;
  cloneParentDir: string | null;
  newProjectParentDir: string | null;
}

let current: AppConfig = {
  configPath: null,
  configFound: false,
  teamRepo: null,
  dbPath: null,
  home: null,
  workspaces: [],
  agentWorkspaces: {},
  cloneParentDir: null,
  newProjectParentDir: null,
};

/** Called once before the app renders. On failure the config stays empty. */
export async function loadAppConfig(): Promise<void> {
  try {
    current = await invoke<AppConfig>('myaos_get_config');
  } catch (e) {
    console.warn('Failed to load MyaOS config:', e);
  }
}

export const appConfig = (): AppConfig => current;

/** The team repo, or '' when it could not be resolved. */
export const teamRepo = (): string => current.teamRepo ?? '';

/** The agent's configured repo, falling back to the team repo. */
export const agentWorkspace = (agentId: string): string =>
  current.agentWorkspaces[agentId.toLowerCase()] ?? teamRepo();

/** Workspaces listed in the config, plus the team repo when it is not already listed. */
export const configuredWorkspaces = (): WorkspaceEntry[] => {
  const list = [...current.workspaces];
  const repo = teamRepo();
  if (repo && !list.some((w) => w.path === repo)) {
    list.unshift({ id: 'team-repo', name: repo.split('/').pop() || 'Team repo', path: repo });
  }
  return list;
};

/** Path of a workspace listed in the config by id, or '' when it is not configured. */
export const workspacePath = (id: string): string =>
  current.workspaces.find((w) => w.id === id)?.path ?? '';

/** A path shown relative to the home directory, e.g. "WebstormProjects/Myavana-Chatbot". */
export const shortPath = (fullPath: string): string => {
  const home = current.home;
  if (home && fullPath.startsWith(home + '/')) return fullPath.slice(home.length + 1);
  return fullPath;
};

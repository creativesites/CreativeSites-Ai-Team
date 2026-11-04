import type { WorkspaceState } from '@runtime/types';
import { Tag } from '@/components/app/status';

export function WorkspaceStatusBadge({
  state,
  loading = false,
  className,
}: {
  state?: WorkspaceState | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <span className={className}>
        <Tag tone="quiet">Checking state…</Tag>
      </span>
    );
  }

  if (!state) {
    return (
      <span className={className}>
        <Tag tone="quiet">Unknown</Tag>
      </span>
    );
  }

  if (state.unknown || state.error) {
    return (
      <span className={className} title={state.error ?? 'Unknown state'}>
        <Tag tone="quiet">Unknown{state.error ? `: ${state.error}` : ''}</Tag>
      </span>
    );
  }

  if (!state.exists) {
    return (
      <span className={className}>
        <Tag tone="risk">Folder missing</Tag>
      </span>
    );
  }

  if (!state.isGit) {
    return (
      <span className={className}>
        <Tag tone="claimed">Not a git repository</Tag>
      </span>
    );
  }

  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      <Tag tone="observed">{state.branch ?? 'detached HEAD'}</Tag>
      {state.headSha && (
        <span className="font-mono text-xs text-muted-foreground" title={`Commit ${state.headSha}`}>
          {state.headSha.slice(0, 7)}
        </span>
      )}
      {state.dirty ? <Tag tone="needs-you">Dirty</Tag> : <Tag tone="verified">Clean</Tag>}
    </div>
  );
}

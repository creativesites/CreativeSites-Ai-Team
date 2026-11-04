// K9: AI account isolation. Pure; wiring into the dispatcher comes later.
//
// Client work runs only on that client's account, and that account runs only that
// client's work. A project is tied to an account by projects.ai_account_id; an
// adapter reports the account it is signed in to (AdapterAuth.account.id).

import type { AiAccount } from './accounts.ts';

export interface IsolationProject {
  aiAccountId: string | null;
  confidential?: boolean | number | null;
}

export type IsolationResult = { ok: true } | { ok: false; reason: string };

export function checkAccountIsolation(
  project: IsolationProject,
  adapterAccountId: string | null | undefined,
  accounts: AiAccount[]
): IsolationResult {
  const live = accounts.filter((a) => !a.archivedAt);
  const signedIn = adapterAccountId ? live.find((a) => a.adapterAccountId === adapterAccountId) : undefined;

  if (!project.aiAccountId) {
    if (project.confidential) {
      return { ok: false, reason: 'A confidential project must be assigned an AI account before it can run.' };
    }
    if (signedIn && signedIn.ownerScope.startsWith('client:')) {
      return {
        ok: false,
        reason: `The adapter is signed in to a client-scoped account (${signedIn.ownerScope}), which only runs that client's projects, and this project has no AI account.`,
      };
    }
    return { ok: true };
  }

  const account = accounts.find((a) => a.id === project.aiAccountId);
  if (!account) return { ok: false, reason: `The project's AI account ${project.aiAccountId} does not exist.` };
  if (account.archivedAt) return { ok: false, reason: `The project's AI account ${account.id} is archived.` };
  if (!account.adapterAccountId) {
    return { ok: false, reason: `The project's AI account ${account.id} has no adapter login recorded, so the adapter cannot be verified.` };
  }
  if (!adapterAccountId) {
    return { ok: false, reason: 'The adapter does not report which account it is signed in to, so it cannot be verified for this project.' };
  }
  if (adapterAccountId !== account.adapterAccountId) {
    return {
      ok: false,
      reason: signedIn
        ? `The adapter is signed in to a different AI account (${signedIn.id}) than the project's (${account.id}).`
        : `The adapter is signed in to an account that is not the project's AI account (${account.id}).`,
    };
  }
  return { ok: true };
}

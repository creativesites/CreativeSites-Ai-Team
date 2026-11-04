import { invoke } from '@tauri-apps/api/core';

/**
 * Typed client for the Knowledge & Intelligence layer. Every call goes through the Tauri command
 * `myaos_knowledge_call`, which runs the Node KI RPC (bin/ki-rpc.js): one implementation of every rule
 * (permissions, authority, evidence gates). The webview never decides its own privileges.
 */
export async function ki<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('myaos_knowledge_call', { method, params });
}

export type EvidenceRef = { type: string; id: string; label?: string };

export interface KiDocument {
  id: string; displayName: string; category: string; classification: string; status: string; projectId: string | null;
  sourceKind: string; authorId: string; createdAt: string; updatedAt: string; latestStatus?: string; description?: string;
  current: null | { versionId: string; versionNo: number; filename: string; mime: string; size: number; hash: string; status: string };
}
export interface KiVersion {
  id: string; versionNo: number; filename: string; size: number; hash: string; status: string; isCurrent: boolean; extractor?: string;
  extractionQuality?: string; chunkCount: number; extractionError?: any; indexError?: any; receivedAt: string; availableAt?: string; changeNote?: string; createdBy: string;
}
export interface KiKnowledge {
  id: string; type: string; title: string; content: string; status: string; authority: number; authorityName: string; confidence: number;
  verificationClass: string; projectId: string | null; sourceId?: string; sourceRef?: any; derivedBy: string; evidenceType: string; authorId: string;
  capturedAt: string; effectiveAt?: string; supersededBy?: string; approvedBy?: string; staleSource: boolean; reviewDue: boolean; expired: boolean; classification: string;
  openConflicts?: { id: string; reason: string }[];
}
export interface KiCommitment {
  id: string; kind: string; description: string; status: string; effectiveStatus: string; overdue: boolean; priority: string; confidence: number;
  confirmation: string; sourceId?: string; sourcePlatform?: string; sourceAuthor?: string; sourceRef?: any; capturedAt: string; requester?: string;
  responsibleId?: string; projectId?: string; deadlineAt?: string; deadlineText?: string; deadlineNeedsClarification: boolean; acceptanceCriteria: string[];
  resolutionNotes?: string; blockedReason?: string; lowConfidence: boolean; fulfilledAt?: string;
  tasks?: { taskId: string; relation: string; title?: string; status: string; assigneeId?: string; verified: boolean; verificationReason: string }[];
  evidence?: { id: string; class: string; summary: string; submittedBy: string; verifiedBy?: string; independentlyVerified: boolean; createdAt: string }[];
  history?: { from_status: string | null; to_status: string; actor: string; reason?: string; ts: string }[];
  source?: { id: string; platform: string; channel?: string; authorId?: string; authorName?: string; originalTs?: string; originalUrl?: string; text: string; trust: string } | null;
}
export interface KiBriefLine { text: string; evidence: EvidenceRef[]; severity?: string }
export interface KiBrief { title?: string; kind: string; sections: { title: string; items: KiBriefLine[]; count?: number }[]; attention: KiBriefLine[]; fingerprint: string; generatedAt: string; markdown?: string; funnel?: Record<string, number> }

export const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

// Department mapping (WP2 task 2.7, K5). The §13 table lives in scripts/apply-departments.ts;
// this module holds the reusable, idempotent apply function.

import type { Repo } from '../store/repo.ts';
import type * as T from '../api/types.ts';

/** Sets identities.department_id and seniority for identities that exist. Safe to run repeatedly. */
export function applyDepartmentMapping(repo: Repo, mapping: Record<string, T.DepartmentMappingEntry>): T.DepartmentMappingResult {
  return repo.applyDepartmentMapping(mapping);
}

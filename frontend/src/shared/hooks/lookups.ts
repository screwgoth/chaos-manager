/**
 * Lookup hooks — reference data and org units, with id → name resolution.
 *
 * Every list view shows role, skill, project-type and org-unit NAMES, while the records hold
 * ids (BR-C-04 keeps references by identifier so renaming propagates). These hooks are the one
 * place that mapping happens, so a rename cannot leave a stale label on one screen and not
 * another.
 *
 * BR-C-05: a DEACTIVATED entry must still RESOLVE. A member keeps a role that was later
 * retired, and the member page must still show its name — so lookups always fetch with
 * `includeInactive=true`, while PICKERS filter to active. That asymmetry is the rule.
 */

import { useQuery } from '@tanstack/react-query';
import { api, query } from '../api/client';
import { queryKeys } from '../api/queries';
import type { OrgUnit, OrgUnitNode, ReferenceDataEntry, ReferenceType } from '../api/types';

export function useReferenceData(type: ReferenceType, includeInactive = true) {
  return useQuery({
    queryKey: [...queryKeys.referenceData(type), includeInactive],
    queryFn: () =>
      api.get<{ items: ReferenceDataEntry[] }>(
        `/api/reference-data${query({ type, includeInactive })}`,
      ),
    select: (response) => response.items,
  });
}

export function useOrgUnits(includeInactive = true) {
  return useQuery({
    queryKey: [...queryKeys.orgUnits(), includeInactive],
    queryFn: () => api.get<{ items: OrgUnit[] }>(`/api/org-units${query({ includeInactive })}`),
    select: (response) => response.items,
  });
}

export function useOrgUnitHierarchy(includeInactive = true) {
  return useQuery({
    queryKey: [...queryKeys.orgUnitHierarchy(), includeInactive],
    queryFn: () =>
      api.get<{ items: OrgUnitNode[] }>(`/api/org-units/hierarchy${query({ includeInactive })}`),
    select: (response) => response.items,
  });
}

/**
 * A name resolver for one reference type.
 *
 * Returns the id itself when a name is unknown, rather than an empty cell — a blank where a
 * role should be reads as missing data, whereas the raw id at least says "this points
 * somewhere I could not resolve".
 */
export function useNameResolver(type: ReferenceType): (id: string | null) => string {
  const { data } = useReferenceData(type, true);

  return (id: string | null): string => {
    if (id === null) return '—';
    return data?.find((entry) => entry.id === id)?.name ?? id;
  };
}

export function useOrgUnitResolver(): (id: string | null) => string {
  const { data } = useOrgUnits(true);

  return (id: string | null): string => {
    if (id === null) return '—';
    return data?.find((unit) => unit.id === id)?.name ?? id;
  };
}

/** Today, as the date-only string the whole API speaks. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

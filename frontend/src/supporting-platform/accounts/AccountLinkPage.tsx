/**
 * AccountLinkPage — US-ACC-04.
 *
 * THE UNLINK CONFIRMATION IS THE POINT OF THIS SCREEN. For a TEAM_MEMBER, unlinking revokes ALL
 * their access (BR-L-04 + BR-R-18), and nothing about the word "unlink" suggests that. The dialog
 * says so in those words rather than asking "are you sure?".
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import { ApiError } from '../../shared/api/client';
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FormErrors,
  LoadingState,
  Select,
  type Column,
} from '../../shared/components';
import type { MemberSummary, Page } from '../../shared/api/types';

interface AccountRow {
  id: string;
  username: string;
  role: string;
  homeOrgUnitId: string | null;
  isActive: boolean;
  linkedMember: { id: string; fullName: string } | null;
}

export function AccountLinkPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState<AccountRow | null>(null);
  const [unlinking, setUnlinking] = useState<AccountRow | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<{ items: AccountRow[] }>('/api/accounts'),
  });

  // Assignable members are already scoped server-side; an admin sees all of them.
  const members = useQuery({
    queryKey: ['members', 'for-linking'],
    queryFn: () => api.get<Page<MemberSummary>>('/api/members?limit=500'),
    enabled: linking !== null,
  });

  function done(): void {
    setLinking(null);
    setUnlinking(null);
    setSelectedMemberId('');
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['accounts'] });
  }

  const linkMutation = useMutation({
    mutationFn: (input: { accountId: string; memberId: string }) =>
      api.post(`/api/accounts/${input.accountId}/link`, { memberId: input.memberId }),
    onSuccess: done,
    onError: (caught) => setError(caught instanceof ApiError ? caught : null),
  });

  const unlinkMutation = useMutation({
    mutationFn: (accountId: string) => api.delete(`/api/accounts/${accountId}/link`),
    onSuccess: done,
    onError: (caught) => setError(caught instanceof ApiError ? caught : null),
  });

  const columns: Column<AccountRow>[] = [
    { key: 'username', header: 'Account', render: (row) => row.username },
    { key: 'role', header: 'Role', render: (row) => row.role.replace(/_/g, ' ').toLowerCase() },
    {
      key: 'linked',
      header: 'Linked person',
      render: (row) =>
        row.linkedMember === null ? (
          // BR-L-07: a member with no account is a complete, normal state — not a warning.
          <span className="text-slate-400">—</span>
        ) : (
          <span data-testid={`account-link-${row.id}`}>{row.linkedMember.fullName}</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.linkedMember === null ? (
          <Button
            variant="secondary"
            onClick={() => {
              setLinking(row);
              setError(null);
            }}
            data-testid={`account-link-button-${row.id}`}
          >
            Link
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              setUnlinking(row);
              setError(null);
            }}
            data-testid={`account-unlink-button-${row.id}`}
          >
            Unlink
          </Button>
        ),
    },
  ];

  if (accounts.isLoading) return <LoadingState />;
  if (accounts.isError) return <ErrorState error={accounts.error} />;

  const rows = accounts.data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Accounts</h1>
        <p className="mt-1 text-sm text-slate-600">
          Link a login to the person it belongs to, so that person can see their own assignments. A
          person without a login is still tracked and assignable.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState message="There are no user accounts yet." />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />
      )}

      {linking !== null && (
        <Dialog
          title={`Link ${linking.username} to a person`}
          onClose={() => {
            setLinking(null);
            setError(null);
          }}
          footer={
            <>
              <Button
                disabled={selectedMemberId === '' || linkMutation.isPending}
                onClick={() =>
                  linkMutation.mutate({ accountId: linking.id, memberId: selectedMemberId })
                }
                data-testid="account-link-confirm"
              >
                Link
              </Button>
              <Button variant="secondary" onClick={() => setLinking(null)}>
                Cancel
              </Button>
            </>
          }
        >
          {error !== null && <FormErrors error={error} />}
          <Field label="Person" htmlFor="link-member">
            <Select
              id="link-member"
              data-testid="account-link-member-select"
              value={selectedMemberId}
              onChange={(event) => setSelectedMemberId(event.target.value)}
            >
              <option value="">Choose…</option>
              {(members.data?.items ?? []).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                </option>
              ))}
            </Select>
          </Field>
        </Dialog>
      )}

      {unlinking !== null && (
        <Dialog
          title={`Unlink ${unlinking.username}?`}
          tone="warning"
          onClose={() => {
            setUnlinking(null);
            setError(null);
          }}
          footer={
            <>
              <Button
                disabled={unlinkMutation.isPending}
                onClick={() => unlinkMutation.mutate(unlinking.id)}
                data-testid="account-unlink-confirm"
              >
                Unlink
              </Button>
              <Button variant="secondary" onClick={() => setUnlinking(null)}>
                Cancel
              </Button>
            </>
          }
        >
          {error !== null && <FormErrors error={error} />}

          <p className="text-sm text-slate-700">
            {unlinking.linkedMember?.fullName} will no longer be connected to this login.
          </p>

          {/**
           * BR-L-04 + BR-R-18. This is a real access revocation dressed as a small administrative
           * edit, so it is stated plainly rather than left for the admin to discover from a
           * support call.
           */}
          {unlinking.role === 'TEAM_MEMBER' && (
            <p
              className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
              data-testid="account-unlink-warning"
            >
              This account will lose access to all data until it is linked again. A team member can
              only see their own record, so with no link there is nothing for them to see.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

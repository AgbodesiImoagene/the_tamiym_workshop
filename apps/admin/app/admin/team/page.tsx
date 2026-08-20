'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Search results intentionally seed editable role drafts. */

import { AdminShell, formatAdminDate } from '@/components/admin-shell';
import { searchAdminUsers, updateAdminUserRole, type AdminDirectoryUser } from '@/lib/dashboard';
import { authApi } from '@/lib/auth';
import { UserRole } from '@tamiym/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

const ROLE_OPTIONS = [UserRole.CUSTOMER, UserRole.ORGANIZER, UserRole.ADMIN] as const;

function roleLabel(role: UserRole) {
  switch (role) {
    case UserRole.ADMIN:
      return 'Admin';
    case UserRole.ORGANIZER:
      return 'Organizer';
    default:
      return 'Customer';
  }
}

export default function AdminTeamPage() {
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>({});
  const [rowError, setRowError] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    authApi.getMe().then((u) => {
      if (!cancelled) setCurrentUserId(u.id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const usersQuery = useQuery({
    queryKey: ['admin-users', appliedQuery],
    queryFn: () =>
      searchAdminUsers({
        q: appliedQuery || undefined,
        take: 50,
      }),
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  useEffect(() => {
    setDraftRoles((prev) => {
      const next: Record<string, UserRole> = {};
      let changed = false;
      for (const u of users) {
        const current = prev[u.id];
        next[u.id] = current ?? u.role;
        if (current === undefined) changed = true;
      }
      if (!changed && Object.keys(prev).length === users.length) {
        return prev;
      }
      return next;
    });
  }, [users]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      return updateAdminUserRole(id, role);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminDirectoryUser[] | undefined>(
        ['admin-users', appliedQuery],
        (old) => old?.map((u) => (u.id === updated.id ? { ...u, ...updated } : u))
      );
      setDraftRoles((d) => ({ ...d, [updated.id]: updated.role }));
      setRowError((e) => ({ ...e, [updated.id]: null }));
    },
    onError: (err: Error & { message?: string }, { id }) => {
      setRowError((e) => ({
        ...e,
        [id]: err.message ?? 'Update failed',
      }));
    },
  });

  const applySearch = useCallback(() => {
    setAppliedQuery(searchDraft.trim());
  }, [searchDraft]);

  const dirtyById = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const u of users) {
      const draft = draftRoles[u.id];
      m[u.id] = draft !== undefined && draft !== u.role;
    }
    return m;
  }, [users, draftRoles]);

  return (
    <AdminShell
      activeNav="team"
      title="Admins & roles"
      description="Search users and grant or revoke admin access. Removing the last admin is blocked. Role changes sign the user out of other sessions (refresh tokens are cleared)."
    >
      <div className="space-y-6">
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Find users</CardTitle>
            <CardDescription>
              Search by email or name. Leave blank to list the most recently created accounts (up to
              50).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="user-search">Search</Label>
              <Input
                id="user-search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applySearch();
                }}
                placeholder="email or name"
                className="rounded-xl"
              />
            </div>
            <Button
              type="button"
              className="rounded-xl"
              onClick={applySearch}
              disabled={usersQuery.isFetching}
            >
              Search
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Any admin can change another user&apos;s role. You cannot remove admin from the only
              remaining admin account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usersQuery.isError && (
              <p className="text-sm text-red-600">Could not load users. Try again.</p>
            )}
            {usersQuery.isLoading ? (
              <p className="text-sm text-black/60">Loading…</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-black/60">No users match this search.</p>
            ) : (
              <div className="rounded-xl border border-black/8">
                <Table className="min-w-[640px]">
                  <TableHeader className="border-b border-black/8 bg-black/[0.02] text-xs uppercase tracking-wide text-black/55">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-4 py-3 font-semibold">User</TableHead>
                      <TableHead className="px-4 py-3 font-semibold">Status</TableHead>
                      <TableHead className="px-4 py-3 font-semibold">Joined</TableHead>
                      <TableHead className="px-4 py-3 font-semibold">Role</TableHead>
                      <TableHead className="px-4 py-3 font-semibold"> </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const draft = draftRoles[u.id] ?? u.role;
                      const dirty = dirtyById[u.id];
                      const isSelf = currentUserId === u.id;
                      return (
                        <TableRow key={u.id} className="border-b border-black/6 last:border-0">
                          <TableCell className="px-4 py-3">
                            <div className="font-medium text-tamiym-blue">{u.email}</div>
                            <div className="text-black/55">
                              {u.firstName} {u.lastName}
                              {isSelf ? (
                                <span className="ml-2 text-xs font-semibold text-black/40">
                                  (you)
                                </span>
                              ) : null}
                            </div>
                            {rowError[u.id] ? (
                              <p className="mt-1 text-xs text-red-600">{rowError[u.id]}</p>
                            ) : null}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-black/70">{u.status}</TableCell>
                          <TableCell className="px-4 py-3 text-black/70">
                            {formatAdminDate(u.createdAt)}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Select
                              value={draft}
                              onValueChange={(val) =>
                                setDraftRoles((d) => ({ ...d, [u.id]: val as UserRole }))
                              }
                              disabled={updateMutation.isPending}
                            >
                              <SelectTrigger className="w-full max-w-[11rem] rounded-lg">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {roleLabel(r)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-lg"
                              disabled={!dirty || updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: u.id, role: draft })}
                            >
                              Update
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

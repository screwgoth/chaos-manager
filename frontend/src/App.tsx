/**
 * Route map and application shell.
 *
 * ROLE-BASED LANDING (frontend-components.md §3, step 4): a Team Member lands on their own
 * assignments; everyone else lands on the allocation view. That is not cosmetic — a Team
 * Member's scope permits almost nothing on the allocation view, so sending them there would
 * open the product on a screen that is empty for them.
 */

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { SessionGuard, SignOutButton } from './core-domain/auth/SessionGuard';
import { MemberListPage } from './core-domain/members/MemberListPage';
import { MemberDetailPage } from './core-domain/members/MemberDetailPage';
import { MemberFormPage } from './core-domain/members/MemberFormPage';
import { ProjectListPage } from './core-domain/projects/ProjectListPage';
import { ProjectDetailPage } from './core-domain/projects/ProjectDetailPage';
import { ProjectFormPage } from './core-domain/projects/ProjectFormPage';
import { AssignmentFormPage } from './core-domain/assignments/AssignmentFormPage';
import { AllocationViewPage } from './core-domain/views/AllocationViewPage';
import { AvailabilitySearchPage } from './core-domain/views/AvailabilitySearchPage';
import { MyAssignmentsPage } from './core-domain/views/MyAssignmentsPage';
import { HistoricalAllocationPage } from './core-domain/views/HistoricalAllocationPage';
import { ReferenceDataPage } from './core-domain/admin/ReferenceDataPage';
import { OrgUnitPage } from './core-domain/admin/OrgUnitPage';
import { useSession } from './shared/session/SessionProvider';
import { ImportPage } from './supporting-platform/import/ImportPage';
import { AccountLinkPage } from './supporting-platform/accounts/AccountLinkPage';
import { BenchPage } from './supporting-platform/views/BenchPage';
import { OverAllocatedPage } from './supporting-platform/views/OverAllocatedPage';
import { ExpiringContractsPage } from './supporting-platform/views/ExpiringContractsPage';

/** Where each role starts. */
function landingPath(role: string): string {
  return role === 'TEAM_MEMBER' ? '/my-assignments' : '/allocations';
}

/**
 * ⚠️ `hideFor` IS A COURTESY, NOT A CONTROL (FR-R-08, U2-NFR-U-03).
 *
 * Every entry below is also enforced server-side. Navigating directly to a hidden route renders
 * the page, and its API calls are refused independently — which is why `ImportPage` renders an
 * explicit FORBIDDEN state rather than treating 403 as a bug.
 *
 * The three Unit 2 view pages hide from TEAM_MEMBER because each is a cross-population question,
 * and a list of one person answers nothing.
 */
const NAV = [
  { to: '/allocations', label: 'Allocation', hideFor: ['TEAM_MEMBER'] },
  { to: '/availability', label: 'Availability', hideFor: ['TEAM_MEMBER'] },
  { to: '/bench', label: 'Bench', hideFor: ['TEAM_MEMBER'] },
  { to: '/over-allocated', label: 'Over capacity', hideFor: ['TEAM_MEMBER'] },
  { to: '/members', label: 'People', hideFor: ['TEAM_MEMBER'] },
  { to: '/expiring-contracts', label: 'Contracts', hideFor: ['TEAM_MEMBER'] },
  { to: '/projects', label: 'Projects', hideFor: ['TEAM_MEMBER'] },
  { to: '/my-assignments', label: 'My work', hideFor: [] },
  { to: '/history', label: 'History', hideFor: ['TEAM_MEMBER'] },
  { to: '/admin/reference-data', label: 'Lists', hideFor: ['TEAM_MEMBER', 'TEAM_LEAD', 'EXECUTIVE'] },
  { to: '/admin/org-units', label: 'Org units', hideFor: ['TEAM_MEMBER', 'TEAM_LEAD', 'EXECUTIVE'] },
  { to: '/admin/accounts', label: 'Accounts', hideFor: ['TEAM_MEMBER', 'TEAM_LEAD', 'EXECUTIVE', 'RESOURCE_MANAGER'] },
  { to: '/import', label: 'Import', hideFor: ['TEAM_MEMBER', 'TEAM_LEAD', 'EXECUTIVE', 'RESOURCE_MANAGER'] },
];

function Shell(): JSX.Element {
  const { user } = useSession();
  const location = useLocation();
  const role = user?.role ?? 'TEAM_MEMBER';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-slate-900">C.H.A.O.S</span>

          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Main">
            {NAV.filter((item) => !item.hideFor.includes(role)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive
                    ? 'border-b-2 border-slate-900 pb-0.5 font-medium text-slate-900'
                    : 'pb-0.5 text-slate-600 hover:text-slate-900'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            <span data-testid="current-user">
              {user?.username} · {user?.role.toLowerCase().replace('_', ' ')}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6" key={location.pathname}>
        <Routes>
          <Route path="/" element={<Navigate to={landingPath(role)} replace />} />

          <Route path="/allocations" element={<AllocationViewPage />} />
          <Route path="/availability" element={<AvailabilitySearchPage />} />
          <Route path="/history" element={<HistoricalAllocationPage />} />
          <Route path="/my-assignments" element={<MyAssignmentsPage />} />

          <Route path="/members" element={<MemberListPage />} />
          <Route path="/members/new" element={<MemberFormPage />} />
          <Route path="/members/:id" element={<MemberDetailPage />} />
          <Route path="/members/:id/edit" element={<MemberFormPage />} />

          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/projects/new" element={<ProjectFormPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:id/edit" element={<ProjectFormPage />} />

          <Route path="/assignments/new" element={<AssignmentFormPage />} />
          <Route path="/assignments/:id/edit" element={<AssignmentFormPage />} />

          <Route path="/admin/reference-data" element={<ReferenceDataPage />} />
          <Route path="/admin/org-units" element={<OrgUnitPage />} />
          <Route path="/admin/accounts" element={<AccountLinkPage />} />

          {/* Unit 2 */}
          <Route path="/import" element={<ImportPage />} />
          <Route path="/bench" element={<BenchPage />} />
          <Route path="/over-allocated" element={<OverAllocatedPage />} />
          <Route path="/expiring-contracts" element={<ExpiringContractsPage />} />

          {/* An unknown client route goes to the role's landing page rather than a dead end. */}
          <Route path="*" element={<Navigate to={landingPath(role)} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <SessionGuard>
      <Shell />
    </SessionGuard>
  );
}

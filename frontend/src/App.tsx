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
import { Avatar } from './shared/components';
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
 *
 * GROUPED, because a flat list of thirteen links has no shape. The groups are ordered by how often
 * they are opened rather than alphabetically: planning daily, insights weekly, admin rarely.
 */
const NAV_GROUPS: { heading: string | null; items: NavItem[] }[] = [
  {
    heading: null,
    items: [
      { to: '/allocations', label: 'Allocation', hideFor: ['TEAM_MEMBER'] },
      { to: '/availability', label: 'Availability', hideFor: ['TEAM_MEMBER'] },
      { to: '/projects', label: 'Projects', hideFor: ['TEAM_MEMBER'] },
      { to: '/members', label: 'People', hideFor: ['TEAM_MEMBER'] },
      { to: '/my-assignments', label: 'My work', hideFor: [] },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { to: '/bench', label: 'Bench', hideFor: ['TEAM_MEMBER'] },
      { to: '/over-allocated', label: 'Over capacity', hideFor: ['TEAM_MEMBER'] },
      { to: '/expiring-contracts', label: 'Contracts', hideFor: ['TEAM_MEMBER'] },
      { to: '/history', label: 'History', hideFor: ['TEAM_MEMBER'] },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { to: '/admin/reference-data', label: 'Lists', hideFor: ['TEAM_MEMBER', 'TEAM_LEAD', 'EXECUTIVE'] },
      { to: '/admin/org-units', label: 'Org units', hideFor: ['TEAM_MEMBER', 'TEAM_LEAD', 'EXECUTIVE'] },
      {
        to: '/admin/accounts',
        label: 'Accounts',
        hideFor: ['TEAM_MEMBER', 'TEAM_LEAD', 'EXECUTIVE', 'RESOURCE_MANAGER'],
      },
      {
        to: '/import',
        label: 'Import',
        hideFor: ['TEAM_MEMBER', 'TEAM_LEAD', 'EXECUTIVE', 'RESOURCE_MANAGER'],
      },
    ],
  },
];

interface NavItem {
  to: string;
  label: string;
  hideFor: string[];
}

/**
 * A sidebar link.
 *
 * The active state carries THREE cues, not just a background tint: the teal left rule, the
 * brighter text, and `aria-current` from NavLink. On a dark ground a tint alone is close to
 * invisible for anyone with a dimmed or glare-hit screen.
 */
function SidebarLink({ item }: { item: NavItem }): JSX.Element {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `border-l-[3px] px-3 py-2 text-[13.5px] transition-colors ${
          isActive
            ? 'border-brand-500 bg-brand-500/[.16] font-semibold text-brand-300'
            : 'border-transparent text-white/60 hover:bg-white/[.06] hover:text-white'
        }`
      }
    >
      {item.label}
    </NavLink>
  );
}

function Shell(): JSX.Element {
  const { user } = useSession();
  const location = useLocation();
  const role = user?.role ?? 'TEAM_MEMBER';

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.hideFor.includes(role)),
    // A heading with nothing under it is worse than no heading — a Team Lead should not see an
    // empty "Administration" label implying a section they cannot reach.
  })).filter((group) => group.items.length > 0);

  return (
    /*
     * Sidebar beside content on large screens, stacked above it below `lg`. The fixed 222px rail
     * from the mockups would leave a phone with roughly 150px of usable width, so it becomes a
     * horizontal strip instead of shipping a layout nobody can use.
     */
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex flex-none flex-col bg-ink lg:w-[222px]">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span
            aria-hidden="true"
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[7px] bg-brand-500 text-[13px] font-bold text-white"
          >
            C
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold tracking-wide text-white">
              C.H.A.O.S
            </span>
            <span className="block text-[10px] text-white/40">Resource hub</span>
          </span>
        </div>

        <nav
          className="flex flex-1 flex-row gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0"
          aria-label="Main"
        >
          {groups.map((group) => (
            <div key={group.heading ?? 'primary'} className="flex flex-row gap-1 lg:flex-col">
              {group.heading ? (
                <p className="mt-4 hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-label text-white/30 lg:block">
                  {group.heading}
                </p>
              ) : null}
              {group.items.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </div>
          ))}
        </nav>

        {/* Identity sits at the foot of the rail, as in the mockups — persistent but never the
            first thing read. It matters most when someone is checking WHOSE scope they are in. */}
        <div className="mx-3 mt-auto hidden border-t border-white/10 px-2 py-4 lg:block">
          <div className="flex items-center gap-2.5">
            <Avatar name={user?.username ?? '?'} id={user?.username} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-white" data-testid="current-user">
                {user?.username}
              </p>
              <p className="truncate text-[10.5px] capitalize text-white/40">
                {user?.role.toLowerCase().replace('_', ' ')}
              </p>
            </div>
          </div>
          <div className="mt-2">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        {/* The compact identity row for stacked (small-screen) layout, where the rail's footer
            is hidden. */}
        <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-2 lg:hidden">
          <span className="text-[12.5px] text-ink-muted">{user?.username}</span>
          <span className="ml-auto">
            <SignOutButton />
          </span>
        </div>

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-7" key={location.pathname}>
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

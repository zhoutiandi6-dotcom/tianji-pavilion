type DashboardRouter = {
  back: () => void;
  replace: (href: string) => void;
};

type TaskListRole = "OPERATION" | "OPERATION_MANAGER" | "DESIGN_MANAGER" | "DESIGNER" | "OWNER" | "SUPER_ADMIN";

const taskListScopesByRole: Record<TaskListRole, readonly string[]> = {
  OPERATION: ["processing", "drafts", "archived"],
  OPERATION_MANAGER: ["processing", "archived", "ops-approvals", "approval-history"],
  DESIGN_MANAGER: ["processing", "archived", "design-assignment", "design-reviews", "design-tasks"],
  DESIGNER: ["processing", "archived"],
  OWNER: ["processing", "drafts", "archived", "ops-approvals", "approval-history", "design-flow-history", "design-assignment", "design-reviews", "design-tasks"],
  SUPER_ADMIN: ["processing", "drafts", "archived", "ops-approvals", "approval-history", "design-flow-history", "design-assignment", "design-reviews", "design-tasks"],
};

/** The role's existing, server-scoped task-list entry point. */
export function defaultTaskListPathForRole(role?: string) {
  // A design manager's useful landing queue is their existing design-task list;
  // every other role uses the existing processing list, whose API applies the
  // current SELF/GROUP/ALL_OPERATIONS/GLOBAL_ADMIN data scope on the server.
  return role === "DESIGN_MANAGER"
    ? "/dashboard/fazhi?scope=design-tasks"
    : "/dashboard/fazhi?scope=processing";
}

/**
 * A returnTo is navigation state, never an authorization grant. Image-task
 * detail accepts only a same-origin Fazhi list URL whose scope is available to
 * the signed-in role; filters, pagination, and list-restoration state remain
 * intact because the original query string is retained.
 */
export function isPermittedTaskListPath(value: string | null | undefined, role?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || typeof window === "undefined") return false;
  const supportedRole = role as TaskListRole;
  const allowedScopes = taskListScopesByRole[supportedRole];
  if (!allowedScopes) return false;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== "/dashboard/fazhi") return false;
    const scope = url.searchParams.get("scope") || "processing";
    return allowedScopes.includes(scope);
  } catch {
    return false;
  }
}

export function resolveImageTaskListReturnPath(returnTo: string | null | undefined, role?: string) {
  return isPermittedTaskListPath(returnTo, role) ? returnTo! : defaultTaskListPathForRole(role);
}

function isDashboardUrl(value?: string) {
  if (!value || typeof window === "undefined") return false;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/dashboard/");
  } catch {
    return false;
  }
}

/**
 * Go back only when the browser exposes an in-app predecessor. Replacing the
 * fallback prevents a directly opened detail page from creating a back loop.
 */
export function returnToPreviousDashboardPage(router: DashboardRouter, fallback: string, expectedPreviousPath?: string) {
  if (typeof window === "undefined") {
    router.replace(fallback);
    return;
  }

  const navigation = (window as any).navigation;
  const entries = navigation?.entries?.();
  const current = navigation?.currentEntry;
  const currentIndex = entries?.findIndex((entry: any) => entry.key === current?.key) ?? -1;
  const previousUrl = currentIndex > 0 ? entries[currentIndex - 1]?.url : undefined;
  const previousMatchesExpected = (() => {
    if (!expectedPreviousPath || !previousUrl) return false;
    try {
      const previous = new URL(previousUrl, window.location.origin);
      const expected = new URL(expectedPreviousPath, window.location.origin);
      return previous.origin === expected.origin
        && previous.pathname === expected.pathname
        && previous.search === expected.search;
    } catch {
      return false;
    }
  })();
  if (previousMatchesExpected && isDashboardUrl(previousUrl)) {
    router.back();
    return;
  }

  // Do not use history length as a proxy for the predecessor: a directly
  // opened detail page may otherwise return to an unrelated page or loop.
  router.replace(fallback);
}

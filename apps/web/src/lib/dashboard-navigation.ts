type DashboardRouter = {
  back: () => void;
  replace: (href: string) => void;
};

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

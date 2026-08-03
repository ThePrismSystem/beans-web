import { Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState } from "react";

import { useEvents } from "../hooks/useEvents.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { useProjects } from "../hooks/useProjects.js";

import { HeaderSearch } from "./HeaderSearch.js";
import { Sidebar } from "./Sidebar.js";

const UPDATED_INDICATOR_DURATION_MS = 2000;

// Matches the breakpoint at which global.css turns the sidebar into an
// off-canvas drawer. Kept in sync by hand; there is one other copy, in the
// stylesheet's layout media query.
const DRAWER_BREAKPOINT = "(max-width: 768px)";

export function AppShell() {
  const { data: projects } = useProjects();
  const { project } = useParams({ strict: false });
  const { lastEvent } = useEvents();
  const [showUpdated, setShowUpdated] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const isDrawer = useMediaQuery(DRAWER_BREAKPOINT);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isFirstRouteRef = useRef(true);

  // Navigating in a single-page app leaves focus wherever the click landed —
  // or on <body> once the old page unmounts — so keyboard and screen-reader
  // users are dropped at the top of the document with nothing announced.
  // Moving focus into <main> puts them at the start of the new view and makes
  // the reader announce it (WCAG 2.4.3). Skipped on first paint, where there
  // is no previous view to have navigated away from.
  useEffect(() => {
    if (isFirstRouteRef.current) {
      isFirstRouteRef.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [pathname]);

  // Adjusted during render rather than in an effect, so the pill appears in
  // the same commit as the event instead of one frame later. Seeded to `null`
  // rather than `lastEvent` so an event already present on the very first
  // render (as in a live-sync reconnect) still shows the pill, matching the
  // effect this replaces, which always ran once on mount.
  const [previousEvent, setPreviousEvent] = useState<typeof lastEvent>(null);
  if (lastEvent !== previousEvent) {
    setPreviousEvent(lastEvent);
    if (lastEvent) {
      setShowUpdated(true);
    }
  }

  useEffect(() => {
    if (!lastEvent) {
      return;
    }
    const timer = setTimeout(() => {
      setShowUpdated(false);
    }, UPDATED_INDICATOR_DURATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [lastEvent]);

  useEffect(() => {
    if (!navOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [navOpen]);

  // As a drawer the sidebar is modal, so focus moves into it on open and back
  // to the hamburger on close. `wasOpenRef` keeps the close branch from firing
  // on mount, where it would steal focus from the page.
  useEffect(() => {
    if (!isDrawer) {
      wasOpenRef.current = navOpen;
      return;
    }
    if (navOpen) {
      sidebarRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    } else if (wasOpenRef.current) {
      navToggleRef.current?.focus();
    }
    wasOpenRef.current = navOpen;
  }, [navOpen, isDrawer]);

  // Exactly one side is inert at drawer widths, and neither is on desktop.
  // Closed, the drawer is only moved off-screen by a transform, which leaves
  // its links tabbable; open, it is modal, so the page behind it must not be.
  const drawerClosed = isDrawer && !navOpen;
  const drawerOpen = isDrawer && navOpen;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" inert={drawerOpen}>
        Skip to content
      </a>
      {navOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => {
            setNavOpen(false);
          }}
        />
      )}
      <Sidebar
        ref={sidebarRef}
        projects={projects ?? []}
        activeProject={project}
        open={navOpen}
        inert={drawerClosed}
        onNavigate={() => {
          setNavOpen(false);
        }}
      />
      <div className="app-main" inert={drawerOpen}>
        <header className="app-header">
          <button
            type="button"
            ref={navToggleRef}
            className="nav-toggle"
            aria-label="Toggle project menu"
            aria-expanded={navOpen}
            onClick={() => {
              setNavOpen((open) => !open);
            }}
          >
            ☰
          </button>
          {showUpdated && (
            <span className="updated-pill" role="status">
              Updated
            </span>
          )}
          <HeaderSearch />
        </header>
        <main className="app-content" id="main-content" ref={mainRef} tabIndex={-1}>
          <Suspense
            fallback={
              <p className="muted" role="status">
                Loading…
              </p>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

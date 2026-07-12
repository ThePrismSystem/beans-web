import { Link, Outlet, useParams } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";

import { useEvents } from "../hooks/useEvents.js";
import { useProjects } from "../hooks/useProjects.js";
import { Sidebar } from "./Sidebar.js";

const UPDATED_INDICATOR_DURATION_MS = 2000;

export function AppShell() {
  const { data: projects } = useProjects();
  const { project } = useParams({ strict: false });
  const { lastEvent } = useEvents();
  const [showUpdated, setShowUpdated] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!lastEvent) {
      return;
    }
    setShowUpdated(true);
    const timer = setTimeout(() => setShowUpdated(false), UPDATED_INDICATOR_DURATION_MS);
    return () => clearTimeout(timer);
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
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <div className="app-shell">
      {navOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}
      <Sidebar
        projects={projects ?? []}
        activeProject={project}
        open={navOpen}
        onNavigate={() => setNavOpen(false)}
      />
      <div className="app-main">
        <header className="app-header">
          <button
            type="button"
            className="nav-toggle"
            aria-label="Toggle project menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            ☰
          </button>
          {showUpdated && (
            <span className="updated-pill" role="status">
              Updated
            </span>
          )}
          <Link to="/search" className="search-entry" role="search" aria-label="Global search">
            <span className="search-hint">Search beans</span>
          </Link>
        </header>
        <main className="app-content">
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

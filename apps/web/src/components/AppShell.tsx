import { Link, Outlet, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useEvents } from "../hooks/useEvents.js";
import { useProjects } from "../hooks/useProjects.js";
import { Sidebar } from "./Sidebar.js";

const UPDATED_INDICATOR_DURATION_MS = 2000;

export function AppShell() {
  const { data: projects } = useProjects();
  const { project } = useParams({ strict: false });
  const { lastEvent } = useEvents();
  const [showUpdated, setShowUpdated] = useState(false);

  useEffect(() => {
    if (!lastEvent) {
      return;
    }
    setShowUpdated(true);
    const timer = setTimeout(() => setShowUpdated(false), UPDATED_INDICATOR_DURATION_MS);
    return () => clearTimeout(timer);
  }, [lastEvent]);

  return (
    <div className="app-shell">
      <Sidebar projects={projects ?? []} activeProject={project} />
      <div className="app-main">
        <header className="app-header">
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}

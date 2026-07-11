import { Outlet, useParams } from "@tanstack/react-router";

import { useProjects } from "../hooks/useProjects.js";
import { Sidebar } from "./Sidebar.js";

export function AppShell() {
  const { data: projects } = useProjects();
  const { project } = useParams({ strict: false });

  return (
    <div className="app-shell">
      <Sidebar projects={projects ?? []} activeProject={project} />
      <div className="app-main">
        <header className="app-header">
          <div className="search-entry" role="search" aria-label="Global search">
            <span className="search-hint">Search beans</span>
            <kbd>⌘K</kbd>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { Link } from "@tanstack/react-router";

import type { Project } from "@beans-frontend/shared";

export function Sidebar({
  projects,
  activeProject,
  open = false,
  onNavigate,
}: {
  projects: Project[];
  activeProject: string | undefined;
  open?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className={`sidebar ${open ? "sidebar--open" : ""}`} aria-label="Projects">
      <Link to="/" className="side-item" onClick={onNavigate}>
        Overview
      </Link>
      <Link to="/analytics" className="side-item" onClick={onNavigate}>
        Analytics
      </Link>
      <div className="side-label">Projects</div>
      <ul className="side-projects">
        {projects.map((p) => (
          <li key={p.name}>
            <Link
              to="/p/$project"
              params={{ project: p.name }}
              className={`side-item ${p.name === activeProject ? "active" : ""}`}
              onClick={onNavigate}
            >
              <span>{p.name}</span>
              <span className="count">{p.counts.open}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

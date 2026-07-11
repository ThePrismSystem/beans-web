import { Link } from "@tanstack/react-router";

import type { Project } from "@beans-frontend/shared";

export function Sidebar({
  projects,
  activeProject,
}: {
  projects: Project[];
  activeProject: string | undefined;
}) {
  return (
    <nav className="sidebar">
      <Link to="/" className="side-item">
        Overview
      </Link>
      <Link to="/analytics" className="side-item">
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

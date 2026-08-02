import { Link } from "@tanstack/react-router";

import type { Project } from "@beans-frontend/shared";
import type { Ref } from "react";

export function Sidebar({
  projects,
  activeProject,
  open = false,
  inert = false,
  onNavigate,
  ref,
}: {
  projects: Project[];
  activeProject: string | undefined;
  open?: boolean;
  /**
   * Set while the sidebar is an off-canvas drawer in its closed position. It
   * is hidden by a transform alone, so without this its links stay in the tab
   * order and keyboard focus lands on controls nobody can see.
   */
  inert?: boolean;
  onNavigate?: () => void;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <nav
      ref={ref}
      className={`sidebar ${open ? "sidebar--open" : ""}`}
      aria-label="Projects"
      inert={inert}
    >
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

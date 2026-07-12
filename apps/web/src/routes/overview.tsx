import { Link } from "@tanstack/react-router";

import { useProjects } from "../hooks/useProjects.js";

import { BEAN_TYPES } from "@beans-frontend/shared";

import type { Project } from "@beans-frontend/shared";

function ProjectRow({ project }: { project: Project }) {
  const openTypes = BEAN_TYPES.map((type) => ({
    type,
    count: project.counts.openByType[type] ?? 0,
  })).filter(({ count }) => count > 0);
  return (
    <Link to="/p/$project" params={{ project: project.name }} className="project-row">
      <div className="project-row-top">
        <span className="project-row-name">{project.name}</span>
        <span className="project-row-summary">
          <b>{project.counts.open}</b> open · {project.counts.total} total
        </span>
      </div>
      {openTypes.length > 0 && (
        <div className="project-row-types">
          {openTypes.map(({ type, count }, i) => (
            <span key={type}>
              {i > 0 && <span className="project-row-sep">|</span>}
              <span className="project-row-type" style={{ color: `var(--t-${type})` }}>
                {type} <b>{count}</b>
              </span>
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export function Overview() {
  const { data: projects, isPending, isError } = useProjects();

  if (isPending) return <p className="muted">Loading projects…</p>;
  if (isError) return <p className="muted">Failed to load projects.</p>;
  if (projects.length === 0) return <p className="muted">No projects found.</p>;

  return (
    <div>
      <h1>Overview</h1>
      <div className="project-ledger">
        {projects.map((project) => (
          <ProjectRow key={project.name} project={project} />
        ))}
      </div>
    </div>
  );
}

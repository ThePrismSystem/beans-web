import { BEAN_TYPES } from "@beans-web/shared";
import { Link } from "@tanstack/react-router";

import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useProjects } from "../hooks/useProjects.js";

import type { BeanType, Project } from "@beans-web/shared";

function ProjectRow({ project }: { project: Project }) {
  // Widened to Partial: `openByType` crosses the GraphQL boundary, so a type
  // the server omitted (rather than sent as 0) must not throw on lookup here.
  const openByType: Partial<Record<BeanType, number>> = project.counts.openByType;
  const openTypes = BEAN_TYPES.map((type) => ({
    type,
    count: openByType[type] ?? 0,
  })).filter(({ count }) => count > 0);
  return (
    <Link to="/p/$project" params={{ project: project.name }} className="project-row">
      <div className="project-row-top">
        <h2 className="project-row-name">{project.name}</h2>
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
  useDocumentTitle("Overview");

  if (isPending)
    return (
      <p className="muted" role="status">
        Loading projects…
      </p>
    );
  if (isError)
    return (
      <p className="muted" role="alert">
        Failed to load projects.
      </p>
    );
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

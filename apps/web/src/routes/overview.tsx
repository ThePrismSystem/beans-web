import { Link } from "@tanstack/react-router";

import { BeanTypeTag } from "../components/BeanTypeTag.js";
import { useProjects } from "../hooks/useProjects.js";

import { BEAN_TYPES } from "@beans-frontend/shared";

import type { Project } from "@beans-frontend/shared";

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link to="/p/$project" params={{ project: project.name }} className="project-card">
      <h2>{project.name}</h2>
      <p className="project-counts">
        {project.counts.open} open / {project.counts.total} total
      </p>
      <div className="project-types">
        {BEAN_TYPES.map((type) => ({ type, count: project.counts.byType[type] ?? 0 }))
          .filter(({ count }) => count > 0)
          .map(({ type, count }) => (
            <span key={type} className="project-type-chip">
              <BeanTypeTag type={type} />
              <span className="project-type-count">{count}</span>
            </span>
          ))}
      </div>
    </Link>
  );
}

export function Overview() {
  const { data: projects, isPending, isError } = useProjects();

  if (isPending) {
    return <p className="muted">Loading projects…</p>;
  }

  if (isError) {
    return <p className="muted">Failed to load projects.</p>;
  }

  if (projects.length === 0) {
    return <p className="muted">No projects found.</p>;
  }

  return (
    <div>
      <h1>Overview</h1>
      <div className="project-grid">
        {projects.map((project) => (
          <ProjectCard key={project.name} project={project} />
        ))}
      </div>
    </div>
  );
}

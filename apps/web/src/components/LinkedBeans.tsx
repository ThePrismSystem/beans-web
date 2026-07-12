import { Link } from "@tanstack/react-router";

import { BeanTypeTag } from "./BeanTypeTag.js";

import type { LinkedBean } from "@beans-frontend/shared";

export interface LinkedBeansProps {
  project: string;
  parent: LinkedBean | null;
  children: LinkedBean[];
  blocking: LinkedBean[];
  blockedBy: LinkedBean[];
}

function LinkedBeanItem({ project, bean }: { project: string; bean: LinkedBean }) {
  return (
    <li className="linked-bean-item">
      <Link
        to="/p/$project/$beanId"
        params={{ project, beanId: bean.id }}
        className="linked-bean-link"
      >
        <BeanTypeTag type={bean.type} />
        <span className="linked-bean-title">{bean.title}</span>
      </Link>
    </li>
  );
}

function LinkedBeanGroup({
  project,
  label,
  beans,
}: {
  project: string;
  label: string;
  beans: LinkedBean[];
}) {
  if (beans.length === 0) {
    return null;
  }
  return (
    <div className="linked-beans-group">
      <h3 className="linked-beans-group-label">{label}</h3>
      <ul className="linked-beans-list">
        {beans.map((bean) => (
          <LinkedBeanItem key={bean.id} project={project} bean={bean} />
        ))}
      </ul>
    </div>
  );
}

export function LinkedBeans({ project, parent, children, blocking, blockedBy }: LinkedBeansProps) {
  return (
    <div className="linked-beans" data-testid="linked-beans">
      <LinkedBeanGroup project={project} label="Parent" beans={parent ? [parent] : []} />
      <LinkedBeanGroup project={project} label="Children" beans={children} />
      <LinkedBeanGroup project={project} label="Blocks" beans={blocking} />
      <LinkedBeanGroup project={project} label="Blocked by" beans={blockedBy} />
    </div>
  );
}

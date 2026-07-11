import { useParams } from "@tanstack/react-router";

import { BeanTypeTag } from "../components/BeanTypeTag.js";
import { LinkedBeans } from "../components/LinkedBeans.js";
import { StatusDot } from "../components/StatusDot.js";

import { useBean } from "../hooks/useBean.js";
import { renderMarkdown } from "../lib/markdown.js";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function BeanDetailPage() {
  const { project, beanId } = useParams({ from: "/p/$project/$beanId" });
  const { data: bean, isPending, isError } = useBean(project, beanId);

  if (isPending) {
    return <p className="muted">Loading bean…</p>;
  }

  if (isError) {
    return <p className="muted">Failed to load bean.</p>;
  }

  return (
    <article className="bean-detail">
      <header className="bean-detail-header">
        <div className="bean-detail-title-row">
          <BeanTypeTag type={bean.type} />
          <h1 className="bean-detail-title">{bean.title}</h1>
          <StatusDot status={bean.status} />
        </div>
        <div className="bean-detail-meta">
          <span className="bean-id">{bean.id}</span>
          <span className="bean-detail-priority">{bean.priority}</span>
          <span className="bean-detail-timestamp">Created {formatTimestamp(bean.createdAt)}</span>
          <span className="bean-detail-timestamp">Updated {formatTimestamp(bean.updatedAt)}</span>
        </div>
      </header>
      <div
        className="bean-detail-body"
        // Body is markdown -> HTML rendered through renderMarkdown(), which
        // pipes the output through DOMPurify before it ever reaches the DOM.
        dangerouslySetInnerHTML={{ __html: renderMarkdown(bean.body) }}
      />
      <LinkedBeans
        project={project}
        parent={bean.parent}
        children={bean.children}
        blocking={bean.blocking}
        blockedBy={bean.blockedBy}
      />
    </article>
  );
}

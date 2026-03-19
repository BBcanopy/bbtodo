import type { ReactNode } from "react";

import { columns } from "../app/constants";
import { getErrorMessage, itemStyle } from "../app/utils";

function SvgIcon({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? "ui-icon"}
      fill="none"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="m6.75 9.75 5.25 5.25 5.25-5.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </SvgIcon>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </SvgIcon>
  );
}

export function PencilIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="m15.5 5.5 3 3M6 18l2.5-.5L18 8l-3-3-9.5 9.5ZM6 18h12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </SvgIcon>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M8 6.75h8m-7 0V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.25m-8 0-.6 10.1a1.75 1.75 0 0 0 1.75 1.85h5.7a1.75 1.75 0 0 0 1.75-1.85L16 6.75m-5 3v5m3-5v5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </SvgIcon>
  );
}

export function MetricRibbon({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="metric-ribbon">
      {items.map((item, index) => (
        <div className="metric-pill" key={item.label} style={itemStyle(index)}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  return <p className="error-banner">{getErrorMessage(error)}</p>;
}

export function EmptyState({
  eyebrow,
  title,
  copy
}: {
  eyebrow: string;
  title: string;
  copy?: string;
}) {
  return (
    <section className="empty-state">
      <div className="empty-state__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {copy ? <p className="lead-copy">{copy}</p> : null}
      </div>
      <div aria-hidden="true" className="empty-state__art">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

export function ProjectGridSkeleton() {
  return (
    <section aria-hidden="true" className="project-grid">
      {Array.from({ length: 4 }).map((_, index) => (
        <article className="project-card skeleton-card" key={index} style={itemStyle(index)}>
          <div className="skeleton-line skeleton-line--small" />
          <div className="skeleton-line skeleton-line--title" />
          <div className="skeleton-line skeleton-line--body" />
          <div className="skeleton-line skeleton-line--body short" />
          <div className="skeleton-row">
            <div className="skeleton-pill" />
            <div className="skeleton-pill" />
          </div>
        </article>
      ))}
    </section>
  );
}

export function BoardSkeleton() {
  return (
    <section aria-hidden="true" className="board-grid" data-testid="board-grid">
      {columns.map((column, index) => (
        <article className="board-column skeleton-column" key={column.key} style={itemStyle(index)}>
          <div className="board-column__header">
            <div>
              <div className="skeleton-line skeleton-line--small" />
              <div className="skeleton-line skeleton-line--medium" />
            </div>
            <div className="skeleton-pill" />
          </div>
          <div className="board-column__content">
            {Array.from({ length: 3 }).map((_, cardIndex) => (
              <div className="task-card skeleton-card skeleton-card--compact" key={cardIndex}>
                <div className="skeleton-line skeleton-line--small" />
                <div className="skeleton-line skeleton-line--body" />
                <div className="skeleton-line skeleton-line--body short" />
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

export function TokenListSkeleton() {
  return (
    <section aria-hidden="true" className="token-list">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="token-row token-row--skeleton" key={index}>
          <div className="token-row__copy">
            <div className="skeleton-line skeleton-line--medium" />
            <div className="skeleton-line skeleton-line--body short" />
          </div>
          <div className="skeleton-pill" />
        </div>
      ))}
    </section>
  );
}

export function LoadingState() {
  return (
    <main className="loading-shell">
      <div className="loading-shell__inner">
        <section className="surface-strip loading-strip">
          <div className="loading-strip__copy">
            <div className="skeleton-line skeleton-line--small" />
            <div className="skeleton-line skeleton-line--medium" />
            <div className="skeleton-line skeleton-line--body short" />
          </div>
          <div className="loading-strip__meta">
            <div className="skeleton-pill" />
            <div className="skeleton-pill" />
            <div className="skeleton-pill" />
          </div>
        </section>
        <BoardSkeleton />
      </div>
    </main>
  );
}

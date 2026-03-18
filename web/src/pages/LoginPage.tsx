import { columns, loginPreview } from "../app/constants";
import { itemStyle } from "../app/utils";
import { MetricRibbon } from "../components/ui";

export function LoginPage() {
  return (
    <main className="landing-shell">
      <title>BBTodo</title>
      <section className="landing-panel">
        <article className="hero-panel hero-panel--landing">
          <p className="eyebrow">bbtodo</p>
          <h1>Simple boards for work that should stay clear.</h1>
          <p className="lead-copy">
            Sign in once, keep one board per project, and move tasks across three steady lanes without extra ceremony.
          </p>
          <MetricRibbon
            items={[
              { label: "Projects", value: "One board each" },
              { label: "Access", value: "OIDC sign-in" },
              { label: "API", value: "Tokens for scripts" }
            ]}
          />
          <div className="cta-row">
            <button className="primary-button" onClick={() => (window.location.href = "/auth/login")} type="button">
              Sign in with OIDC
            </button>
            <a className="ghost-button" href="/docs">
              Read API docs
            </a>
          </div>
        </article>

        <aside className="preview-panel">
          <div className="preview-panel__header">
            <div>
              <p className="eyebrow">Live shape</p>
              <h2>A calm three-lane board</h2>
            </div>
            <span className="status-ping" />
          </div>
          <div className="preview-board">
            {columns.map((column, columnIndex) => (
              <section className="preview-column" key={column.key} style={itemStyle(columnIndex)}>
                <header className="preview-column__header">
                  <h3>{column.label}</h3>
                  <span>{loginPreview[column.key].length}</span>
                </header>
                <div className="preview-column__stack">
                  {loginPreview[column.key].map((task, taskIndex) => (
                    <article className="preview-card" key={task} style={itemStyle(taskIndex)}>
                      <span className="preview-card__line" />
                      <p>{task}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

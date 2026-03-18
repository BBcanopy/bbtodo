export function LoginPage() {
  return (
    <main className="landing-shell">
      <title>BBTodo</title>
      <section className="landing-panel landing-panel--simple">
        <article className="hero-panel hero-panel--landing hero-panel--simple">
          <div className="hero-panel__brand">
            <span aria-hidden="true" className="brand-mark__pill hero-panel__pill">
              bb
            </span>
          </div>
          <h1>BBTodo</h1>
          <div className="cta-row">
            <button className="primary-button" onClick={() => (window.location.href = "/auth/login")} type="button">
              Sign in with OIDC
            </button>
            <a className="ghost-button" href="/docs">
              Read API docs
            </a>
          </div>
        </article>
      </section>
    </main>
  );
}

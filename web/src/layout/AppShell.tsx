import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useSearchParams
} from "react-router-dom";

import { api, type User } from "../api";
import { themeOptions } from "../app/constants";
import { getAvatarLetter } from "../app/utils";
import { ErrorBanner } from "../components/ui";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

export function AppShell({ user }: { user: User }) {
  const location = useLocation();
  const boardMatch = useMatch("/projects/:projectId");
  const [searchParams, setSearchParams] = useSearchParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
    enabled: Boolean(boardMatch)
  });
  const themeMutation = useMutation({
    mutationFn: api.updateTheme,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["me"], updatedUser);
    }
  });
  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      window.location.replace("/");
    }
  });
  const avatarLetter = getAvatarLetter(user);
  const isProjectsRoute = location.pathname === "/";
  const navSearch = boardMatch || isProjectsRoute ? searchParams.get("q") ?? "" : "";
  const navTagSearch = boardMatch ? searchParams.get("tags") ?? "" : "";
  const activeBoard = boardMatch
    ? projectsQuery.data?.find((project) => project.id === boardMatch.params.projectId)?.name ?? "Board"
    : null;

  useDismissableLayer(isMenuOpen, menuRef, () => setIsMenuOpen(false));

  function updateRouteParams(updater: (params: URLSearchParams) => void) {
    const nextParams = new URLSearchParams(searchParams);
    updater(nextParams);
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div className="app-frame">
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar__nav">
            <Link className="brand-mark" to="/">
              <span className="brand-mark__pill">bb</span>
              <span className="brand-mark__text">bbtodo</span>
            </Link>
            <nav className="subnav">
              <div className="subnav__cluster subnav__cluster--primary">
                <NavLink className={({ isActive }) => `subnav__link${isActive ? " is-active" : ""}`} end to="/">
                  Projects
                </NavLink>
                {activeBoard ? (
                  <span className="subnav__current" title={activeBoard}>
                    <span className="subnav__current-label">Project</span>
                    <span className="subnav__current-value">{activeBoard}</span>
                  </span>
                ) : null}
              </div>
              {boardMatch || isProjectsRoute ? (
                <div className="subnav__cluster subnav__cluster--tools">
                  <label className="subnav__search">
                    {boardMatch ? <span className="subnav__search-label">Search</span> : null}
                    <input
                      aria-label={isProjectsRoute ? "Search projects" : "Search cards"}
                      onChange={(event) =>
                        updateRouteParams((params) => {
                          const value = event.target.value.trim();
                          if (value) {
                            params.set("q", value);
                          } else {
                            params.delete("q");
                          }
                        })
                      }
                      placeholder={isProjectsRoute ? "Search projects" : "Search cards"}
                      type="search"
                      value={navSearch}
                    />
                  </label>
                  {boardMatch ? (
                    <label className="subnav__search">
                      <span className="subnav__search-label">Tags</span>
                      <input
                        aria-label="Filter by tags"
                        onChange={(event) =>
                          updateRouteParams((params) => {
                            const value = event.target.value;
                            if (value.trim()) {
                              params.set("tags", value);
                            } else {
                              params.delete("tags");
                            }
                          })
                        }
                        placeholder="bug, docs"
                        type="search"
                        value={navTagSearch}
                      />
                    </label>
                  ) : null}
                  {boardMatch ? (
                    <button
                      className="subnav__action"
                      onClick={() =>
                        updateRouteParams((params) => {
                          params.set("createLane", "1");
                        })
                      }
                      type="button"
                    >
                      <span aria-hidden="true" className="subnav__action-mark">
                        +
                      </span>
                      <span>Create Lane</span>
                    </button>
                  ) : null}
                  {isProjectsRoute ? (
                    <Link className="subnav__action" to="/?createProject=1">
                      <span aria-hidden="true" className="subnav__action-mark">
                        +
                      </span>
                      <span>Create Project</span>
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </nav>
          </div>

          <div className="topbar__meta">
            <div className="avatar-menu" ref={menuRef}>
              <button
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label="Open account menu"
                className="avatar-button"
                onClick={() => setIsMenuOpen((current) => !current)}
                type="button"
              >
                <span aria-hidden="true" className="avatar-button__letter">
                  {avatarLetter}
                </span>
              </button>
              {isMenuOpen ? (
                <div className="avatar-dropdown" role="menu">
                  <div className="menu-section">
                    <p className="menu-section__label">Theme</p>
                    <div className="theme-picker" role="group" aria-label="Theme switcher">
                      {themeOptions.map((themeOption) => (
                        <button
                          aria-pressed={user.theme === themeOption.id}
                          className={`theme-option${user.theme === themeOption.id ? " is-active" : ""}`}
                          disabled={themeMutation.isPending}
                          key={themeOption.id}
                          onClick={() => themeMutation.mutate(themeOption.id)}
                          type="button"
                        >
                          <span className={`theme-option__swatch theme-option__swatch--${themeOption.id}`} />
                          <span className="theme-option__copy">
                            <strong>{themeOption.label}</strong>
                          </span>
                        </button>
                      ))}
                    </div>
                    {themeMutation.error ? <ErrorBanner error={themeMutation.error} /> : null}
                  </div>
                  <Link
                    className="menu-item"
                    onClick={() => setIsMenuOpen(false)}
                    role="menuitem"
                    to="/settings/api-tokens"
                  >
                    API tokens
                  </Link>
                  <button
                    className="menu-item danger-button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      logoutMutation.mutate();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {logoutMutation.isPending ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="shell-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

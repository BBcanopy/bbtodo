import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useSearchParams
} from "react-router-dom";

import { api, type User } from "../api";
import { getAvatarLetter } from "../app/utils";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

export function AppShell({ user }: { user: User }) {
  const location = useLocation();
  const boardMatch = useMatch("/projects/:projectId");
  const [searchParams, setSearchParams] = useSearchParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
    enabled: Boolean(boardMatch)
  });
  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      window.location.replace("/");
    }
  });
  const avatarLetter = getAvatarLetter(user);
  const isProjectsRoute = location.pathname === "/";
  const boardSearch = boardMatch ? searchParams.get("q") ?? "" : "";
  const activeBoard = boardMatch
    ? projectsQuery.data?.find((project) => project.id === boardMatch.params.projectId)?.name ?? "Board"
    : null;

  useDismissableLayer(isMenuOpen, menuRef, () => setIsMenuOpen(false));

  function updateBoardParams(updater: (params: URLSearchParams) => void) {
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
              <NavLink className={({ isActive }) => `subnav__link${isActive ? " is-active" : ""}`} end to="/">
                Projects
              </NavLink>
              {activeBoard ? (
                <span className="subnav__current" title={activeBoard}>
                  {activeBoard}
                </span>
              ) : null}
              {boardMatch ? (
                <>
                  <label className="subnav__search">
                    <span className="subnav__search-label">Search</span>
                    <input
                      aria-label="Search cards"
                      onChange={(event) =>
                        updateBoardParams((params) => {
                          const value = event.target.value.trim();
                          if (value) {
                            params.set("q", value);
                          } else {
                            params.delete("q");
                          }
                        })
                      }
                      placeholder="Search cards"
                      type="search"
                      value={boardSearch}
                    />
                  </label>
                  <button
                    className="subnav__action"
                    onClick={() =>
                      updateBoardParams((params) => {
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
                </>
              ) : null}
              {isProjectsRoute ? (
                <Link className="subnav__action" to="/?createProject=1">
                  <span aria-hidden="true" className="subnav__action-mark">
                    +
                  </span>
                  <span>Create Project</span>
                </Link>
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

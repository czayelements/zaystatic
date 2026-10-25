"use client";

import * as React from "react";

import { createApi } from "./api";
import { Link, ZayProvider, useZay } from "./context";
import { GitHub, Menu, Out, Search, X } from "./icons";
import { CollectionView, Dashboard, EntryView, FileSetView, SingletonView, navSections } from "./views";
import { resolveMessages } from "./i18n";
import type { EditorMap, Schema, SessionInfo } from "./types";
import { cx } from "./util";

export type ZayAppProps = {
  /** API path (same as ZayConfig.apiPath), e.g. "/api/zay". */
  apiPath: string;
  /** Site-specific custom editors: Collection.editor name → component. */
  editors?: EditorMap;
};

type Boot =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; session: SessionInfo; schema: Schema };

const NO_EDITORS: EditorMap = {};

export function ZayApp({ apiPath, editors = NO_EDITORS }: ZayAppProps) {
  const api = React.useMemo(() => createApi(apiPath), [apiPath]);
  const [boot, setBoot] = React.useState<Boot>({ state: "loading" });
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const session = await api.get<SessionInfo>("/session");
        if (session.mode === "unconfigured" || (session.mode === "github" && !session.user)) {
          if (live) setBoot({ state: "ready", session, schema: null as unknown as Schema });
          return;
        }
        const schema = await api.get<Schema>("/schema");
        if (live) setBoot({ state: "ready", session, schema });
      } catch (e) {
        if (live) setBoot({ state: "error", message: (e as Error).message });
      }
    })();
    return () => {
      live = false;
    };
  }, [api, tick]);

  if (boot.state === "loading") return <div className="zs-root zs-center">…</div>;
  if (boot.state === "error") return <div className="zs-root zs-center zs-error">{boot.message}</div>;

  const { session, schema } = boot;
  if (!schema) return <SignIn session={session} apiPath={apiPath} />;

  return (
    <div className="zs-root">
      <ZayProvider api={api} schema={schema} session={session} editors={editors} refreshSchema={() => setTick((n) => n + 1)}>
        <Shell />
      </ZayProvider>
    </div>
  );
}

function SignIn({ session, apiPath }: { session: SessionInfo; apiPath: string }) {
  const t = resolveMessages(session.language, session.messages);
  const error = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("error") : null;
  return (
    <div className="zs-root zs-center">
      <div className="zs-login">
        <h1>{session.name}</h1>
        {session.mode === "unconfigured" ? (
          <p className="zs-error">{t.notConfigured}</p>
        ) : (
          <>
            {error && <p className="zs-error">{error}</p>}
            <a className="zs-btn zs-btn-primary zs-btn-lg" href={`${apiPath}/auth/login`}>
              <GitHub /> {t.signIn}
            </a>
            <p className="zs-muted">{t.signInNote}</p>
          </>
        )}
      </div>
    </div>
  );
}

function parse(path: string): { view: string; parts: string[] } {
  const [, view = "", ...parts] = path.split("/");
  return { view, parts };
}

function Shell() {
  const { path, schema, session, t, api } = useZay();
  /* The menu closes when the page changes: we remember the path it was opened on. */
  const [menuPath, setMenuPath] = React.useState<string | null>(null);
  const menu = menuPath === path;
  const setMenu = (open: boolean) => setMenuPath(open ? path : null);
  const [nav, setNav] = React.useState("");
  const sections = React.useMemo(() => navSections(schema), [schema]);
  const { view, parts } = parse(path);

  const logout = async () => {
    await api.post("/auth/logout", {});
    window.location.href = session.basePath;
  };

  let body: React.ReactNode;
  if (view === "c" && parts[0]) body = parts[1] ? <EntryView key={`${parts[0]}/${parts[1]}`} name={parts[0]} slug={parts[1]} /> : <CollectionView name={parts[0]} />;
  else if (view === "s" && parts[0]) body = <SingletonView key={parts[0]} name={parts[0]} />;
  else if (view === "f" && parts[0]) body = <FileSetView key={`${parts[0]}/${parts[1] ?? ""}`} name={parts[0]} file={parts[1]} />;
  else body = <Dashboard />;

  const q = nav.trim().toLowerCase();
  return (
    <div className={cx("zs-app", menu && "is-menu")}>
      <header className="zs-topbar">
        <button type="button" aria-label="Menu" onClick={() => setMenu(!menu)}>
          {menu ? <X /> : <Menu />}
        </button>
        <b>{session.name}</b>
      </header>

      <aside className="zs-side">
        <Link to="/" className="zs-brand">
          <span className="zs-logo">z</span>
          <span>
            <b>{session.name}</b>
            <small>zay-static</small>
          </span>
        </Link>

        <div className="zs-search zs-side-search">
          <Search />
          <input value={nav} onChange={(e) => setNav(e.target.value)} placeholder={t.search} />
        </div>

        <nav>
          {sections.map((s) => {
            const items = s.items.filter((i) => !q || i.label.toLowerCase().includes(q));
            if (!items.length) return null;
            return (
              <div key={s.id} className="zs-nav-group">
                <h5>{s.label}</h5>
                {items.map((i) => (
                  <Link key={i.to} to={i.to} className={cx("zs-nav-item", (path === i.to || path.startsWith(`${i.to}/`)) && "is-on")}>
                    {i.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <footer className="zs-side-foot">
          {session.user?.avatar && <img src={session.user.avatar} alt="" width={24} height={24} />}
          <span className="zs-grow">{session.user?.name ?? session.user?.login}</span>
          {session.mode === "github" && (
            <button type="button" aria-label={t.signOut} title={t.signOut} onClick={logout}>
              <Out />
            </button>
          )}
        </footer>
      </aside>

      <button type="button" className="zs-scrim" aria-label="Close" onClick={() => setMenu(false)} />
      <main className="zs-main">
        <div className="zs-content">{body}</div>
      </main>
    </div>
  );
}


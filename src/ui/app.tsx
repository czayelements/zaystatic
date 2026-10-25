"use client";

import * as React from "react";

import { createApi } from "./api";
import { Link, ZayProvider, useZay } from "./context";
import { FileText, GitHub, Globe, Menu, Out, Search, Stack, X } from "./icons";
import { CollectionView, Dashboard, EntryView, FileSetView, MediaView, ReviewView, SingletonView, navSections } from "./views";
import type { NavItem } from "./views";
import { resolveMessages } from "./i18n";
import { initialLanguage, languageName } from "./language";
import type { EditorMap, Schema, SessionInfo } from "./types";
import { cx } from "./util";

export type ZayAppProps = {
  /** API path (same as ZayConfig.apiPath), e.g. "/api/zay". */
  apiPath: string;
  /** Site-specific custom editors: Collection.editor name → component. */
  editors?: EditorMap;
};

const NO_EDITORS: EditorMap = {};

export function ZayApp({ apiPath, editors = NO_EDITORS }: ZayAppProps) {
  const api = React.useMemo(() => createApi(apiPath), [apiPath]);
  const [session, setSession] = React.useState<SessionInfo | null>(null);
  /* undefined: loading; null: no schema (sign-in screen / unconfigured) */
  const [schema, setSchema] = React.useState<Schema | null | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);
  const [lang, setLang] = React.useState<string>("en");
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    api
      .get<SessionInfo>("/session")
      .then((s) => {
        if (!live) return;
        setLang((current) => (session ? current : initialLanguage(s)));
        setSession(s);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
    // The session is re-read only on a manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, tick]);

  React.useEffect(() => {
    if (!session) return;
    if (session.mode === "unconfigured" || (session.mode === "github" && !session.user)) {
      setSchema(null);
      return;
    }
    let live = true;
    api
      .get<Schema>(`/schema?lang=${encodeURIComponent(lang)}`)
      .then((s) => live && setSchema(s))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [api, session, lang]);

  if (error) return <div className="zs-root zs-center zs-error">{error}</div>;
  if (!session || schema === undefined) return <div className="zs-root zs-center">…</div>;
  if (!schema) return <SignIn session={session} lang={lang} apiPath={apiPath} />;

  return (
    <div className="zs-root">
      <ZayProvider api={api} schema={schema} session={session} editors={editors} refreshSchema={() => setTick((n) => n + 1)} lang={lang} onLanguage={setLang}>
        <Shell />
      </ZayProvider>
    </div>
  );
}

function SignIn({ session, lang, apiPath }: { session: SessionInfo; lang: string; apiPath: string }) {
  const t = resolveMessages(lang, session.translations?.[lang]);
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
  const { path, schema, session, t, api, navigate, viewTick, draftTick, lang, languages, setLang } = useZay();
  /* The menu closes when the page changes: we remember the path it was opened on. */
  const [menuPath, setMenuPath] = React.useState<string | null>(null);
  const menu = menuPath === path;
  const setMenu = (open: boolean) => setMenuPath(open ? path : null);
  const [nav, setNav] = React.useState("");
  const sections = React.useMemo(() => navSections(schema, t), [schema, t]);
  const hasMedia = Boolean(session.media?.library);
  const hasReview = session.workflow === "pull-request";
  const [drafts, setDrafts] = React.useState(0);
  React.useEffect(() => {
    if (!hasReview) return;
    let live = true;
    api.drafts().then((r) => live && setDrafts(r.drafts.length)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, hasReview, draftTick, viewTick]);
  const { view, parts } = parse(path);

  const logout = async () => {
    await api.post("/auth/logout", {});
    window.location.href = session.basePath;
  };

  let body: React.ReactNode;
  if (view === "c" && parts[0]) body = parts[1] ? <EntryView key={`${parts[0]}/${parts[1]}/${viewTick}/${lang}`} name={parts[0]} slug={parts[1]} /> : <CollectionView name={parts[0]} />;
  else if (view === "s" && parts[0]) body = <SingletonView key={`${parts[0]}/${viewTick}/${lang}`} name={parts[0]} />;
  else if (view === "media") body = <MediaView key={lang} />;
  else if (view === "review" && hasReview) body = <ReviewView key={lang} />;
  else if (view === "f" && parts[0]) body = <FileSetView key={`${parts[0]}/${parts[1] ?? ""}/${viewTick}/${lang}`} name={parts[0]} file={parts[1]} />;
  else body = <Dashboard />;

  const q = nav.trim().toLowerCase();
  const area: "content" | "media" | "review" = view === "media" ? "media" : view === "review" ? "review" : "content";
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

        {(hasMedia || hasReview) && (
          <div className="zs-sidetabs" role="tablist">
            <button type="button" role="tab" aria-selected={area === "content"} className={cx(area === "content" && "is-on")} onClick={() => navigate("/")}>
              <FileText /> {t.content}
            </button>
            {hasMedia && (
              <button type="button" role="tab" aria-selected={area === "media"} className={cx(area === "media" && "is-on")} onClick={() => navigate("/media")}>
                <Globe /> {t.media}
              </button>
            )}
            {hasReview && (
              <button type="button" role="tab" aria-selected={area === "review"} className={cx(area === "review" && "is-on")} onClick={() => navigate("/review")}>
                <Stack /> {t.review}
                {drafts > 0 && <span className="zs-tab-count">{drafts}</span>}
              </button>
            )}
          </div>
        )}

        {area === "content" && (
          <div className="zs-search zs-side-search">
            <Search />
            <input value={nav} onChange={(e) => setNav(e.target.value)} placeholder={t.search} />
          </div>
        )}

        <nav>
          {area === "content" && sections.map((s) => {
            const items = s.items.filter((i) => !q || i.label.toLowerCase().includes(q));
            if (!items.length) return null;
            return (
              <div key={s.id} className="zs-nav-group">
                <h5>{s.label}</h5>
                {items.map((i) => (
                  <Link key={i.to} to={i.to} className={cx("zs-nav-item", (path === i.to || path.startsWith(`${i.to}/`)) && "is-on")}>
                    <KindIcon kind={i.kind} />
                    <span>{i.label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        {languages.length > 1 && (
          <label className="zs-lang">
            <Globe width={14} height={14} />
            <select value={lang} aria-label="Language" onChange={(e) => setLang(e.target.value)}>
              {languages.map((code) => (
                <option key={code} value={code}>
                  {languageName(code)}
                </option>
              ))}
            </select>
          </label>
        )}

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


function KindIcon({ kind }: { kind: NavItem["kind"] }) {
  const Icon = kind === "c" ? Stack : kind === "s" ? FileText : Globe;
  return <Icon className="zs-kind" width={14} height={14} />;
}

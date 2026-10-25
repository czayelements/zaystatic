"use client";

import * as React from "react";

import type { Api } from "./api";
import { resolveMessages } from "./i18n";
import type { Messages } from "./i18n";
import type { EditorMap, Schema, SessionInfo } from "./types";
import { cx } from "./util";

type Toast = { id: number; kind: "ok" | "error"; text: string };

type Ctx = {
  api: Api;
  schema: Schema;
  session: SessionInfo;
  t: Messages;
  basePath: string;
  editors: EditorMap;
  /** Current path relative to the base path, e.g. "/c/blog/my-post". */
  path: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  /** Guard that returns true when the page holds unsaved changes. */
  setGuard: (fn: (() => boolean) | null) => void;
  toast: (kind: Toast["kind"], text: string) => void;
  refreshSchema: () => void;
  /** Increments when the current view must re-read its data (after publish / discard). */
  viewTick: number;
  reloadView: () => void;
  /** Draft count changed (saved/published/discarded): refresh the sidebar badge. */
  draftTick: number;
  bumpDrafts: () => void;
};

const ZayContext = React.createContext<Ctx | null>(null);

export function useZay() {
  const ctx = React.useContext(ZayContext);
  if (!ctx) throw new Error("ZayProvider yok");
  return ctx;
}

const strip = (pathname: string, base: string) => {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return rest.replace(/\/+$/, "") || "/";
};

export function ZayProvider({
  api,
  schema,
  session,
  editors,
  refreshSchema,
  children,
}: {
  api: Api;
  schema: Schema;
  session: SessionInfo;
  editors: EditorMap;
  refreshSchema: () => void;
  children: React.ReactNode;
}) {
  const basePath = session.basePath.replace(/\/$/, "");
  const t = React.useMemo(() => resolveMessages(session.language, session.messages), [session.language, session.messages]);
  const [path, setPath] = React.useState(() => strip(window.location.pathname, basePath));
  const guard = React.useRef<(() => boolean) | null>(null);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [viewTick, setViewTick] = React.useState(0);
  const reloadView = React.useCallback(() => setViewTick((n) => n + 1), []);
  const [draftTick, setDraftTick] = React.useState(0);
  const bumpDrafts = React.useCallback(() => setDraftTick((n) => n + 1), []);

  React.useEffect(() => {
    const onPop = () => setPath(strip(window.location.pathname, basePath));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [basePath]);

  React.useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (guard.current?.()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const navigate = React.useCallback(
    (to: string, opts?: { replace?: boolean }) => {
      if (guard.current?.() && !window.confirm(t.leave)) return;
      const url = `${basePath}${to === "/" ? "" : to}` || "/";
      if (opts?.replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
      setPath(to);
      window.scrollTo({ top: 0 });
    },
    [basePath, t.leave],
  );

  const toast = React.useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, kind, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  const setGuard = React.useCallback((fn: (() => boolean) | null) => {
    guard.current = fn;
  }, []);

  const value = React.useMemo<Ctx>(
    () => ({ api, schema, session, t, basePath, editors, path, navigate, setGuard, toast, refreshSchema, viewTick, reloadView, draftTick, bumpDrafts }),
    [api, schema, session, t, basePath, editors, path, navigate, setGuard, toast, refreshSchema, viewTick, reloadView, draftTick, bumpDrafts],
  );

  return (
    <ZayContext.Provider value={value}>
      {children}
      <div className="zs-toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={cx("zs-toast", x.kind === "error" && "zs-toast-error")}>
            {x.text}
          </div>
        ))}
      </div>
    </ZayContext.Provider>
  );
}

/** In-panel link: navigates without a page reload and asks on unsaved changes. */
export function Link({
  to,
  children,
  className,
  ...rest
}: { to: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const { navigate, basePath } = useZay();
  return (
    <a
      {...rest}
      className={className}
      href={`${basePath}${to === "/" ? "" : to}` || "/"}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

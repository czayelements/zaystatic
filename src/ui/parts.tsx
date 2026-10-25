"use client";

import * as React from "react";

import { useZay } from "./context";
import { Check } from "./icons";
import { cx, isEmpty } from "./util";

/** Runs a request and starts a new one when `deps` change. The loading state is derived from the request key. */
export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [tick, setTick] = React.useState(0);
  const key = JSON.stringify([...deps, tick]);
  const [state, setState] = React.useState<{ key: string; data?: T; error?: string }>({ key: "" });
  React.useEffect(() => {
    let live = true;
    fn()
      .then((data) => live && setState({ key, data }))
      .catch((e: Error) => live && setState({ key, error: e.message }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const settled = state.key === key;
  return { data: settled ? state.data : undefined, error: settled ? state.error : undefined, loading: !settled, reload: () => setTick((n) => n + 1) };
}

export function PageHeader({
  title,
  crumbs,
  actions,
  sub,
}: {
  title: string;
  crumbs?: React.ReactNode;
  actions?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <header className="zs-page-head">
      <div className="zs-grow">
        {crumbs && <div className="zs-crumbs">{crumbs}</div>}
        <h1>{title}</h1>
        {sub && <p className="zs-sub">{sub}</p>}
      </div>
      {actions && <div className="zs-actions">{actions}</div>}
    </header>
  );
}

export function Loading() {
  const { t } = useZay();
  return <p className="zs-muted zs-pad">{t.loading}</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return <p className="zs-error zs-pad">{message}</p>;
}

/** Language tabs: filled languages are marked. */
export function LocaleTabs({
  locales,
  docs,
  active,
  onChange,
  defaultLocale,
  invalid = {},
}: {
  locales: string[];
  docs: Record<string, unknown>;
  active: string;
  onChange: (l: string) => void;
  defaultLocale: string;
  /** Languages with validation problems (shown once errors are visible). */
  invalid?: Record<string, boolean>;
}) {
  const { schema } = useZay();
  return (
    <div className="zs-tabs" role="tablist">
      {locales.map((l) => {
        const filled = l === defaultLocale || !isEmpty(docs[l]);
        return (
          <button key={l} type="button" role="tab" aria-selected={l === active} className={cx(l === active && "is-on")} onClick={() => onChange(l)}>
            <span className={cx("zs-dot", filled && "is-filled", invalid[l] && "is-invalid")} />
            <b>{l.toUpperCase()}</b>
            <span>{schema.localeNames[l] ?? l}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Sticky save bar at the bottom. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  left,
  label,
  issues = 0,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  left?: React.ReactNode;
  label?: string;
  /** Number of visible validation problems. */
  issues?: number;
}) {
  const { t } = useZay();
  return (
    <div className="zs-savebar">
      <div className="zs-savebar-in">
        {issues > 0 ? (
          <span className="zs-state is-invalid">{t.issues.replace("{n}", String(issues))}</span>
        ) : (
          <span className={cx("zs-state", dirty && "is-dirty")}>
            {saving ? t.saving : dirty ? t.unsaved : (<><Check /> {t.saved}</>)}
          </span>
        )}
        <span className="zs-grow" />
        {left}
        <button type="button" className="zs-btn zs-btn-primary" disabled={!dirty || saving} onClick={onSave}>
          {saving ? t.saving : (label ?? t.save)}
          <kbd>⌘S</kbd>
        </button>
      </div>
    </div>
  );
}

/** ⌘/Ctrl+S */
export function useSaveShortcut(onSave: () => void) {
  const ref = React.useRef(onSave);
  React.useEffect(() => {
    ref.current = onSave;
  });
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}

/** Draft ↔ saved comparison and navigation guard. */
export function useDirty<T>(current: T | undefined, saved: string | null) {
  const { setGuard } = useZay();
  const dirty = current !== undefined && saved !== null && JSON.stringify(current) !== saved;
  const ref = React.useRef(dirty);
  React.useEffect(() => {
    ref.current = dirty;
  });
  React.useEffect(() => {
    setGuard(() => ref.current);
    return () => setGuard(null);
  }, [setGuard]);
  return dirty;
}

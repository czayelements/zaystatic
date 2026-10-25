"use client";

import * as React from "react";

import { normalize, obj, translatableFields } from "../schema/dsl.mjs";
import type { BlockType, Field, Fields } from "../schema/dsl.mjs";
import { Link, useZay } from "./context";
import { Form, ListOpProvider, applyListOp } from "./form";
import type { ListOp } from "./form";
import { Plus, Search, Trash } from "./icons";
import { MediaLibrary } from "./media";
import { DraftControls, ErrorBox, Loading, LocaleTabs, PageHeader, SaveBar, useAsync, useDirty, useSaveShortcut } from "./parts";
import type { Docs, DraftInfo, DraftRef, EntrySummary } from "./types";
import { clone, cx, slugify } from "./util";
import type { Messages } from "./i18n";
import { ValidationProvider, toErrors, validateDocs } from "./validation";
import type { ServerIssue } from "./api";
import { ApiError } from "./api";

type SaveResult = { ok: boolean; unchanged?: boolean; id?: string; url?: string; files?: number; draft?: DraftRef };

export function MediaView() {
  const { t, session } = useZay();
  if (!session.media?.library) return <ErrorBox message="—" />;
  return (
    <>
      <PageHeader title={t.library} />
      <MediaLibrary />
    </>
  );
}

/* ── Overview ───────────────────────────────────────────────────── */

export function Dashboard() {
  const { schema, session, t } = useZay();
  const sections = navSections(schema, t);
  return (
    <>
      <PageHeader title={session.name} sub={session.mode === "local" ? t.localMode : session.repo ? `${session.repo} · ${session.branch}` : undefined} />
      <div className="zs-dash">
        {sections.map((s) => (
          <section key={s.id} className="zs-card">
            <h3>{s.label}</h3>
            <ul>
              {s.items.map((i) => (
                <li key={i.to}>
                  <Link to={i.to}>{i.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

export type NavItem = { to: string; label: string; kind: "c" | "s" | "f"; key: string };
export type NavSection = { id: string; label: string; items: NavItem[] };

const KIND_ORDER = { c: 0, s: 1, f: 2 } as const;

/**
 * Sidebar model. Items with a `group` appear under the groups the project defined
 * (collections first, then singletons, then file sets). Items without one are
 * sorted into automatic sections by kind: Collections, Singletons, File sets.
 */
export function navSections(schema: ReturnType<typeof useZay>["schema"], t: Pick<Messages, "collections" | "singletons" | "fileSets">): NavSection[] {
  const items: (NavItem & { group?: string })[] = [
    ...Object.entries(schema.collections).map(([key, c]) => ({ to: `/c/${key}`, label: c.label, kind: "c" as const, key, group: c.group })),
    ...Object.entries(schema.singletons).map(([key, s]) => ({ to: `/s/${key}`, label: s.label, kind: "s" as const, key, group: s.group })),
    ...Object.entries(schema.fileSets).map(([key, f]) => ({ to: `/f/${key}`, label: f.label, kind: "f" as const, key, group: f.group })),
  ];
  const known = schema.groups.map((g) => g.id);
  const byKind = (list: typeof items) => [...list].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const out: NavSection[] = schema.groups.map((g) => ({ id: g.id, label: g.label, items: byKind(items.filter((i) => i.group === g.id)) }));
  const rest = items.filter((i) => !i.group || !known.includes(i.group));
  const auto: [NavItem["kind"], string][] = [["c", t.collections], ["s", t.singletons], ["f", t.fileSets]];
  for (const [kind, label] of auto) out.push({ id: `_${kind}`, label, items: rest.filter((i) => i.kind === kind) });
  return out.filter((s) => s.items.length);
}

/* ── Collection list ────────────────────────────────────────────── */

export function CollectionView({ name }: { name: string }) {
  const { api, schema, t } = useZay();
  const col = schema.collections[name];
  const [q, setQ] = React.useState("");
  const { data, error, loading } = useAsync(() => api.get<{ entries: EntrySummary[]; drafts?: string[] }>(`/collections/${name}`), [name]);
  if (!col) return <ErrorBox message={`?${name}`} />;

  const drafts = new Set(data?.drafts ?? []);
  /* Entries that exist only as a draft are not in the repository's list yet. */
  const known = new Set((data?.entries ?? []).map((e) => e.slug));
  const draftOnly: EntrySummary[] = [...drafts].filter((s) => !known.has(s)).map((s) => ({ slug: s, title: s, summary: t.draftOnly, locales: [] }));
  const rows = [...draftOnly, ...(data?.entries ?? [])].filter((e) => !q.trim() || `${e.title} ${e.slug} ${e.summary}`.toLowerCase().includes(q.trim().toLowerCase()));
  const localized = col.layout === "locales";

  return (
    <>
      <PageHeader
        title={col.label}
        sub={data ? `${data.entries.length} ${t.entries}` : undefined}
        actions={
          <Link to={`/c/${name}/_new`} className="zs-btn zs-btn-primary">
            <Plus /> {t.new}
          </Link>
        }
      />
      <div className="zs-toolbar">
        <div className="zs-search">
          <Search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} />
        </div>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <ul className="zs-rows">
          {rows.map((e) => (
            <li key={e.slug}>
              <Link to={`/c/${name}/${e.slug}`} className="zs-row">
                <span className="zs-row-main">
                  <b>{e.title}</b>
                  {e.summary && <small>{e.summary}</small>}
                </span>
                {drafts.has(e.slug) && <span className="zs-pill zs-pill-draft">{t.draft}</span>}
                {e.published === false && <span className="zs-pill">{t.draft}</span>}
                {localized && e.locales.length > 0 && (
                  <span className="zs-locales">
                    {schema.locales.map((l) => (
                      <span key={l} className={cx(e.locales.includes(l) && "is-on")} title={schema.localeNames[l] ?? l}>
                        {l}
                      </span>
                    ))}
                  </span>
                )}
              </Link>
            </li>
          ))}
          {!rows.length && <li className="zs-muted zs-pad">{q ? t.noResults : t.empty}</li>}
        </ul>
      )}
    </>
  );
}

/* ── Entry editor ───────────────────────────────────────────────── */

const blankDocs = (fields: Fields, locales: string[], def: string, localized: boolean): Docs => {
  const docs: Docs = {};
  for (const l of localized ? locales : [def]) {
    docs[l] = normalize(obj("", l === def ? fields : translatableFields(fields)), undefined) as Record<string, unknown>;
  }
  return docs;
};

/** Resolves a path to a list/blocks field; indexes through blocks are resolved by the `_type` found in the document. */
function listFieldAt(fields: Fields, path: (string | number)[], doc: unknown): Field | undefined {
  let f: Field | undefined = { type: "object", label: "", fields };
  let cur: unknown = doc;
  for (const k of path) {
    if (typeof k === "number") {
      if (f?.type === "blocks") {
        const type = String((cur as Record<number, { _type?: string }> | undefined)?.[k]?._type);
        const b: BlockType | undefined = f.blocks?.[type];
        f = b ? { type: "object", label: b.label, fields: b.fields } : undefined;
      } else f = f?.item;
    } else f = f?.fields?.[k];
    cur = (cur as Record<string | number, unknown> | undefined)?.[k];
  }
  return f;
}

export function EntryView({ name, slug }: { name: string; slug: string }) {
  const { api, schema, t, navigate, toast, editors, setGuard, bumpDrafts, session } = useZay();
  const col = schema.collections[name];
  const isNew = slug === "_new";
  const def = schema.defaultLocale;
  const localized = col?.layout === "locales";
  const Editor = col?.editor ? editors[col.editor] : undefined;

  /* The panel remounts this component for every entry (key), so the initial state is one-shot. */
  const initial = isNew && col ? blankDocs(col.fields, schema.locales, def, localized) : null;
  const [docs, setDocs] = React.useState<Docs | null>(initial);
  const [saved, setSaved] = React.useState<string | null>(initial ? JSON.stringify(initial) : null);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(def);
  const [view, setView] = React.useState<"visual" | "form">("visual");
  const [newSlug, setNewSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftRef | null>(null);

  const localeFields = React.useCallback(
    (l: string): Fields => (!col ? {} : l === def ? col.fields : translatableFields(col.fields)),
    [col, def],
  );
  const issues = React.useMemo(
    () => (col && docs ? validateDocs(docs, localeFields, localized ? schema.locales : [def], def) : {}),
    [col, docs, localeFields, localized, schema.locales, def],
  );
  const issueCount = Object.values(issues).reduce((n, list) => n + list.length, 0);
  const firstBad = (localized ? schema.locales : [def]).find((l) => (issues[l]?.length ?? 0) > 0);

  React.useEffect(() => {
    if (!col || isNew) return;
    let live = true;
    api
      .get<{ docs: Docs; draft?: DraftRef }>(`/collections/${name}/${slug}`)
      .then((r) => {
        if (!live) return;
        setDraft(r.draft ?? null);
        setDocs(r.docs);
        setSaved(JSON.stringify(r.docs));
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [api, col, name, slug, isNew]);

  const dirty = useDirty(docs ?? undefined, saved);
  const title = col && docs ? String(docs[def]?.[col.identifier] ?? "") : "";
  const effectiveSlug = isNew ? (slugTouched ? newSlug : slugify(title)) : slug;

  const save = async () => {
    if (!docs || !col || saving || !dirty) return;
    if (isNew && !effectiveSlug) {
      toast("error", t.addressHint);
      return;
    }
    if (issueCount > 0) {
      setShowErrors(true);
      if (firstBad) setActive(firstBad);
      toast("error", t.fixIssues.replace("{n}", String(issueCount)));
      return;
    }
    setSaving(true);
    try {
      const res = isNew
        ? await api.post<SaveResult>(`/collections/${name}/${effectiveSlug}`, { docs })
        : await api.put<SaveResult>(`/collections/${name}/${slug}`, { docs });
      setSaved(JSON.stringify(docs));
      if (res.draft) {
        setDraft(res.draft);
        bumpDrafts();
      }
      toast("ok", res.unchanged ? t.unchangedNote : res.draft ? `${t.draftSaved} · #${res.draft.number}` : `${t.committed} · ${t.deployNote}`);
      if (isNew) {
        setGuard(null);
        navigate(`/c/${name}/${effectiveSlug}`, { replace: true });
      }
    } catch (e) {
      const server = e instanceof ApiError ? (e.issues as ServerIssue[] | undefined) : undefined;
      if (server?.length) {
        setShowErrors(true);
        setActive(server[0]!.locale);
      }
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  useSaveShortcut(save);

  const remove = async () => {
    if (!window.confirm(t.confirmDelete)) return;
    try {
      await api.del(`/collections/${name}/${slug}`);
      setGuard(null);
      navigate(`/c/${name}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const onListOp = React.useCallback(
    (path: (string | number)[], op: ListOp) => {
      if (!col || !localized) return;
      setDocs((prev) => {
        if (!prev) return prev;
        const listField = listFieldAt(col.fields, path, prev[def]);
        const next: Docs = { ...prev };
        for (const l of schema.locales) if (l !== def) next[l] = applyListOp(prev[l] ?? {}, path, op, listField);
        return next;
      });
    },
    [col, localized, schema.locales, def],
  );

  if (!col) return <ErrorBox message={`?${name}`} />;
  if (error) return <ErrorBox message={error} />;
  if (!docs) return <Loading />;

  const translating = localized && active !== def;
  const fieldsFor = localeFields(active);
  const invalidTabs = showErrors ? Object.fromEntries(Object.entries(issues).map(([l, list]) => [l, list.length > 0])) : {};
  const showVisual = Boolean(Editor) && view === "visual";

  return (
    <>
      <PageHeader
        crumbs={<Link to={`/c/${name}`}>{col.label}</Link>}
        title={title || (isNew ? t.newEntry : slug)}
        sub={!isNew ? <code>{slug}</code> : undefined}
        actions={
          <>
            {Editor && (
              <div className="zs-seg zs-seg-sm">
                <button type="button" className={cx(view === "visual" && "is-on")} onClick={() => setView("visual")}>
                  {t.visual}
                </button>
                <button type="button" className={cx(view === "form" && "is-on")} onClick={() => setView("form")}>
                  {t.form}
                </button>
              </div>
            )}
            <DraftControls draft={draft} dirty={dirty} onChanged={() => setDraft(null)} />
            {!isNew && (
              <button type="button" className="zs-btn zs-btn-ghost zs-danger" onClick={remove}>
                <Trash /> {t.delete}
              </button>
            )}
          </>
        }
      />

      {isNew && (
        <div className="zs-field zs-slug">
          <label className="zs-label">
            {t.address}
            <span className="zs-hint">{t.addressHint}</span>
          </label>
          <input
            className="zs-input zs-mono"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setNewSlug(slugify(e.target.value));
            }}
          />
        </div>
      )}

      {localized && !showVisual && (
        <LocaleTabs locales={schema.locales} docs={docs} active={active} onChange={setActive} defaultLocale={def} invalid={invalidTabs} />
      )}

      {translating && (
        <div className="zs-note">
          <span>{t.sourceNote}</span>
          <button
            type="button"
            className="zs-link"
            onClick={() =>
              setDocs({
                ...docs,
                [active]: normalize(obj("", fieldsFor), clone(docs[def])) as Record<string, unknown>,
              })
            }
          >
            {t.copyFrom} {schema.localeNames[def] ?? def}
          </button>
        </div>
      )}

      <ValidationProvider value={{ show: showErrors, errors: toErrors(t, issues[active] ?? []) }}>
      <ListOpProvider value={localized && !translating ? onListOp : null}>
        {showVisual && Editor ? (
          <Editor
            slug={slug}
            fields={col.fields}
            locales={schema.locales}
            defaultLocale={def}
            localeNames={schema.localeNames}
            value={docs[def] ?? {}}
            onChange={(v) => setDocs({ ...docs, [def]: v })}
          />
        ) : (
          <Form
            key={active}
            fields={fieldsFor}
            value={docs[active] ?? {}}
            reference={translating ? docs[def] : undefined}
            onChange={(v) => setDocs({ ...docs, [active]: v })}
          />
        )}
      </ListOpProvider>
      </ValidationProvider>

      <SaveBar dirty={dirty} saving={saving} onSave={save} label={isNew ? t.create : session.workflow === "pull-request" ? t.saveDraft : t.save} issues={showErrors ? issueCount : 0} />
    </>
  );
}

/* ── Singleton ──────────────────────────────────────────────────── */

export function SingletonView({ name }: { name: string }) {
  const { api, schema, t, toast, bumpDrafts, session } = useZay();
  const def = schema.singletons[name];
  const [doc, setDoc] = React.useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftRef | null>(null);
  const def_ = schema.defaultLocale;
  const issues = React.useMemo(
    () => (def && doc ? validateDocs({ [def_]: doc }, () => def.fields, [def_], def_)[def_] ?? [] : []),
    [def, doc, def_],
  );

  React.useEffect(() => {
    let live = true;
    api
      .get<{ doc: Record<string, unknown>; draft?: DraftRef }>(`/singletons/${name}`)
      .then((r) => {
        if (!live) return;
        setDraft(r.draft ?? null);
        setDoc(r.doc);
        setSaved(JSON.stringify(r.doc));
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [api, name]);

  const dirty = useDirty(doc ?? undefined, saved);
  const save = async () => {
    if (!doc || saving || !dirty) return;
    if (issues.length) {
      setShowErrors(true);
      toast("error", t.fixIssues.replace("{n}", String(issues.length)));
      return;
    }
    setSaving(true);
    try {
      const res = await api.put<SaveResult>(`/singletons/${name}`, { doc });
      setSaved(JSON.stringify(doc));
      if (res.draft) {
        setDraft(res.draft);
        bumpDrafts();
      }
      toast("ok", res.unchanged ? t.unchangedNote : res.draft ? `${t.draftSaved} · #${res.draft.number}` : `${t.committed} · ${t.deployNote}`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  useSaveShortcut(save);

  if (!def) return <ErrorBox message={`?${name}`} />;
  if (error) return <ErrorBox message={error} />;
  if (!doc) return <Loading />;
  return (
    <>
      <PageHeader title={def.label} actions={<DraftControls draft={draft} dirty={dirty} onChanged={() => setDraft(null)} />} />
      <ValidationProvider value={{ show: showErrors, errors: toErrors(t, issues) }}>
        <Form fields={def.fields} value={doc} onChange={setDoc} />
      </ValidationProvider>
      <SaveBar dirty={dirty} saving={saving} onSave={save} label={session.workflow === "pull-request" ? t.saveDraft : t.save} issues={showErrors ? issues.length : 0} />
    </>
  );
}

/* ── File sets (UI strings) ─────────────────────────────────────── */

export function FileSetView({ name, file }: { name: string; file?: string }) {
  const { api, schema, lang } = useZay();
  const set = schema.fileSets[name];
  const [q, setQ] = React.useState("");
  const list = useAsync(() => api.get<{ files: { name: string; label: string }[] }>(`/filesets/${name}?lang=${encodeURIComponent(lang)}`), [name, lang]);
  if (!set) return <ErrorBox message={`?${name}`} />;
  if (file) return <FileEditor name={name} file={file} label={set.label} />;

  const rows = (list.data?.files ?? []).filter((f) => !q.trim() || `${f.label} ${f.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <PageHeader title={set.label} />
      <div className="zs-toolbar">
        <div className="zs-search">
          <Search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
        </div>
      </div>
      {list.loading && !list.data && <Loading />}
      {list.error && <ErrorBox message={list.error} />}
      <ul className="zs-rows">
        {rows.map((f) => (
          <li key={f.name}>
            <Link to={`/f/${name}/${f.name}`} className="zs-row">
              <span className="zs-row-main">
                <b>{f.label}</b>
                <small>{f.name}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function FileEditor({ name, file, label }: { name: string; file: string; label: string }) {
  const { api, schema, t, toast, bumpDrafts, session, lang } = useZay();
  const [draft, setDraft] = React.useState<DraftRef | null>(null);
  const def = schema.defaultLocale;
  const [data, setData] = React.useState<{ file: { label: string }; fields: Fields; docs: Docs } | null>(null);
  const [docs, setDocs] = React.useState<Docs | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(def);
  const [filter, setFilter] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    api
      .get<{ file: { label: string }; fields: Fields; docs: Docs; draft?: DraftRef }>(`/filesets/${name}/${file}?lang=${encodeURIComponent(lang)}`)
      .then((r) => {
        if (!live) return;
        setDraft(r.draft ?? null);
        setData(r);
        setDocs(r.docs);
        setSaved(JSON.stringify(r.docs));
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [api, name, file, lang]);

  const dirty = useDirty(docs ?? undefined, saved);
  const save = async () => {
    if (!docs || saving || !dirty) return;
    setSaving(true);
    try {
      const res = await api.put<SaveResult>(`/filesets/${name}/${file}`, { docs });
      setSaved(JSON.stringify(docs));
      if (res.draft) {
        setDraft(res.draft);
        bumpDrafts();
      }
      toast("ok", res.unchanged ? t.unchangedNote : res.draft ? `${t.draftSaved} · #${res.draft.number}` : `${t.committed} · ${t.deployNote}`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  useSaveShortcut(save);

  const onListOp = React.useCallback(
    (path: (string | number)[], op: ListOp) => {
      if (!data) return;
      setDocs((prev) => {
        if (!prev) return prev;
        const listField = listFieldAt(data.fields, path, prev[def]);
        const next: Docs = { ...prev };
        for (const l of schema.locales) if (l !== def) next[l] = applyListOp(prev[l] ?? {}, path, op, listField);
        return next;
      });
    },
    [data, schema.locales, def],
  );

  if (error) return <ErrorBox message={error} />;
  if (!data || !docs) return <Loading />;
  const translating = active !== def;

  return (
    <>
      <PageHeader crumbs={<Link to={`/f/${name}`}>{label}</Link>} title={data.file.label} sub={<code>{file}</code>} actions={<DraftControls draft={draft} dirty={dirty} onChanged={() => setDraft(null)} />} />
      <LocaleTabs locales={schema.locales} docs={docs} active={active} onChange={setActive} defaultLocale={def} />
      <div className="zs-toolbar">
        <div className="zs-search">
          <Search />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.filter} />
        </div>
      </div>
      <ListOpProvider value={translating ? null : onListOp}>
        <Form
          key={active}
          fields={data.fields}
          value={docs[active] ?? {}}
          reference={translating ? docs[def] : undefined}
          filter={filter}
          onChange={(v) => setDocs({ ...docs, [active]: v })}
        />
      </ListOpProvider>
      <SaveBar dirty={dirty} saving={saving} onSave={save} label={session.workflow === "pull-request" ? t.saveDraft : t.save} />
    </>
  );
}


/* ── Review (pull-request workflow) ─────────────────────────────── */

const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} d`;
};

export function ReviewView() {
  const { api, schema, t, toast, bumpDrafts, viewTick } = useZay();
  const list = useAsync(() => api.drafts(), [api, viewTick]);
  const [busy, setBusy] = React.useState<number | null>(null);

  const label = (d: DraftInfo) => {
    const x = d.target;
    if (x.kind === "c") return { group: schema.collections[x.name]?.label ?? x.name, name: x.slug ?? "", to: `/c/${x.name}/${x.slug}` };
    if (x.kind === "s") return { group: schema.singletons[x.name]?.label ?? x.name, name: "", to: `/s/${x.name}` };
    return { group: schema.fileSets[x.name]?.label ?? x.name, name: x.file ?? "", to: `/f/${x.name}/${x.file}` };
  };

  const run = async (d: DraftInfo, kind: "publish" | "discard") => {
    if (!window.confirm(kind === "publish" ? t.confirmPublish : t.confirmDiscard)) return;
    setBusy(d.number);
    try {
      if (kind === "publish") await api.publishDraft(d.number);
      else await api.discardDraft(d.number);
      toast("ok", kind === "publish" ? t.published : t.deleted);
      bumpDrafts();
      list.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title={t.review} />
      {list.loading && !list.data && <Loading />}
      {list.error && <ErrorBox message={list.error} />}
      {list.data && !list.data.drafts.length && <p className="zs-muted zs-pad">{t.noDrafts}</p>}
      <ul className="zs-rows">
        {(list.data?.drafts ?? []).map((d) => {
          const l = label(d);
          return (
            <li key={d.number} className="zs-row zs-review-row">
              <Link to={l.to} className="zs-row-main">
                <b>{l.name || l.group}</b>
                <small>
                  {l.name ? `${l.group} · ` : ""}#{d.number} · {ago(d.updatedAt)}
                  {d.author ? ` · ${d.author.login}` : ""}
                </small>
              </Link>
              <a className="zs-btn zs-btn-sm zs-btn-ghost" href={d.url} target="_blank" rel="noreferrer">
                {t.openPr}
              </a>
              {d.previewUrl && (
                <a className="zs-btn zs-btn-sm zs-btn-ghost" href={d.previewUrl} target="_blank" rel="noreferrer">
                  {t.preview}
                </a>
              )}
              <button type="button" className="zs-btn zs-btn-sm zs-btn-primary" disabled={busy === d.number} onClick={() => void run(d, "publish")}>
                {t.publish}
              </button>
              <button type="button" className="zs-btn zs-btn-sm zs-btn-ghost zs-danger" disabled={busy === d.number} onClick={() => void run(d, "discard")}>
                {t.discard}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

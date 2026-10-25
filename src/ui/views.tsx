"use client";

import * as React from "react";

import { normalize, obj, translatableFields } from "../schema/dsl.mjs";
import type { Field, Fields } from "../schema/dsl.mjs";
import { Link, useZay } from "./context";
import { Form, ListOpProvider, applyListOp } from "./form";
import type { ListOp } from "./form";
import { Plus, Search, Trash } from "./icons";
import { ErrorBox, Loading, LocaleTabs, PageHeader, SaveBar, useAsync, useDirty, useSaveShortcut } from "./parts";
import type { Docs, EntrySummary } from "./types";
import { clone, cx, slugify } from "./util";

type SaveResult = { ok: boolean; unchanged?: boolean; id?: string; url?: string; files?: number };

/* ── Genel bakış ────────────────────────────────────────────────── */

export function Dashboard() {
  const { schema, session, t } = useZay();
  const sections = navSections(schema);
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

export function navSections(schema: ReturnType<typeof useZay>["schema"]): NavSection[] {
  const items: (NavItem & { group?: string })[] = [
    ...Object.entries(schema.collections).map(([key, c]) => ({ to: `/c/${key}`, label: c.label, kind: "c" as const, key, group: c.group })),
    ...Object.entries(schema.singletons).map(([key, s]) => ({ to: `/s/${key}`, label: s.label, kind: "s" as const, key, group: s.group })),
    ...Object.entries(schema.fileSets).map(([key, f]) => ({ to: `/f/${key}`, label: f.label, kind: "f" as const, key, group: f.group })),
  ];
  const known = schema.groups.map((g) => g.id);
  const out: NavSection[] = schema.groups.map((g) => ({ id: g.id, label: g.label, items: items.filter((i) => i.group === g.id) }));
  const rest = items.filter((i) => !i.group || !known.includes(i.group));
  if (rest.length) out.push({ id: "_", label: "·", items: rest });
  return out.filter((s) => s.items.length);
}

/* ── Koleksiyon listesi ─────────────────────────────────────────── */

export function CollectionView({ name }: { name: string }) {
  const { api, schema, t } = useZay();
  const col = schema.collections[name];
  const [q, setQ] = React.useState("");
  const { data, error, loading } = useAsync(() => api.get<{ entries: EntrySummary[] }>(`/collections/${name}`), [name]);
  if (!col) return <ErrorBox message={`?${name}`} />;

  const rows = (data?.entries ?? []).filter((e) => !q.trim() || `${e.title} ${e.slug} ${e.summary}`.toLowerCase().includes(q.trim().toLowerCase()));
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
                {e.published === false && <span className="zs-pill">{t.draft}</span>}
                {localized && (
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

/* ── Kayıt düzenleyici ──────────────────────────────────────────── */

const blankDocs = (fields: Fields, locales: string[], def: string, localized: boolean): Docs => {
  const docs: Docs = {};
  for (const l of localized ? locales : [def]) {
    docs[l] = normalize(obj("", l === def ? fields : translatableFields(fields)), undefined) as Record<string, unknown>;
  }
  return docs;
};

function listFieldAt(fields: Fields, path: (string | number)[]): Field | undefined {
  let f: Field | undefined = { type: "object", label: "", fields };
  for (const k of path) f = typeof k === "number" ? f?.item : f?.fields?.[k];
  return f;
}

export function EntryView({ name, slug }: { name: string; slug: string }) {
  const { api, schema, t, navigate, toast, editors, setGuard } = useZay();
  const col = schema.collections[name];
  const isNew = slug === "_new";
  const def = schema.defaultLocale;
  const localized = col?.layout === "locales";
  const Editor = col?.editor ? editors[col.editor] : undefined;

  /* Panel bu bileşeni her kayıt için yeniden kurar (key), bu yüzden başlangıç durumu tek seferlik. */
  const initial = isNew && col ? blankDocs(col.fields, schema.locales, def, localized) : null;
  const [docs, setDocs] = React.useState<Docs | null>(initial);
  const [saved, setSaved] = React.useState<string | null>(initial ? JSON.stringify(initial) : null);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(def);
  const [view, setView] = React.useState<"visual" | "form">("visual");
  const [newSlug, setNewSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!col || isNew) return;
    let live = true;
    api
      .get<{ docs: Docs }>(`/collections/${name}/${slug}`)
      .then((r) => {
        if (!live) return;
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
    setSaving(true);
    try {
      const res = isNew
        ? await api.post<SaveResult>(`/collections/${name}/${effectiveSlug}`, { docs })
        : await api.put<SaveResult>(`/collections/${name}/${slug}`, { docs });
      setSaved(JSON.stringify(docs));
      toast("ok", res.unchanged ? t.unchangedNote : `${t.committed} · ${t.deployNote}`);
      if (isNew) {
        setGuard(null);
        navigate(`/c/${name}/${effectiveSlug}`, { replace: true });
      }
    } catch (e) {
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
      const item = listFieldAt(col.fields, path)?.item;
      setDocs((prev) => {
        if (!prev) return prev;
        const next: Docs = { ...prev };
        for (const l of schema.locales) if (l !== def) next[l] = applyListOp(prev[l] ?? {}, path, op, item);
        return next;
      });
    },
    [col, localized, schema.locales, def],
  );

  if (!col) return <ErrorBox message={`?${name}`} />;
  if (error) return <ErrorBox message={error} />;
  if (!docs) return <Loading />;

  const translating = localized && active !== def;
  const fieldsFor = translating ? translatableFields(col.fields) : col.fields;
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
        <LocaleTabs locales={schema.locales} docs={docs} active={active} onChange={setActive} defaultLocale={def} />
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

      <SaveBar dirty={dirty} saving={saving} onSave={save} label={isNew ? t.create : t.save} />
    </>
  );
}

/* ── Tek kayıt ──────────────────────────────────────────────────── */

export function SingletonView({ name }: { name: string }) {
  const { api, schema, t, toast } = useZay();
  const def = schema.singletons[name];
  const [doc, setDoc] = React.useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    api
      .get<{ doc: Record<string, unknown> }>(`/singletons/${name}`)
      .then((r) => {
        if (!live) return;
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
    setSaving(true);
    try {
      const res = await api.put<SaveResult>(`/singletons/${name}`, { doc });
      setSaved(JSON.stringify(doc));
      toast("ok", res.unchanged ? t.unchangedNote : `${t.committed} · ${t.deployNote}`);
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
      <PageHeader title={def.label} />
      <Form fields={def.fields} value={doc} onChange={setDoc} />
      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </>
  );
}

/* ── Dosya takımları (arayüz metinleri) ─────────────────────────── */

export function FileSetView({ name, file }: { name: string; file?: string }) {
  const { api, schema } = useZay();
  const set = schema.fileSets[name];
  const [q, setQ] = React.useState("");
  const list = useAsync(() => api.get<{ files: { name: string; label: string }[] }>(`/filesets/${name}`), [name]);
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
  const { api, schema, t, toast } = useZay();
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
      .get<{ file: { label: string }; fields: Fields; docs: Docs }>(`/filesets/${name}/${file}`)
      .then((r) => {
        if (!live) return;
        setData(r);
        setDocs(r.docs);
        setSaved(JSON.stringify(r.docs));
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [api, name, file]);

  const dirty = useDirty(docs ?? undefined, saved);
  const save = async () => {
    if (!docs || saving || !dirty) return;
    setSaving(true);
    try {
      const res = await api.put<SaveResult>(`/filesets/${name}/${file}`, { docs });
      setSaved(JSON.stringify(docs));
      toast("ok", res.unchanged ? t.unchangedNote : `${t.committed} · ${t.deployNote}`);
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
      const item = listFieldAt(data.fields, path)?.item;
      setDocs((prev) => {
        if (!prev) return prev;
        const next: Docs = { ...prev };
        for (const l of schema.locales) if (l !== def) next[l] = applyListOp(prev[l] ?? {}, path, op, item);
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
      <PageHeader crumbs={<Link to={`/f/${name}`}>{label}</Link>} title={data.file.label} sub={<code>{file}</code>} />
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
      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </>
  );
}


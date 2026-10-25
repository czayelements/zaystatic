"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { normalize } from "../schema/dsl.mjs";
import type { Field, Fields } from "../schema/dsl.mjs";
import { useZay } from "./context";
import { Chevron, Copy, Grip, Plus, Trash, Upload, X } from "./icons";
import { clone, cx, renderTemplate, uid } from "./util";

type Path = (string | number)[];
type Doc = Record<string, unknown>;

/* ── Liste işlemleri: varsayılan dilde yapılan yapı değişikliği öbür dillere yayılır ── */

export type ListOp =
  | { type: "move"; from: number; to: number }
  | { type: "add"; index: number }
  | { type: "remove"; index: number }
  | { type: "dup"; index: number };

type Emit = (path: Path, op: ListOp) => void;
const ListOpContext = React.createContext<Emit | null>(null);
export const ListOpProvider = ListOpContext.Provider;

/** Bir belgedeki `path` listesine işlemi uygular (öteki dillerin belgeleri için). */
export function applyListOp(doc: Doc, path: Path, op: ListOp, item: Field | undefined): Doc {
  const next = clone(doc);
  let cur: unknown = next;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return doc;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  if (!Array.isArray(cur)) return doc;
  const blank = () => (item ? normalize(item, undefined) : "");
  if (op.type === "move") {
    const moved = arrayMove(cur, op.from, op.to);
    cur.splice(0, cur.length, ...moved);
  } else if (op.type === "add") cur.splice(op.index, 0, blank());
  else if (op.type === "remove") cur.splice(op.index, 1);
  else if (op.type === "dup") cur.splice(op.index + 1, 0, clone(cur[op.index] ?? blank()));
  return next;
}

/* ── Arama süzgeci ──────────────────────────────────────────────── */

function matches(key: string, field: Field, value: unknown, q: string): boolean {
  if (key.toLowerCase().includes(q) || field.label.toLowerCase().includes(q)) return true;
  if (typeof value === "string") return value.toLowerCase().includes(q);
  if (Array.isArray(value)) {
    return value.some((v) => (typeof v === "string" ? v.toLowerCase().includes(q) : field.item ? descends(field.item, v, q) : false));
  }
  if (value && typeof value === "object" && field.fields) return descends(field, value, q);
  return false;
}
function descends(field: Field, value: unknown, q: string): boolean {
  if (typeof value === "string") return value.toLowerCase().includes(q);
  if (!field.fields || !value || typeof value !== "object") return false;
  return Object.entries(field.fields).some(([k, f]) => matches(k, f, (value as Doc)[k], q));
}

/* ── Alanlar ────────────────────────────────────────────────────── */

type FormProps = {
  fields: Fields;
  value: Doc;
  onChange: (next: Doc) => void;
  /** Çeviri sekmesi: varsayılan dilin belgesi (alt metin olarak gösterilir, yapı kilitlenir). */
  reference?: Doc | null;
  filter?: string;
  path?: Path;
};

export function Form({ fields, value, onChange, reference, filter, path = [] }: FormProps) {
  const q = filter?.trim().toLowerCase() ?? "";
  const entries = Object.entries(fields).filter(([key, f]) => !q || matches(key, f, value[key], q));
  if (!entries.length) return <p className="zs-muted">…</p>;
  return (
    <div className="zs-form">
      {entries.map(([key, field]) => (
        <FieldRow
          key={key}
          name={key}
          field={field}
          value={value[key]}
          reference={reference ? reference[key] : undefined}
          translating={Boolean(reference)}
          filter={filter}
          path={[...path, key]}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
    </div>
  );
}

type RowProps = {
  name: string;
  field: Field;
  value: unknown;
  reference?: unknown;
  translating: boolean;
  filter?: string;
  path: Path;
  onChange: (v: unknown) => void;
  /** Etiketsiz, tek satır (satır içi nesne alt alanları). */
  compact?: boolean;
};

function FieldRow(props: RowProps) {
  const { field, compact } = props;
  const complex = field.type === "list" || (field.type === "object" && !field.inline);
  if (compact) {
    return (
      <div className="zs-inline-row">
        <span className="zs-badge">{field.label}</span>
        <div className="zs-grow">
          <Control {...props} />
        </div>
      </div>
    );
  }
  if (complex) return <Control {...props} />;
  return (
    <div className="zs-field">
      <label className="zs-label">
        {field.label}
        {field.hint && <span className="zs-hint">{field.hint}</span>}
      </label>
      <Control {...props} />
    </div>
  );
}

function Control(props: RowProps) {
  const { name, field, value, reference, translating, onChange } = props;
  const ref = typeof reference === "string" && reference ? reference : null;

  switch (field.type) {
    case "string":
      return (
        <>
          <input className="zs-input" value={asString(value)} onChange={(e) => onChange(e.target.value)} placeholder={ref ?? undefined} />
          {ref && translating && asString(value) === "" && <Ref text={ref} />}
        </>
      );
    case "image":
      return <ImageField value={asString(value)} onChange={onChange} placeholder={ref ?? undefined} />;
    case "text":
      return (
        <>
          <Area value={asString(value)} onChange={onChange} rows={3} />
          {ref && translating && <Ref text={ref} />}
        </>
      );
    case "markdown":
      return (
        <>
          <Area value={asString(value)} onChange={onChange} rows={22} mono />
          {ref && translating && <Ref text={ref} />}
        </>
      );
    case "int":
      return (
        <input
          className="zs-input zs-input-narrow"
          type="number"
          value={typeof value === "number" ? value : ""}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "bool":
      return <Switch checked={value === true} onChange={onChange} />;
    case "select":
      return <SelectField field={field} value={asString(value)} onChange={onChange} />;
    case "date":
      return (
        <input
          className="zs-input zs-input-narrow"
          type="date"
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "datetime":
      return (
        <input
          className="zs-input zs-input-narrow"
          type="datetime-local"
          value={typeof value === "string" ? value.slice(0, 16) : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "relation":
    case "relations":
      return <RelationField field={field} value={value} onChange={onChange} />;
    case "object":
      return <ObjectField {...props} />;
    case "list":
      return <ListField {...props} />;
    default:
      return <p className="zs-muted">{name}: ?</p>;
  }
}

const asString = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function Ref({ text }: { text: string }) {
  return <p className="zs-ref">{text}</p>;
}

function Area({ value, onChange, rows, mono }: { value: string; onChange: (v: string) => void; rows: number; mono?: boolean }) {
  const el = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight + 2, mono ? 900 : 520)}px`;
  }, [value, mono]);
  return (
    <textarea
      ref={el}
      className={cx("zs-input zs-area", mono && "zs-mono")}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={!mono}
    />
  );
}

/* ── Görsel: bağlantı yapıştır ya da yükle (sürükle / yapıştır / seç) ── */

const looksLikeUrl = (v: string) => /^(https?:\/\/|\/|data:image\/)/.test(v.trim());

function ImageField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { api, session, t, toast } = useZay();
  const media = session.media;
  const [busy, setBusy] = React.useState(false);
  const [over, setOver] = React.useState(false);
  const [broken, setBroken] = React.useState(false);
  const pick = React.useRef<HTMLInputElement>(null);

  const send = async (file: File | undefined) => {
    if (!file || !media) return;
    if (!media.accept.includes(file.type)) return toast("error", t.badType);
    if (file.size > media.maxBytes) return toast("error", `${t.tooBig} (≤ ${Math.round(media.maxBytes / 1024 / 1024)} MB)`);
    setBusy(true);
    try {
      const { url } = await api.upload(file);
      setBroken(false);
      onChange(url);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fileOf = (list: DataTransfer | null) => [...(list?.files ?? [])].find((f) => f.type.startsWith("image/"));

  return (
    <div
      className={cx("zs-image", over && "is-over")}
      onDragOver={(e) => {
        if (media && [...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const f = fileOf(e.dataTransfer);
        if (f && media) {
          e.preventDefault();
          void send(f);
        }
      }}
    >
      {value && looksLikeUrl(value) && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- yönetici önizlemesi: dış alan adı, optimizasyon gerekmiyor
        <img className="zs-image-preview" src={value} alt="" onError={() => setBroken(true)} onLoad={() => setBroken(false)} />
      ) : (
        <div className="zs-image-preview zs-image-empty">{busy ? t.uploading : "—"}</div>
      )}
      <div className="zs-image-side">
        <input
          className="zs-input"
          value={value}
          placeholder={placeholder ?? (media ? t.pasteOrDrop : "https://…")}
          onChange={(e) => {
            setBroken(false);
            onChange(e.target.value);
          }}
          onPaste={(e) => {
            const f = fileOf(e.clipboardData);
            if (f && media) {
              e.preventDefault();
              void send(f);
            }
          }}
        />
        <div className="zs-image-actions">
          {media && (
            <>
              <button type="button" className="zs-btn zs-btn-sm" disabled={busy} onClick={() => pick.current?.click()}>
                <Upload /> {busy ? t.uploading : value ? t.replaceImage : t.upload}
              </button>
              <input
                ref={pick}
                type="file"
                hidden
                accept={media.accept.join(",")}
                onChange={(e) => {
                  void send(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </>
          )}
          {value && (
            <button type="button" className="zs-btn zs-btn-sm zs-btn-ghost" onClick={() => onChange("")}>
              <X /> {t.clear}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={cx("zs-switch", checked && "is-on")} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function SelectField({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const options = field.options ?? [];
  const known = options.some((o) => o.value === value);
  if (options.length <= 4 && options.length > 0 && known) {
    return (
      <div className="zs-seg" role="radiogroup">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={cx(o.value === value && "is-on")} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <select className="zs-input zs-input-narrow" value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value={value}>{value || "—"}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ── İlişkili kayıtlar ─────────────────────────────────────────── */

const optionCache = new Map<string, Promise<{ value: string; label: string }[]>>();

function useOptions(collection: string) {
  const { api } = useZay();
  const [options, setOptions] = React.useState<{ value: string; label: string }[]>([]);
  React.useEffect(() => {
    const key = `${api.base}:${collection}`;
    let p = optionCache.get(key);
    if (!p) {
      p = api.get<{ options: { value: string; label: string }[] }>(`/collections/${collection}/_options`).then((r) => r.options);
      optionCache.set(key, p);
    }
    let live = true;
    p.then((o) => live && setOptions(o)).catch(() => optionCache.delete(key));
    return () => {
      live = false;
    };
  }, [api, collection]);
  return options;
}

function RelationField({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useZay();
  const options = useOptions(field.collection ?? "");
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  if (field.type === "relation") {
    const current = asString(value);
    return (
      <select className="zs-input" value={current} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{t.select}</option>
        {current && !options.some((o) => o.value === current) && <option value={current}>{current}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  const selected = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div>
      <div className="zs-chips">
        {selected.map((v) => (
          <span key={v} className="zs-chip">
            {label(v)}
            <button type="button" aria-label={t.remove} onClick={() => onChange(selected.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <select
        className="zs-input zs-input-narrow"
        value=""
        onChange={(e) => e.target.value && onChange([...selected, e.target.value])}
      >
        <option value="">{t.add}…</option>
        {options
          .filter((o) => !selected.includes(o.value))
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
    </div>
  );
}

/* ── Nesne ──────────────────────────────────────────────────────── */

function ObjectField({ field, value, reference, translating, filter, path, onChange }: RowProps) {
  const src = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Doc;
  const ref = reference && typeof reference === "object" && !Array.isArray(reference) ? (reference as Doc) : null;
  const fields = field.fields ?? {};
  const set = (key: string, v: unknown) => onChange({ ...src, [key]: v });

  if (field.inline) {
    return (
      <div className="zs-inline">
        {Object.entries(fields).map(([key, f]) => (
          <FieldRow
            key={key}
            compact
            name={key}
            field={f}
            value={src[key]}
            reference={ref?.[key]}
            translating={translating}
            path={[...path, key]}
            onChange={(v) => set(key, v)}
          />
        ))}
      </div>
    );
  }
  return (
    <fieldset className="zs-group">
      <legend>
        {field.label}
        {field.hint && <span className="zs-hint">{field.hint}</span>}
      </legend>
      <Form fields={fields} value={src} reference={ref ?? (translating ? {} : undefined)} filter={filter} path={path} onChange={onChange as (v: Doc) => void} />
    </fieldset>
  );
}

/* ── Liste: sürükle-bırak, aç/kapa, çoğalt, sil ──────────────────── */

function itemTitle(item: Field, value: unknown, summary: string | undefined, index: number, empty: string) {
  if (summary) {
    const s = renderTemplate(summary, value);
    if (s) return s;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Doc)) if (typeof v === "string" && v.trim()) return v.trim().slice(0, 80);
    for (const v of Object.values(value as Doc)) {
      if (v && typeof v === "object") {
        for (const w of Object.values(v as Doc)) if (typeof w === "string" && w.trim()) return w.trim().slice(0, 80);
      }
    }
  }
  return `${empty} ${index + 1}`;
}

function ListField({ field, value, reference, translating, filter, path, onChange }: RowProps) {
  const { t } = useZay();
  const emit = React.useContext(ListOpContext);
  const item = field.item as Field;
  const isObject = item.type === "object";
  const refList = Array.isArray(reference) ? reference : null;
  /* Çeviri sekmesinde yapı kilitli: eleman sayısı varsayılan dildekiyle aynı. */
  const locked = translating && refList !== null;
  const raw = Array.isArray(value) ? value : [];
  const items = locked ? Array.from({ length: refList.length }, (_, i) => raw[i] ?? normalize(item, undefined)) : raw;

  /* Kararlı kimlikler (sürükle-bırak ve aç/kapa durumu için). Eleman sayısı dışarıdan
     değişirse (yükleme, "şundan kopyala") render sırasında eşitlenir. */
  const [ids, setIds] = React.useState<string[]>(() => items.map(uid));
  let keys = ids;
  if (ids.length !== items.length) {
    keys = items.map((_, i) => ids[i] ?? uid());
    setIds(keys);
  }

  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] ?? items.length <= 2;
  const q = filter?.trim().toLowerCase() ?? "";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commit = (next: unknown[]) => onChange(next);

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setIds(arrayMove(keys, from, to));
    commit(arrayMove(items, from, to));
    emit?.(path, { type: "move", from, to });
  };
  const add = () => {
    const id = uid();
    setIds([...keys, id]);
    setOpen((o) => ({ ...o, [id]: true }));
    commit([...items, normalize(item, undefined)]);
    emit?.(path, { type: "add", index: items.length });
  };
  const remove = (i: number) => {
    setIds(keys.filter((_, j) => j !== i));
    commit(items.filter((_, j) => j !== i));
    emit?.(path, { type: "remove", index: i });
  };
  const dup = (i: number) => {
    const id = uid();
    setIds([...keys.slice(0, i + 1), id, ...keys.slice(i + 1)]);
    setOpen((o) => ({ ...o, [id]: true }));
    const copy = [...items];
    copy.splice(i + 1, 0, clone(items[i]));
    commit(copy);
    emit?.(path, { type: "dup", index: i });
  };
  const setAt = (i: number, v: unknown) => commit(items.map((x, j) => (j === i ? v : x)));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(keys.indexOf(String(e.active.id)), keys.indexOf(String(e.over.id)));
  };

  const setAll = (v: boolean) => setOpen(Object.fromEntries(keys.map((id) => [id, v])));

  return (
    <section className="zs-list">
      <header className="zs-list-head">
        <h4>
          {field.label}
          <span className="zs-count">{items.length}</span>
        </h4>
        {field.hint && <span className="zs-hint">{field.hint}</span>}
        <span className="zs-grow" />
        {isObject && items.length > 1 && (
          <>
            <button type="button" className="zs-link" onClick={() => setAll(true)}>
              {t.expandAll}
            </button>
            <button type="button" className="zs-link" onClick={() => setAll(false)}>
              {t.collapseAll}
            </button>
          </>
        )}
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy} disabled={locked}>
          <div className="zs-list-body">
            {items.map((entry, i) => {
              const id = keys[i]!;
              if (q && !(typeof entry === "string" ? entry.toLowerCase().includes(q) : descends(item, entry, q))) return null;
              return (
                <SortableItem
                  key={id}
                  id={id}
                  locked={locked}
                  title={isObject ? itemTitle(item, entry, field.summary ?? item.summary, i, t.untitled) : undefined}
                  index={i}
                  open={isObject ? isOpen(id) : true}
                  collapsible={isObject}
                  onToggle={() => setOpen((o) => ({ ...o, [id]: !isOpen(id) }))}
                  onDup={() => dup(i)}
                  onRemove={() => remove(i)}
                >
                  {isObject ? (
                    <Form
                      fields={item.fields ?? {}}
                      value={(entry && typeof entry === "object" ? entry : {}) as Doc}
                      reference={locked ? ((refList?.[i] as Doc) ?? {}) : undefined}
                      filter={filter}
                      path={[...path, i]}
                      onChange={(v) => setAt(i, v)}
                    />
                  ) : (
                    <>
                      <input className="zs-input" value={asString(entry)} onChange={(e) => setAt(i, e.target.value)} placeholder={locked ? asString(refList?.[i]) : undefined} />
                      {locked && asString(entry) === "" && asString(refList?.[i]) && <Ref text={asString(refList?.[i])} />}
                    </>
                  )}
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {!locked && (
        <button type="button" className="zs-add" onClick={add}>
          <Plus /> {t.add}
        </button>
      )}
    </section>
  );
}

function SortableItem({
  id,
  locked,
  title,
  index,
  open,
  collapsible,
  onToggle,
  onDup,
  onRemove,
  children,
}: {
  id: string;
  locked: boolean;
  title?: string;
  index: number;
  open: boolean;
  collapsible: boolean;
  onToggle: () => void;
  onDup: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const { t } = useZay();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={cx("zs-item", isDragging && "is-dragging", collapsible && !open && "is-closed")}>
      <div className="zs-item-bar">
        {!locked && (
          <button type="button" className="zs-handle" aria-label="Drag" {...attributes} {...listeners}>
            <Grip />
          </button>
        )}
        {collapsible ? (
          <button type="button" className="zs-item-title" onClick={onToggle} aria-expanded={open}>
            <Chevron className={cx("zs-chev", open && "is-open")} />
            <span className="zs-item-no">{index + 1}</span>
            <span className="zs-item-text">{title}</span>
          </button>
        ) : (
          <span className="zs-item-no zs-item-no-plain">{index + 1}</span>
        )}
        {!collapsible && <div className="zs-grow zs-item-inline">{children}</div>}
        {!locked && (
          <span className="zs-item-actions">
            <button type="button" aria-label={t.duplicate} title={t.duplicate} onClick={onDup}>
              <Copy />
            </button>
            <button type="button" aria-label={t.remove} title={t.remove} onClick={onRemove}>
              <Trash />
            </button>
          </span>
        )}
      </div>
      {collapsible && open && <div className="zs-item-body">{children}</div>}
    </div>
  );
}

"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Field, Fields } from "../schema/dsl.mjs";
import { useZay } from "./context";
import { Form, blankItem, blockField, useListOpEmitter } from "./form";
import type { ListOp } from "./form";
import { ArrowDown, ArrowUp, Copy, Grip, Plus, Trash } from "./icons";
import type { EditorProps } from "./types";
import { clone, cx, isEmpty, uid } from "./util";

type Doc = Record<string, unknown>;

/** What a block preview receives: the block's values (translations merged over the default language) and its state. */
export type BlockPreviewProps = {
  block: Doc;
  /** The block type name, e.g. "hero". */
  type: string;
  index: number;
  /** Active content language. */
  locale: string;
  selected: boolean;
};

export type BlockBuilderOptions = {
  /** Name of the `blocks` field this builder edits. */
  field: string;
  /**
   * How each block type looks on the canvas: your site's own components, so editors see what
   * visitors will. Types without a preview get a simple generic card.
   */
  previews?: Record<string, React.ComponentType<BlockPreviewProps>>;
  /** Wraps the canvas: apply your fonts, width and background here. */
  Frame?: React.ComponentType<{ children: React.ReactNode }>;
};

/**
 * A visual page builder for a `blocks` field. Register the result as an editor:
 *
 *   const PageBuilder = createBlockBuilder({ field: "sections", previews: { hero: HeroPreview } });
 *   <ZayApp editors={{ page: PageBuilder }} />            // schema: editors: ["page"]
 *
 * Centre: the page, drawn with your previews; drag blocks to reorder, click one to select it.
 * Right: a palette of the schema's block types (drag onto the page, or click to add) and the
 * settings of the selected block. Translations follow the default language's structure.
 */
export function createBlockBuilder(options: BlockBuilderOptions): React.ComponentType<EditorProps> {
  function BlockBuilder(props: EditorProps) {
    return <Builder {...props} options={options} />;
  }
  BlockBuilder.displayName = `BlockBuilder(${options.field})`;
  return BlockBuilder;
}

const PALETTE = "palette:";
const END = "zs-builder-end";

function Builder({ options, ...props }: EditorProps & { options: BlockBuilderOptions }) {
  const { t } = useZay();
  const emit = useListOpEmitter();
  const { field: fieldName, previews = {}, Frame } = options;

  const fieldDef = props.fields[fieldName] as Field | undefined;
  const translating = props.translated && props.activeLocale !== props.defaultLocale;
  const locked = translating; // structure follows the default language

  /* Blocks: in a translation the list mirrors the default language's, with the translated values merged in. */
  const own = (Array.isArray(props.value[fieldName]) ? props.value[fieldName] : []) as Doc[];
  const base = (Array.isArray(props.docs[props.defaultLocale]?.[fieldName]) ? props.docs[props.defaultLocale]![fieldName] : []) as Doc[];
  const items: Doc[] = translating ? base.map((b, i) => own[i] ?? (fieldDef ? (blankItem(fieldDef, String(b._type)) as Doc) : b)) : own;
  const shown = (i: number): Doc => {
    if (!translating) return items[i]!;
    const merged: Doc = { ...base[i] };
    for (const [k, v] of Object.entries(items[i] ?? {})) if (!isEmpty(v)) merged[k] = v;
    return merged;
  };

  /* Stable ids, so selection and drag survive reordering. */
  const [ids, setIds] = React.useState<string[]>(() => items.map(uid));
  let keys = ids;
  if (ids.length !== items.length) {
    keys = items.map((_, i) => ids[i] ?? uid());
    setIds(keys);
  }
  const [selected, setSelected] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"blocks" | "settings">("blocks");
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [dropAt, setDropAt] = React.useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  if (!fieldDef || fieldDef.type !== "blocks") {
    return <p className="zs-error">{`Block builder: "${fieldName}" is not a blocks field.`}</p>;
  }
  const def = fieldDef;
  const types = Object.entries(def.blocks ?? {});
  const selIndex = selected ? keys.indexOf(selected) : -1;

  const commit = (next: Doc[], op?: ListOp) => {
    props.onChange({ ...props.value, [fieldName]: next });
    if (op) emit?.([fieldName], op);
  };
  const insert = (type: string, at: number) => {
    const id = uid();
    const index = Math.max(0, Math.min(at, items.length));
    setIds([...keys.slice(0, index), id, ...keys.slice(index)]);
    const next = [...items];
    next.splice(index, 0, blankItem(def, type) as Doc);
    commit(next, { type: "add", index, blockType: type });
    setSelected(id); /* selected, but the palette stays open so several blocks can be added in a row */
  };
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    setIds(arrayMove(keys, from, to));
    commit(arrayMove(items, from, to), { type: "move", from, to });
  };
  const remove = (i: number) => {
    setIds(keys.filter((_, j) => j !== i));
    commit(items.filter((_, j) => j !== i), { type: "remove", index: i });
    setSelected(null);
    setTab("blocks");
  };
  const duplicate = (i: number) => {
    const id = uid();
    setIds([...keys.slice(0, i + 1), id, ...keys.slice(i + 1)]);
    const next = [...items];
    next.splice(i + 1, 0, clone(items[i]!));
    commit(next, { type: "dup", index: i });
    setSelected(id);
  };
  const update = (i: number, block: Doc) => commit(items.map((b, j) => (j === i ? block : b)));

  /* Where a palette drop would land: before or after the block under the pointer. */
  const indexFor = (e: DragOverEvent | DragEndEvent): number | null => {
    const over = e.over;
    if (!over) return null;
    if (over.id === END) return items.length;
    const i = keys.indexOf(String(over.id));
    if (i < 0) return null;
    const moved = e.active.rect.current.translated;
    const below = moved ? moved.top + moved.height / 2 > over.rect.top + over.rect.height / 2 : false;
    return below ? i + 1 : i;
  };

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onDragOver = (e: DragOverEvent) => setDropAt(String(e.active.id).startsWith(PALETTE) ? indexFor(e) : null);
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    setDragging(null);
    setDropAt(null);
    if (id.startsWith(PALETTE)) {
      const at = indexFor(e);
      if (at !== null) insert(id.slice(PALETTE.length), at);
      return;
    }
    if (e.over && e.over.id !== id) {
      const from = keys.indexOf(id);
      const to = e.over.id === END ? items.length - 1 : keys.indexOf(String(e.over.id));
      if (to >= 0) move(from, to);
    }
  };

  const sel = selIndex >= 0 ? items[selIndex] : null;
  const selType = sel ? String(sel._type) : "";
  const selDef = sel ? blockField(def, selType) : undefined;
  /* Fields shown in the settings: all of them in the default language, only the translated ones elsewhere. */
  const settingsFields: Fields = (() => {
    if (!selDef) return {};
    if (!translating) return selDef.fields ?? {};
    return blockField(props.activeFields[fieldName] ?? def, selType)?.fields ?? {};
  })();
  const ghost = dragging?.startsWith(PALETTE) ? types.find(([k]) => k === dragging.slice(PALETTE.length)) : undefined;
  const Wrap = Frame ?? DefaultFrame;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setDragging(null), setDropAt(null))}>
      <div className="zs-builder">
        <div className="zs-canvas-col">
          {locked && <p className="zs-note">{t.structureLocked}</p>}
          <Wrap>
            <SortableContext items={keys} strategy={verticalListSortingStrategy} disabled={locked}>
              {items.map((_, i) => {
                const id = keys[i]!;
                const type = String(items[i]!._type);
                return (
                  <React.Fragment key={id}>
                    {dropAt === i && <DropLine />}
                    <CanvasBlock
                      id={id}
                      index={i}
                      count={items.length}
                      locked={locked}
                      selected={selected === id}
                      onSelect={() => {
                        setSelected(id);
                        setTab("settings");
                      }}
                      onMove={(to) => move(i, to)}
                      onDuplicate={() => duplicate(i)}
                      onRemove={() => remove(i)}
                    >
                      {React.createElement(previews[type] ?? GenericPreview, { block: shown(i), type, index: i, locale: props.activeLocale, selected: selected === id, ...(previews[type] ? {} : { def: blockField(def, type), label: def.blocks?.[type]?.label ?? type }) } as BlockPreviewProps)}
                    </CanvasBlock>
                  </React.Fragment>
                );
              })}
              {dropAt === items.length && items.length > 0 && <DropLine />}
              <EndZone empty={items.length === 0} hint={t.dropBlockHere} locked={locked} />
            </SortableContext>
          </Wrap>
        </div>

        <aside className="zs-builder-side">
          <div className="zs-seg zs-seg-sm">
            <button type="button" className={cx(tab === "blocks" && "is-on")} onClick={() => setTab("blocks")}>
              {t.blocks}
            </button>
            <button type="button" className={cx(tab === "settings" && "is-on")} onClick={() => setTab("settings")}>
              {t.settings}
            </button>
          </div>

          {tab === "blocks" ? (
            <div className="zs-palette">
              {types.map(([type, b]) => (
                <PaletteCard key={type} type={type} label={b.label} description={b.description} icon={b.icon} disabled={locked} onAdd={() => insert(type, selIndex >= 0 ? selIndex + 1 : items.length)} />
              ))}
            </div>
          ) : sel && selDef ? (
            <div className="zs-inspector">
              <h4>{def.blocks?.[selType]?.label ?? selType}</h4>
              <Form
                key={selected!}
                fields={settingsFields}
                value={sel}
                reference={translating ? base[selIndex] : undefined}
                path={[fieldName, selIndex]}
                onChange={(v) => update(selIndex, v)}
              />
            </div>
          ) : (
            <p className="zs-muted zs-pad">{t.selectBlock}</p>
          )}
        </aside>
      </div>
      <DragOverlay>{ghost ? <div className="zs-palette-card is-ghost"><span className="zs-palette-icon">{ghost[1].icon ?? ghost[1].label.slice(0, 1)}</span><b>{ghost[1].label}</b></div> : null}</DragOverlay>
    </DndContext>
  );
}

const DefaultFrame = ({ children }: { children: React.ReactNode }) => <div className="zs-canvas">{children}</div>;
const DropLine = () => <div className="zs-drop-line" aria-hidden="true" />;

function EndZone({ empty, hint, locked }: { empty: boolean; hint: string; locked: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: END, disabled: locked });
  return (
    <div ref={setNodeRef} className={cx("zs-end-zone", empty && "is-empty", isOver && "is-over")}>
      {empty && !locked ? hint : null}
    </div>
  );
}

function PaletteCard({ type, label, description, icon, disabled, onAdd }: { type: string; label: string; description?: string; icon?: string; disabled: boolean; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${PALETTE}${type}`, disabled });
  return (
    <button ref={setNodeRef} type="button" className={cx("zs-palette-card", isDragging && "is-dragging")} disabled={disabled} onClick={onAdd} {...attributes} {...listeners}>
      <span className="zs-palette-icon">{icon ?? label.slice(0, 1)}</span>
      <span className="zs-palette-text">
        <b>{label}</b>
        {description && <small>{description}</small>}
      </span>
    </button>
  );
}

function CanvasBlock({
  id,
  index,
  count,
  locked,
  selected,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  children,
}: {
  id: string;
  index: number;
  count: number;
  locked: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const { t } = useZay();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx("zs-cblock", selected && "is-selected", isDragging && "is-dragging")}
      onClick={onSelect}
    >
      {!locked && (
        <div className="zs-cblock-tools" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="zs-handle" aria-label="Drag" {...attributes} {...listeners}>
            <Grip />
          </button>
          <button type="button" aria-label={t.moveUp} title={t.moveUp} disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUp />
          </button>
          <button type="button" aria-label={t.moveDown} title={t.moveDown} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            <ArrowDown />
          </button>
          <button type="button" aria-label={t.duplicate} title={t.duplicate} onClick={onDuplicate}>
            <Copy />
          </button>
          <button type="button" aria-label={t.remove} title={t.remove} onClick={onRemove}>
            <Trash />
          </button>
        </div>
      )}
      <div className="zs-cblock-body">{children}</div>
    </div>
  );
}

/** Fallback preview for a block type without a site-specific one: its label, first text and images. */
function GenericPreview({ block, label, def }: BlockPreviewProps & { label?: string; def?: Field }) {
  const entries = Object.entries(def?.fields ?? {});
  const texts = entries.filter(([k, f]) => ["string", "text", "markdown"].includes(f.type) && typeof block[k] === "string" && String(block[k]).trim()).map(([k]) => String(block[k]).trim());
  const images = entries.filter(([k, f]) => f.type === "image" && typeof block[k] === "string" && block[k]).map(([k]) => String(block[k]));
  return (
    <div className="zs-generic">
      <span className="zs-block-badge">{label}</span>
      {images.length > 0 && (
        <div className="zs-generic-images">
          {images.slice(0, 3).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview of an external host
            <img key={src} src={src} alt="" />
          ))}
        </div>
      )}
      {texts[0] ? <h3>{texts[0].slice(0, 120)}</h3> : <h3 className="zs-muted">…</h3>}
      {texts.slice(1, 3).map((x) => (
        <p key={x}>{x.slice(0, 180)}</p>
      ))}
    </div>
  );
}

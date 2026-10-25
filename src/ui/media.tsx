"use client";

import * as React from "react";

import type { MediaEntry } from "./api";
import { useZay } from "./context";
import { Copy, Search, Trash, Upload } from "./icons";
import { Loading } from "./parts";
import { cx } from "./util";

const size = (n?: number) => (n == null ? "" : n < 1024 * 100 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * Browse, upload, reuse and delete images. With `onPick` it works as a chooser
 * (click an image to use it); without, it is the standalone library page.
 */
export function MediaLibrary({ onPick }: { onPick?: (url: string) => void }) {
  const { api, session, t, toast } = useZay();
  const media = session.media;
  const [items, setItems] = React.useState<MediaEntry[]>([]);
  const [next, setNext] = React.useState<string | undefined>();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [over, setOver] = React.useState(false);
  const pick = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const page = await api.mediaList(cursor);
        setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
        setNext(page.next);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const upload = async (files: FileList | File[] | null | undefined) => {
    if (!media || !files) return;
    setBusy(true);
    try {
      for (const file of [...files]) {
        if (!media.accept.includes(file.type)) {
          toast("error", `${file.name}: ${t.badType}`);
          continue;
        }
        if (file.size > media.maxBytes) {
          toast("error", `${file.name}: ${t.tooBig}`);
          continue;
        }
        await api.upload(file);
      }
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: MediaEntry) => {
    if (!window.confirm(t.confirmDeleteMedia)) return;
    try {
      await api.mediaDelete(item.key);
      setItems((prev) => prev.filter((x) => x.key !== item.key));
      toast("ok", t.deleted);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
      toast("ok", t.copied);
    } catch {
      toast("error", url);
    }
  };

  const shown = items.filter((i) => !q.trim() || i.key.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div
      className={cx("zs-media", over && "is-over")}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          void upload(e.dataTransfer.files);
        }
      }}
    >
      <div className="zs-toolbar">
        <div className="zs-search">
          <Search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} />
        </div>
        <button type="button" className="zs-btn" disabled={busy} onClick={() => pick.current?.click()}>
          <Upload /> {busy ? t.uploading : t.upload}
        </button>
        <input ref={pick} type="file" hidden multiple accept={media?.accept.join(",")} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
      </div>

      {error && <p className="zs-error zs-pad">{error}</p>}
      {loading && !items.length && <Loading />}
      {!loading && !error && !shown.length && <p className="zs-muted zs-pad">{q ? t.noResults : t.noMedia}</p>}

      <ul className="zs-media-grid">
        {shown.map((item) => (
          <li key={item.key} className="zs-media-card">
            <button type="button" className="zs-media-thumb" onClick={() => (onPick ? onPick(item.url) : void copy(item.url))} title={onPick ? t.useImage : t.copyUrl}>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of an external host */}
              <img src={item.url} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
            </button>
            <div className="zs-media-meta">
              <span title={item.key}>{item.key.split("/").pop()}</span>
              <small>{[size(item.size), item.modified?.slice(0, 10)].filter(Boolean).join(" · ")}</small>
            </div>
            <div className="zs-media-actions">
              {!onPick && (
                <button type="button" aria-label={t.copyUrl} title={t.copyUrl} onClick={() => void copy(item.url)}>
                  <Copy />
                </button>
              )}
              {media?.canDelete && (
                <button type="button" aria-label={t.delete} title={t.delete} onClick={() => void remove(item)}>
                  <Trash />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {next && (
        <button type="button" className="zs-btn zs-media-more" disabled={loading} onClick={() => void load(next)}>
          {loading ? t.loading : t.loadMore}
        </button>
      )}
    </div>
  );
}

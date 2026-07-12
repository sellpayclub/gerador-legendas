"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ClipSegment } from "@/lib/api";
import { getClipPlaybackPlan } from "@/lib/clipPlayback";
import Field from "@/components/ui/Field";
import { inputClass } from "@/components/ui/inputClass";
import { useLanguage } from "@/lib/i18n/context";

type Props = {
  clip: ClipSegment | null;
  onChange: (clip: ClipSegment) => void;
};

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, "0")}`;
}

function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const [m, s] = t.split(":");
    const mins = parseInt(m, 10);
    const secs = parseFloat(s);
    if (Number.isNaN(mins) || Number.isNaN(secs)) return null;
    return mins * 60 + secs;
  }
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

export default function ClipBoundsEditor({ clip, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    setOpen(false);
  }, [clip?.id]);

  if (!clip) return null;

  const bodySeg = clip.segments?.find((s) => s.role === "body");
  const isColdOpen = clip.edit_mode === "hook_then_body" && bodySeg;

  const setField = (field: "start_s" | "end_s", raw: string) => {
    const val = parseTime(raw);
    if (val === null || val < 0) return;
    if (isColdOpen && bodySeg) {
      const nextBody = {
        ...bodySeg,
        [field]: Math.round(val * 10) / 10,
      };
      nextBody.duration_s = Math.max(0, nextBody.end_s - nextBody.start_s);
      const hookSeg = clip.segments?.find((s) => s.role === "hook");
      const hookDur = hookSeg ? hookSeg.end_s - hookSeg.start_s : 0;
      const nextSegments = (clip.segments ?? []).map((s) =>
        s.role === "body" ? nextBody : s,
      );
      onChange({
        ...clip,
        segments: nextSegments,
        start_word_idx: nextBody.start_word_idx,
        end_word_idx: nextBody.end_word_idx,
        duration_s: Math.round((hookDur + nextBody.duration_s) * 1000) / 1000,
      });
      return;
    }
    const next = { ...clip, [field]: Math.round(val * 10) / 10 };
    next.duration_s = Math.max(0, next.end_s - next.start_s);
    onChange(next);
  };

  const displayStart = isColdOpen && bodySeg ? bodySeg.start_s : clip.start_s;
  const displayEnd = isColdOpen && bodySeg ? bodySeg.end_s : clip.end_s;

  const setTitle = (title: string) => onChange({ ...clip, title });

  return (
    <div className="mx-4 mb-4 mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-border/80 bg-panel/60 px-3 py-2.5 text-left transition hover:border-border hover:bg-panel"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-zinc-500 transition ${open ? "rotate-90" : ""}`}
        />
        <span className="shrink-0 text-xs font-medium text-zinc-300">{t("cortes.clipList.adjustClip")}</span>
        {!open && (
          <span className="min-w-0 truncate text-xs text-zinc-500">
            {clip.title} · {fmtTime(clip.duration_s)}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-border/80 bg-panel/40 p-3">
          <Field label="Título">
            <input
              type="text"
              value={clip.title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início (m:ss)">
              <input
                type="text"
                defaultValue={fmtTime(displayStart)}
                key={`start-${clip.id}-${displayStart}`}
                onBlur={(e) => setField("start_s", e.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            <Field label="Fim (m:ss)">
              <input
                type="text"
                defaultValue={fmtTime(displayEnd)}
                key={`end-${clip.id}-${displayEnd}`}
                onBlur={(e) => setField("end_s", e.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
          </div>
          {isColdOpen && (
            <p className="text-xs text-accent/80">
              Gancho imediato + corpo (
              {getClipPlaybackPlan(clip).map((s) => `${s.role} ${s.start_s.toFixed(0)}s`).join(" → ")}
              )
            </p>
          )}
          <p className="text-xs text-muted">
            Duração exportada:{" "}
            <span className="font-medium text-zinc-300">{fmtTime(clip.duration_s)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

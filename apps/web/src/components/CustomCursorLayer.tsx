import { useEffect, useMemo, useRef, useState } from "react";
import type { GameSettings } from "../config/uiConfig.js";
import { resolveAssetUrl } from "../lib/hotUpdate.js";

type CursorState = "default" | "pointer" | "text" | "not-allowed" | "dragging";
type CursorFrame = {
  src: string;
  width: number;
  height: number;
  hotspot: [number, number];
  durationMs?: number;
};
type CursorEntry = CursorFrame | { frames: CursorFrame[] };
type CursorManifest = {
  baseSize: number;
  themes: Record<GameSettings["cursorTheme"], Record<CursorState, CursorEntry>>;
};

function cursorStateForTarget(target: Element | null): CursorState {
  if (document.documentElement.classList.contains("card-pointer-dragging")) return "dragging";
  if (!target) return "default";
  if (target.closest(":disabled, [aria-disabled='true'], [data-cursor='not-allowed']")) {
    return "not-allowed";
  }
  if (
    target.closest(
      "textarea, [contenteditable='true'], input:not([type]), input[type='text'], input[type='email'], input[type='password'], input[type='search'], input[type='tel'], input[type='url'], input[type='number']"
    )
  ) {
    return "text";
  }
  if (
    target.closest(
      "button, a, select, label, summary, [role='button'], [role='tab'], [data-cursor='pointer'], input[type='checkbox'], input[type='radio'], input[type='range'], input[type='button'], input[type='submit']"
    )
  ) {
    return "pointer";
  }
  return "default";
}

function framesFor(entry: CursorEntry | undefined): CursorFrame[] {
  if (!entry) return [];
  return "frames" in entry ? entry.frames : [entry];
}

function framesForState(
  manifest: CursorManifest | undefined,
  theme: GameSettings["cursorTheme"],
  state: CursorState
): CursorFrame[] {
  const themeEntries = manifest?.themes[theme];
  return framesFor(themeEntries?.[state])
    .concat(state === "dragging" ? framesFor(themeEntries?.pointer) : [])
    .concat(state !== "default" ? framesFor(themeEntries?.default) : []);
}

export function CustomCursorLayer({
  enabled,
  theme,
  size,
  trail,
  reducedMotion,
}: {
  enabled: boolean;
  theme: GameSettings["cursorTheme"];
  size: number;
  trail: GameSettings["cursorTrail"];
  reducedMotion: boolean;
}) {
  const [manifest, setManifest] = useState<CursorManifest>();
  const [cursorState, setCursorState] = useState<CursorState>("default");
  const [frameIndex, setFrameIndex] = useState(0);
  const layerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, visible: false, lastTrailX: 0, lastTrailY: 0, lastTrailAt: 0 });
  const active = enabled && Boolean(manifest);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${resolveAssetUrl("assets/ui/cursors/cursor-manifest.json")}?v=1510`)
      .then((response) => {
        if (!response.ok) throw new Error(`Cursor manifest ${response.status}`);
        return response.json() as Promise<CursorManifest>;
      })
      .then((value) => {
        if (!cancelled) setManifest(value);
      })
      .catch(() => {
        if (!cancelled) setManifest(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("custom-cursor-active", active);
    document.body.classList.toggle("custom-cursor-active", active);
    return () => {
      document.documentElement.classList.remove("custom-cursor-active");
      document.body.classList.remove("custom-cursor-active");
    };
  }, [active]);

  const frames = useMemo(
    () => framesForState(manifest, theme, cursorState),
    [cursorState, manifest, theme]
  );
  const frame = frames[Math.min(frameIndex, Math.max(0, frames.length - 1))];
  const renderSize = (manifest?.baseSize ?? 64) * size;

  useEffect(() => {
    setFrameIndex(0);
  }, [cursorState, theme]);

  useEffect(() => {
    if (reducedMotion || frames.length < 2) return;
    const current = frames[frameIndex % frames.length];
    const timer = window.setTimeout(
      () => setFrameIndex((value) => (value + 1) % frames.length),
      current?.durationMs ?? 100
    );
    return () => window.clearTimeout(timer);
  }, [frameIndex, frames, reducedMotion]);

  useEffect(() => {
    if (!active) return;
    let animationFrame = 0;
    const positionCursor = () => {
      animationFrame = 0;
      const image = imageRef.current;
      const layer = layerRef.current;
      if (!image || !layer || !frame) return;
      const pointer = pointerRef.current;
      const scaleX = renderSize / frame.width;
      const scaleY = renderSize / frame.height;
      image.style.transform = `translate3d(${pointer.x - frame.hotspot[0] * scaleX}px, ${pointer.y - frame.hotspot[1] * scaleY}px, 0)`;
      layer.classList.toggle("is-visible", pointer.visible);
    };
    const requestPosition = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(positionCursor);
    };
    const addTrail = (x: number, y: number, now: number) => {
      if (reducedMotion || trail === "off" || !trailRef.current) return;
      const pointer = pointerRef.current;
      const distance = Math.hypot(x - pointer.lastTrailX, y - pointer.lastTrailY);
      if (distance < 12 && now - pointer.lastTrailAt < 34) return;
      pointer.lastTrailX = x;
      pointer.lastTrailY = y;
      pointer.lastTrailAt = now;
      const particle = document.createElement("span");
      particle.className = `custom-cursor-trail-particle trail-${trail}`;
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty("--trail-spin", `${Math.round(Math.random() * 160 - 80)}deg`);
      particle.style.setProperty("--trail-drift", `${Math.round(Math.random() * 18 - 9)}px`);
      if (trail === "sakura") {
        particle.style.backgroundImage = `url("${resolveAssetUrl("assets/ui/vfx/cursor/sakura.png")}")`;
      } else {
        particle.style.backgroundImage = `url("${resolveAssetUrl("assets/ui/vfx/cursor/particle.png")}")`;
      }
      trailRef.current.appendChild(particle);
      while (trailRef.current.childElementCount > 24) {
        trailRef.current.firstElementChild?.remove();
      }
      particle.addEventListener("animationend", () => particle.remove(), { once: true });
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const pointer = pointerRef.current;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.visible = true;
      setCursorState(cursorStateForTarget(document.elementFromPoint(event.clientX, event.clientY)));
      addTrail(event.clientX, event.clientY, performance.now());
      requestPosition();
    };
    const hide = () => {
      pointerRef.current.visible = false;
      requestPosition();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true, capture: true });
    window.addEventListener("blur", hide);
    document.documentElement.addEventListener("mouseleave", hide);
    requestPosition();
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("blur", hide);
      document.documentElement.removeEventListener("mouseleave", hide);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [active, frame, reducedMotion, renderSize, trail]);

  if (!enabled) return null;
  return (
    <div ref={layerRef} className="custom-cursor-layer" aria-hidden="true">
      <div ref={trailRef} className="custom-cursor-trail-layer" />
      {frame && (
        <img
          ref={imageRef}
          className="custom-cursor-image"
          src={resolveAssetUrl(frame.src)}
          width={renderSize}
          height={renderSize}
          alt=""
          draggable={false}
        />
      )}
    </div>
  );
}

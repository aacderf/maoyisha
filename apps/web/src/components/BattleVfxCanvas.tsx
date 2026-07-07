import { useEffect, useRef, useState } from "react";
import {
  AnimatedSprite,
  Assets,
  CanvasRenderer,
  Container,
  Spritesheet,
  Text,
  TextStyle,
  Ticker,
} from "pixi.js";
import type { BattleEffect, BattleEffectVariant } from "../lib/battleEffects.js";
import type { GameSettings } from "../config/uiConfig.js";
import { resolveAssetUrl } from "../lib/hotUpdate.js";

type SeatPointMap = Record<string, [number, number]>;

type VfxManifestEntry = {
  atlas: string;
  animation: string;
  scale: number;
  tint?: string;
  source: string;
  author: string;
  license: "CC0-1.0";
};

type VfxManifest = {
  version: number;
  frameSize: number;
  frameCount: number;
  fps: number;
  defaultStyle?: GameSettings["battleVfxStyle"];
  variants?: Record<BattleEffectVariant, VfxManifestEntry>;
  styles?: Record<GameSettings["battleVfxStyle"], {
    variants: Record<BattleEffectVariant, VfxManifestEntry>;
  }>;
};

type LoadedVfx = {
  entry: VfxManifestEntry;
  manifest: VfxManifest;
  textures: AnimatedSprite["textures"];
};

type Actor = {
  node: Container;
  elapsed: number;
  duration: number;
  update: (progress: number) => void;
};

type VfxRuntime = {
  renderer: CanvasRenderer;
  stage: Container;
  ticker: Ticker;
  resizeObserver: ResizeObserver;
};

const manifestPromise = fetch(`${resolveAssetUrl("assets/ui/vfx/vfx-manifest.json")}?v=1510`)
  .then((response) => {
    if (!response.ok) throw new Error(`VFX manifest ${response.status}`);
    return response.json() as Promise<VfxManifest>;
  });
const assetCache = new Map<string, Promise<LoadedVfx>>();

function manifestEntry(
  manifest: VfxManifest,
  vfxStyle: GameSettings["battleVfxStyle"],
  variant: BattleEffectVariant
): VfxManifestEntry | undefined {
  return manifest.styles?.[vfxStyle]?.variants[variant]
    ?? manifest.styles?.[manifest.defaultStyle ?? "guofeng"]?.variants[variant]
    ?? manifest.styles?.anime?.variants[variant]
    ?? manifest.variants?.[variant];
}

function loadVfx(variant: BattleEffectVariant, vfxStyle: GameSettings["battleVfxStyle"]): Promise<LoadedVfx> {
  const cacheKey = `${vfxStyle}:${variant}`;
  const existing = assetCache.get(cacheKey);
  if (existing) return existing;
  const loading = manifestPromise.then(async (manifest) => {
    const entry = manifestEntry(manifest, vfxStyle, variant);
    if (!entry) throw new Error(`Missing VFX variant: ${variant}`);
    const sheet = await Assets.load<Spritesheet>(resolveAssetUrl(entry.atlas));
    const textures = sheet.animations[entry.animation];
    if (!textures?.length) throw new Error(`Missing VFX animation: ${entry.animation}`);
    return { entry, manifest, textures };
  });
  assetCache.set(cacheKey, loading);
  return loading;
}

function effectLabel(effect: BattleEffect): string {
  if (effect.type === "damage") return effect.label ?? `-${effect.amount}`;
  if (effect.type === "heal") return `+${effect.amount}`;
  if (effect.type === "skill") return effect.skillName;
  if (effect.type === "defeat") return "破";
  if (effect.type === "status") return "毒";
  if (effect.type === "phase") return effect.label;
  return "";
}

function labelColor(effect: BattleEffect): string {
  if (effect.type === "heal") return "#a9ffc4";
  if (effect.type === "status") return "#a9ff8a";
  if (effect.type === "defeat") return "#ffae86";
  if (effect.type === "phase") return "#ffe2a0";
  if (effect.variant === "thunder") return "#bcecff";
  if (effect.variant === "fire") return "#ffd087";
  if (effect.variant === "poison") return "#a9ff8a";
  return "#fff0bf";
}

function makeActor(
  x: number,
  y: number,
  effect: BattleEffect,
  loaded: LoadedVfx | undefined,
  intensity: GameSettings["effectIntensity"],
  reducedMotion: boolean
): Actor | undefined {
  const label = effectLabel(effect);
  if (!loaded && !label) return undefined;
  const root = new Container();
  root.position.set(x, y);
  let sprite: AnimatedSprite | undefined;
  if (loaded) {
    sprite = new AnimatedSprite({ textures: loaded.textures, autoUpdate: false });
    sprite.anchor.set(0.5);
    const intensityScale = intensity === "high" ? 1.3 : intensity === "low" ? 0.88 : 1.1;
    const typeScale = effect.type === "skill" ? 1.12 : effect.type === "damage" || effect.type === "heal" ? 1.06 : 1;
    sprite.scale.set(loaded.entry.scale * intensityScale * typeScale);
    if (loaded.entry.tint) sprite.tint = loaded.entry.tint;
    sprite.loop = false;
    sprite.gotoAndStop(reducedMotion ? Math.min(8, loaded.textures.length - 1) : 0);
    root.addChild(sprite);
  }

  let text: Text | undefined;
  if (label) {
    const baseY = effect.type === "phase" ? 78 : effect.type === "skill" ? 62 : -10;
    text = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: effect.type === "phase" ? '"KaiTi", "Microsoft YaHei", serif' : '"Microsoft YaHei", sans-serif',
        fontSize: effect.type === "phase" ? 30 : effect.type === "defeat" ? 42 : effect.type === "skill" ? 27 : 31,
        fontWeight: "900",
        fill: labelColor(effect),
        letterSpacing: effect.type === "phase" ? 4 : 0,
        stroke: { color: 0x28150a, width: 5 },
        dropShadow: { color: 0x000000, alpha: 0.78, blur: 5, distance: 4 },
      }),
    });
    text.anchor.set(0.5);
    text.position.set(0, baseY);
    root.addChild(text);
  }

  const duration = reducedMotion ? 280 : loaded ? (loaded.manifest.frameCount / loaded.manifest.fps) * 1000 : 620;
  return {
    node: root,
    elapsed: 0,
    duration,
    update(progress) {
      if (sprite) {
        const frameIndex = reducedMotion
          ? Math.min(8, sprite.totalFrames - 1)
          : Math.min(sprite.totalFrames - 1, Math.floor(progress * sprite.totalFrames));
        sprite.gotoAndStop(frameIndex);
      }
      if (text) {
        const baseY = effect.type === "phase" ? 78 : effect.type === "skill" ? 62 : -10;
        text.y = baseY - Math.sin(Math.min(1, progress) * Math.PI) * 28;
        text.alpha = progress < 0.12 ? progress / 0.12 : progress > 0.74 ? (1 - progress) / 0.26 : 1;
      }
      root.alpha = progress > 0.9 ? (1 - progress) / 0.1 : 1;
    },
  };
}

function pushActor(runtime: VfxRuntime, actors: Actor[], actor: Actor): void {
  while (actors.length >= 4) {
    const oldest = actors.shift();
    oldest?.node.removeFromParent();
    oldest?.node.destroy({ children: true });
  }
  runtime.stage.addChild(actor.node);
  actors.push(actor);
  runtime.ticker.start();
}

export function BattleVfxCanvas({
  effects,
  seatPoints,
  intensity,
  vfxStyle,
  reducedMotion,
  clickEffectsEnabled,
}: {
  effects: BattleEffect[];
  seatPoints: SeatPointMap;
  intensity: GameSettings["effectIntensity"];
  vfxStyle: GameSettings["battleVfxStyle"];
  reducedMotion: boolean;
  clickEffectsEnabled: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<VfxRuntime | null>(null);
  const actorsRef = useRef<Actor[]>([]);
  const seenEffectIdsRef = useRef(new Set<string>());
  const [runtimeEpoch, setRuntimeEpoch] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || intensity === "off") return;
    let disposed = false;
    const renderer = new CanvasRenderer();
    const stage = new Container();
    const ticker = new Ticker();
    const resolution = Math.min(window.devicePixelRatio || 1, 2);

    void renderer.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution,
    }).then(() => {
      if (disposed) {
        ticker.destroy();
        stage.destroy({ children: true });
        renderer.destroy({ removeView: true });
        return;
      }
      renderer.canvas.className = "battle-vfx-canvas";
      host.appendChild(renderer.canvas);
      const resizeObserver = new ResizeObserver(() => {
        renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), resolution);
      });
      resizeObserver.observe(host);
      runtimeRef.current = { renderer, stage, ticker, resizeObserver };
      setRuntimeEpoch((value) => value + 1);
      ticker.add((frame) => {
        const actors = actorsRef.current;
        for (let index = actors.length - 1; index >= 0; index -= 1) {
          const actor = actors[index]!;
          actor.elapsed += frame.deltaMS;
          const progress = Math.min(1, actor.elapsed / actor.duration);
          actor.update(progress);
          if (progress >= 1) {
            actor.node.removeFromParent();
            actor.node.destroy({ children: true });
            actors.splice(index, 1);
          }
        }
        renderer.render(stage);
        if (actors.length === 0) ticker.stop();
      });
    }).catch(() => undefined);

    return () => {
      disposed = true;
      actorsRef.current.splice(0).forEach((actor) => actor.node.destroy({ children: true }));
      const runtime = runtimeRef.current;
      if (runtime?.renderer !== renderer) return;
      runtimeRef.current = null;
      runtime.resizeObserver.disconnect();
      runtime.ticker.stop();
      runtime.ticker.destroy();
      runtime.stage.destroy({ children: true });
      runtime.renderer.destroy({ removeView: true });
    };
  }, [intensity]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || intensity === "off") return;
    let cancelled = false;
    for (const effect of effects) {
      if (seenEffectIdsRef.current.has(effect.id)) continue;
      seenEffectIdsRef.current.add(effect.id);
      const [xPercent, yPercent] =
        effect.type === "phase"
          ? [50, 36]
          : effect.type === "card"
            ? [50, 47]
            : seatPoints[effect.seatId] ?? [50, 50];
      const x = (runtime.renderer.screen.width * xPercent) / 100;
      const y = (runtime.renderer.screen.height * yPercent) / 100;
      void loadVfx(effect.variant, vfxStyle)
        .catch(() => undefined)
        .then((loaded) => {
          if (cancelled || runtimeRef.current !== runtime) return;
          const actor = makeActor(x, y, effect, loaded, intensity, reducedMotion);
          if (actor) pushActor(runtime, actorsRef.current, actor);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [effects, intensity, reducedMotion, runtimeEpoch, seatPoints, vfxStyle]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !clickEffectsEnabled || intensity === "off") return;
    let cancelled = false;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const runtime = runtimeRef.current;
      if (!runtime) return;
      const bounds = host.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) return;
      void loadVfx("negate", vfxStyle)
        .catch(() => undefined)
        .then((loaded) => {
          if (cancelled || !loaded || runtimeRef.current !== runtime) return;
          const clickEffect: BattleEffect = {
            id: `click:${performance.now()}`,
            type: "card",
            seatId: "",
            cardKey: "",
            cardName: "",
            motion: reducedMotion ? "reduced" : "standard",
            variant: "negate",
          };
          const actor = makeActor(
            event.clientX - bounds.left,
            event.clientY - bounds.top,
            clickEffect,
            { ...loaded, entry: { ...loaded.entry, scale: loaded.entry.scale * 0.38 } },
            "low",
            reducedMotion
          );
          if (actor) pushActor(runtime, actorsRef.current, actor);
        });
    };
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [clickEffectsEnabled, intensity, reducedMotion, vfxStyle]);

  return <div ref={hostRef} className="battle-vfx-host" aria-hidden="true" />;
}

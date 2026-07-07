import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameState } from "@cardgame/shared";
import type { GameSettings } from "../config/uiConfig.js";
import { battleEffectVariantForCard, type BattleEffectVariant } from "../lib/battleEffects.js";

type SeatPointMap = Record<string, [number, number]>;
type CardOriginMap = Record<string, [number, number]>;

type FlightActor = {
  id: string;
  cardId?: string;
  cardKey: string;
  cardName: string;
  variant: BattleEffectVariant;
  from: [number, number];
  to: [number, number];
  pings: [number, number][];
  angle: number;
  reduced: boolean;
};

type FlightStyle = CSSProperties & Record<"--from-x" | "--from-y" | "--to-x" | "--to-y" | "--flight-angle", string>;
type PingStyle = CSSProperties & Record<"--ping-x" | "--ping-y", string>;

function pointStyle(from: [number, number], to: [number, number], angle: number): FlightStyle {
  return {
    "--from-x": `${from[0]}%`,
    "--from-y": `${from[1]}%`,
    "--to-x": `${to[0]}%`,
    "--to-y": `${to[1]}%`,
    "--flight-angle": `${angle}deg`,
  };
}

function pingStyle(point: [number, number]): PingStyle {
  return {
    "--ping-x": `${point[0]}%`,
    "--ping-y": `${point[1]}%`,
  };
}

function clampPoint(point: [number, number]): [number, number] {
  return [
    Math.min(96, Math.max(4, point[0])),
    Math.min(96, Math.max(4, point[1])),
  ];
}

function cardLabel(voice: GameState["lastCardVoice"]): string {
  if (!voice) return "";
  return voice.cardName ?? String(voice.cardKey);
}

function shortCardGlyph(cardKey: string): string {
  if (cardKey.includes("sha")) return "杀";
  if (cardKey === "shan") return "闪";
  if (cardKey === "tao") return "桃";
  if (cardKey === "wuxie") return "懈";
  return "策";
}

export function CardFlightLayer({
  lastCardVoice,
  seatPoints,
  cardOrigins,
  localSeatId,
  intensity,
  vfxStyle,
  reducedMotion,
}: {
  lastCardVoice: GameState["lastCardVoice"];
  seatPoints: SeatPointMap;
  cardOrigins?: CardOriginMap;
  localSeatId?: string;
  intensity: GameSettings["effectIntensity"];
  vfxStyle: GameSettings["battleVfxStyle"];
  reducedMotion: boolean;
}) {
  const [flights, setFlights] = useState<FlightActor[]>([]);
  const seenSeqRef = useRef(0);
  const timeoutRefs = useRef<number[]>([]);

  useEffect(() => () => {
    timeoutRefs.current.forEach((timeout) => window.clearTimeout(timeout));
    timeoutRefs.current = [];
  }, []);

  useEffect(() => {
    if (!lastCardVoice || intensity === "off") return;
    if (lastCardVoice.seq < seenSeqRef.current) seenSeqRef.current = 0;
    if (lastCardVoice.seq <= seenSeqRef.current) return;
    seenSeqRef.current = lastCardVoice.seq;

    const sourcePoint = lastCardVoice.seatId === localSeatId
      ? (lastCardVoice.cardId ? cardOrigins?.[lastCardVoice.cardId] : undefined) ?? ([50, 92] as [number, number])
      : seatPoints[lastCardVoice.seatId] ?? [50, 82];
    const targetSeatIds = [
      ...(lastCardVoice.targetSeatIds ?? []),
      ...(lastCardVoice.targetSeatId ? [lastCardVoice.targetSeatId] : []),
    ].filter((seatId, index, all) => seatId && all.indexOf(seatId) === index);
    const targetPoints = targetSeatIds
      .map((seatId) => seatPoints[seatId])
      .filter(Boolean) as [number, number][];
    const to = targetPoints[0] ?? [50, 48];
    const from = clampPoint(sourcePoint);
    const target = clampPoint(to);
    const angle = Math.atan2(target[1] - from[1], target[0] - from[0]) * 180 / Math.PI;
    const actor: FlightActor = {
      id: `flight:${lastCardVoice.seq}:${lastCardVoice.cardKey}`,
      cardId: lastCardVoice.cardId,
      cardKey: String(lastCardVoice.cardKey),
      cardName: cardLabel(lastCardVoice),
      variant: battleEffectVariantForCard(String(lastCardVoice.cardKey)),
      from,
      to: target,
      pings: (targetPoints.length > 0 ? targetPoints : [target]).map(clampPoint),
      angle,
      reduced: reducedMotion,
    };

    setFlights((current) => [...current.slice(-2), actor]);
    const timeout = window.setTimeout(
      () => setFlights((current) => current.filter((item) => item.id !== actor.id)),
      reducedMotion ? 360 : intensity === "high" ? 980 : intensity === "low" ? 620 : 780
    );
    timeoutRefs.current.push(timeout);
  }, [cardOrigins, intensity, lastCardVoice, localSeatId, reducedMotion, seatPoints]);

  const layerClassName = useMemo(
    () => `card-flight-layer vfx-style-${vfxStyle} vfx-intensity-${intensity}`,
    [intensity, vfxStyle]
  );

  if (intensity === "off" || flights.length === 0) return null;

  return (
    <div className={layerClassName} aria-hidden="true">
      {flights.map((flight) => (
        <div
          key={flight.id}
          className={`card-flight-actor vfx-${flight.variant} ${flight.reduced ? "reduced" : ""}`}
          style={pointStyle(flight.from, flight.to, flight.angle)}
        >
          <span className="flight-trail" />
          <span className="flight-ink" />
          <span className="flight-card-shell">
            <i>{shortCardGlyph(flight.cardKey)}</i>
            <strong>{flight.cardName}</strong>
          </span>
          <span className="flight-cut" />
          {flight.pings.map((point, index) => (
            <span key={`${flight.id}:ping:${index}`} className="flight-target-ping" style={pingStyle(point)} />
          ))}
        </div>
      ))}
    </div>
  );
}

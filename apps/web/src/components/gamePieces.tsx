import type { DragEvent, PointerEvent } from "react";
import type { CharacterDefinition, GameCard, GameState } from "@cardgame/shared";
import { resolveAssetUrl } from "../lib/hotUpdate.js";

const CARD_ART_KEYS: Record<string, string> = {
  sha: "sha",
  fire_sha: "sha",
  thunder_sha: "sha",
  shan: "shan",
  tao: "tao",
  jiu: "jiu",
  wuzhong: "wuzhong",
  guohe: "guohe",
  shunshou: "shunshou",
  juedou: "juedou",
  nanman: "nanman",
  wanjian: "wanjian",
  taoyuan: "taoyuan",
  wugu: "taoyuan",
  wuxie: "wuxie",
  huogong: "juedou",
  jiedao: "shunshou",
  tiesuo: "guohe",
  lebu: "wuxie",
  bingliang: "wuxie",
  shandian: "wanjian",
  weapon: "sha",
  armor: "shan",
  attack_horse: "shunshou",
  defense_horse: "tao",
};

const CARD_STYLE_LABELS: Record<GameCard["suit"], string> = {
  spade: "黑桃",
  heart: "红桃",
  club: "梅花",
  diamond: "方片",
};

function getCardArtworkUrl(card: GameCard): string | undefined {
  if (card.category === "equip" && card.equipmentKey) {
    return resolveAssetUrl(`assets/ui/cards/equipment/${card.equipmentKey}.jpg`);
  }
  const artworkKey = CARD_ART_KEYS[card.cardKey];
  return artworkKey ? resolveAssetUrl(`assets/ui/cards/${artworkKey}.jpg`) : undefined;
}

export function HealthBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const percent = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const state = hp <= 0 ? "defeated" : hp <= 1 ? "low" : "normal";
  const visiblePips = Math.min(Math.max(maxHp, 1), 6);

  return (
    <div className={`health ${state}`} aria-label={`体力 ${Math.max(0, hp)}/${maxHp}`}>
      <div className="health-track"><span style={{ width: `${percent}%` }} /></div>
      <div className="health-pips">
        {Array.from({ length: visiblePips }, (_, index) => (
          <span
            className={`hp-icon ${state === "defeated" ? "defeated" : index < hp ? (state === "low" ? "low" : "full") : "empty"}`}
            key={index}
          />
        ))}
        <b>{Math.max(0, hp)}/{maxHp}</b>
      </div>
    </div>
  );
}

export function CardView({
  card,
  canPlay,
  canRespond,
  canDiscard,
  draggable = false,
  isDragging = false,
  selected = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSelect,
  onPlay,
  onRespond,
  onDiscard,
}: {
  card: GameCard;
  canPlay: boolean;
  canRespond: boolean;
  canDiscard: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  selected?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLElement>) => void;
  onSelect?: () => void;
  onPlay: () => void;
  onRespond: () => void;
  onDiscard: () => void;
}) {
  const hasAction = canPlay || canRespond || canDiscard;
  const showActions = selected && hasAction;
  const artworkUrl = getCardArtworkUrl(card);
  const suitClass = card.suit === "heart" || card.suit === "diamond" ? "red-suit" : "black-suit";

  return (
    <article
      className={`play-card paper-card ${card.category} ${card.cardKey} ${suitClass} ${artworkUrl ? "has-card-art" : ""} ${hasAction ? "actionable" : "unavailable"} ${canRespond ? "response-ready" : ""} ${isDragging ? "dragging" : ""} ${selected ? "selected" : ""} ${showActions ? "actions-open" : ""}`}
      data-card-id={card.id}
      data-card-key={card.cardKey}
      draggable={draggable}
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className="card-corner">
        <b>{card.rank || "?"}</b>
        <i aria-label={CARD_STYLE_LABELS[card.suit]}>{suitText(card.suit)}</i>
      </span>
      <div className="card-art-frame">
        {artworkUrl ? (
          <img aria-hidden="true" className="card-artwork" draggable={false} src={artworkUrl} alt="" />
        ) : (
          <span className="card-art-placeholder">{card.name.slice(0, 1)}</span>
        )}
      </div>
      <div className="card-nameplate">
        <strong>{card.name}</strong>
        <span>{cardTypeText(card)}</span>
      </div>
      {showActions && (
        <div className="card-actions">
          <button disabled={!canPlay} onClick={(event) => { event.stopPropagation(); onPlay(); }}>出牌</button>
          <button disabled={!canRespond} onClick={(event) => { event.stopPropagation(); onRespond(); }}>响应</button>
          <button disabled={!canDiscard} onClick={(event) => { event.stopPropagation(); onDiscard(); }}>弃牌</button>
        </div>
      )}
    </article>
  );
}

export function phaseText(phase: GameState["phase"]): string {
  const labels: Record<GameState["phase"], string> = {
    opening: "开局选择",
    prepare: "准备阶段",
    judge: "判定阶段",
    draw: "摸牌阶段",
    play: "出牌阶段",
    discard: "弃牌阶段",
    finish: "结束阶段",
    response: "响应阶段",
    dying: "濒死求桃",
    finished: "已结束",
  };
  return labels[phase];
}

export function responseText(type: NonNullable<GameState["pendingResponse"]>["responseType"]): string {
  return { sha: "杀", shan: "闪", tao: "桃", wuxie: "无懈可击" }[type];
}

export function factionText(faction: CharacterDefinition["faction"]): string {
  return {
    shu: "学生",
    wei: "教师",
    wu: "领导",
    qun: "宿管",
    custom: "自定义",
  }[faction];
}

function cardTypeText(card: GameCard): string {
  if (card.cardKey === "shan" || card.cardKey === "wuxie") return "响应";
  if (card.category === "equip") return card.range ? `装备 · 距离 ${card.range}` : "装备";
  if (card.delayedTrickType) return "延时锦囊";
  return card.category === "basic" ? "基本" : "锦囊";
}

function suitText(suit: GameCard["suit"]): string {
  return { spade: "♠", heart: "♥", club: "♣", diamond: "♦" }[suit];
}

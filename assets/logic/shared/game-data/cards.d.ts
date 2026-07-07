import type { CardKey, EquipmentKey, GameCard } from "../types.js";
export declare const ALL_CARD_KEYS: CardKey[];
export declare const EQUIPMENT_VARIANTS: Partial<Record<CardKey, Array<{
    name: string;
    equipmentKey: EquipmentKey;
    range?: number;
}>>>;
export declare function cardDef(key: CardKey): Omit<GameCard, "id" | "suit" | "rank">;
export declare function createStarterDeck(): GameCard[];

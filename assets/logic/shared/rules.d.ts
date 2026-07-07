import type { CharacterDefinition, GameAction, GameActionResult, GameCard, GameMode, GameState, GameTimerSettings, SeatState } from "./types.js";
export interface CreateGameInput {
    roomId: string;
    players: Array<{
        playerId: string;
        playerName: string;
        characterId?: string;
    }>;
    characters?: CharacterDefinition[];
    gameMode?: GameMode;
    seed?: string;
    timerSettings?: Partial<GameTimerSettings>;
}
export declare function createGame(input: CreateGameInput): GameState;
export declare function applyGameAction(state: GameState, action: GameAction): GameActionResult;
export declare function getCurrentSeat(state: GameState): SeatState;
export declare function getHandLimit(seat: SeatState): number;
export declare function getGameCardCatalog(): GameCard[];

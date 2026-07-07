import type { CharacterDefinition, SkillTemplate } from "./types.js";
export declare const SKILL_TEMPLATES: SkillTemplate[];
export declare const BUILT_IN_CHARACTERS: CharacterDefinition[];
export declare function getApprovedCharacters(customCharacters?: CharacterDefinition[]): CharacterDefinition[];
export declare function normalizeCharacterDraft(input: Partial<CharacterDefinition> & Pick<CharacterDefinition, "name" | "ownerId">): CharacterDefinition;

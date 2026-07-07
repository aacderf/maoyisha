export const ALL_CARD_KEYS = [
    "sha",
    "fire_sha",
    "thunder_sha",
    "shan",
    "tao",
    "jiu",
    "wuzhong",
    "guohe",
    "shunshou",
    "juedou",
    "jiedao",
    "nanman",
    "wanjian",
    "taoyuan",
    "wugu",
    "wuxie",
    "lebu",
    "shandian",
    "huogong",
    "tiesuo",
    "bingliang",
    "weapon",
    "armor",
    "attack_horse",
    "defense_horse",
];
export const EQUIPMENT_VARIANTS = {
    weapon: [
        { name: "诸葛连弩", equipmentKey: "zhuge", range: 1 },
        { name: "青釭剑", equipmentKey: "qinggang", range: 2 },
        { name: "寒冰剑", equipmentKey: "hanbing", range: 2 },
        { name: "古锭刀", equipmentKey: "guding", range: 2 },
        { name: "朱雀羽扇", equipmentKey: "zhuque", range: 4 },
        { name: "雌雄双股剑", equipmentKey: "cixiong", range: 2 },
        { name: "青龙偃月刀", equipmentKey: "qinglong", range: 3 },
        { name: "丈八蛇矛", equipmentKey: "zhangba", range: 3 },
        { name: "贯石斧", equipmentKey: "guanshi", range: 3 },
        { name: "方天画戟", equipmentKey: "fangtian", range: 4 },
        { name: "麒麟弓", equipmentKey: "qilin", range: 5 },
    ],
    armor: [
        { name: "八卦阵", equipmentKey: "bagua" },
        { name: "仁王盾", equipmentKey: "renwang" },
        { name: "藤甲", equipmentKey: "tengjia" },
        { name: "白银狮子", equipmentKey: "baiyin" },
    ],
    attack_horse: [
        { name: "赤兔", equipmentKey: "chitu" },
        { name: "大宛", equipmentKey: "dayuan" },
        { name: "紫骍", equipmentKey: "zixing" },
    ],
    defense_horse: [
        { name: "的卢", equipmentKey: "dilu" },
        { name: "绝影", equipmentKey: "jueying" },
        { name: "爪黄飞电", equipmentKey: "zhuahuang" },
    ],
};
export function cardDef(key) {
    const defs = {
        sha: {
            name: "杀",
            type: "sha",
            cardKey: "sha",
            category: "basic",
            requiresTarget: true,
            responseType: "sha",
            damage: 1,
            damageNature: "normal",
        },
        fire_sha: {
            name: "火杀",
            type: "fire_sha",
            cardKey: "fire_sha",
            category: "basic",
            requiresTarget: true,
            responseType: "sha",
            damage: 1,
            damageNature: "fire",
        },
        thunder_sha: {
            name: "雷杀",
            type: "thunder_sha",
            cardKey: "thunder_sha",
            category: "basic",
            requiresTarget: true,
            responseType: "sha",
            damage: 1,
            damageNature: "thunder",
        },
        shan: { name: "闪", type: "shan", cardKey: "shan", category: "basic", responseType: "shan" },
        tao: { name: "桃", type: "tao", cardKey: "tao", category: "basic", responseType: "tao" },
        jiu: { name: "酒", type: "jiu", cardKey: "jiu", category: "basic" },
        wuzhong: { name: "无中生有", type: "wuzhong", cardKey: "wuzhong", category: "trick" },
        guohe: { name: "过河拆桥", type: "guohe", cardKey: "guohe", category: "trick", requiresTarget: true },
        shunshou: {
            name: "顺手牵羊",
            type: "shunshou",
            cardKey: "shunshou",
            category: "trick",
            requiresTarget: true,
            distanceLimit: 1,
        },
        juedou: { name: "决斗", type: "juedou", cardKey: "juedou", category: "trick", requiresTarget: true },
        jiedao: { name: "借刀杀人", type: "jiedao", cardKey: "jiedao", category: "trick", requiresTarget: true },
        nanman: { name: "南蛮入侵", type: "nanman", cardKey: "nanman", category: "trick" },
        wanjian: { name: "万箭齐发", type: "wanjian", cardKey: "wanjian", category: "trick" },
        taoyuan: { name: "桃园结义", type: "taoyuan", cardKey: "taoyuan", category: "trick" },
        wugu: { name: "五谷丰登", type: "wugu", cardKey: "wugu", category: "trick" },
        wuxie: { name: "无懈可击", type: "wuxie", cardKey: "wuxie", category: "trick", responseType: "wuxie" },
        lebu: {
            name: "乐不思蜀",
            type: "lebu",
            cardKey: "lebu",
            category: "trick",
            requiresTarget: true,
            delayedTrickType: "lebu",
        },
        shandian: { name: "闪电", type: "shandian", cardKey: "shandian", category: "trick", delayedTrickType: "shandian" },
        huogong: { name: "火攻", type: "huogong", cardKey: "huogong", category: "trick", requiresTarget: true },
        tiesuo: { name: "铁索连环", type: "tiesuo", cardKey: "tiesuo", category: "trick" },
        bingliang: {
            name: "兵粮寸断",
            type: "bingliang",
            cardKey: "bingliang",
            category: "trick",
            requiresTarget: true,
            delayedTrickType: "bingliang",
            distanceLimit: 1,
        },
        weapon: { name: "武器", type: "weapon", cardKey: "weapon", category: "equip", equipmentSlot: "weapon", range: 3 },
        armor: { name: "防具", type: "armor", cardKey: "armor", category: "equip", equipmentSlot: "armor" },
        attack_horse: { name: "进攻马", type: "attack_horse", cardKey: "attack_horse", category: "equip", equipmentSlot: "attackHorse" },
        defense_horse: { name: "防御马", type: "defense_horse", cardKey: "defense_horse", category: "equip", equipmentSlot: "defenseHorse" },
    };
    return defs[key];
}
export function createStarterDeck() {
    const suits = ["spade", "heart", "club", "diamond"];
    const deckPlan = [
        ["sha", 30],
        ["fire_sha", 5],
        ["thunder_sha", 4],
        ["shan", 22],
        ["tao", 9],
        ["jiu", 6],
        ["wuzhong", 4],
        ["guohe", 5],
        ["shunshou", 5],
        ["juedou", 3],
        ["jiedao", 2],
        ["nanman", 2],
        ["wanjian", 2],
        ["taoyuan", 2],
        ["wugu", 2],
        ["wuxie", 5],
        ["lebu", 2],
        ["shandian", 1],
        ["huogong", 3],
        ["tiesuo", 4],
        ["bingliang", 3],
        ["weapon", 12],
        ["armor", 6],
        ["attack_horse", 3],
        ["defense_horse", 3],
    ];
    const keys = deckPlan.flatMap(([key, count]) => Array.from({ length: count }, () => key));
    const occurrences = {};
    return keys.map((key, index) => {
        const occurrence = occurrences[key] ?? 0;
        occurrences[key] = occurrence + 1;
        return decorateDeckCard({
            id: `card-${index + 1}`,
            ...cardDef(key),
            suit: suits[index % suits.length],
            rank: (index % 13) + 1,
        }, occurrence);
    });
}
function decorateDeckCard(card, occurrence) {
    const variants = EQUIPMENT_VARIANTS[card.cardKey];
    const variant = variants?.[occurrence % variants.length];
    if (!variant)
        return card;
    return {
        ...card,
        name: variant.name,
        equipmentKey: variant.equipmentKey,
        range: variant.range ?? card.range,
    };
}

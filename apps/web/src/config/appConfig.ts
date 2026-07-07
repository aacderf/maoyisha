export const APP_VERSION = "1.5.10";

export const ANNOUNCEMENT_DISMISS_KEY = "maoyi.announcement.dismissedVersion";

export const ANNOUNCEMENT_BY_VERSION = {
  version: APP_VERSION,
  title: "1.5.10 双风格特效与光标扩展",
  items: [
    "战斗特效新增“国风·三国杀感”和“动画·清透光效”两套风格，可在设置和局内设置切换。",
    "国风版放大刀光、冲击、毒雾、阶段、阵亡等反馈，动画版保留 Effekseer 清透序列帧效果。",
    "出牌新增卡牌飞向牌桌的拖尾、墨迹/粒子残影和目标落点反馈。",
    "光标新增 Silver Wolf、流萤、普通指针 V1.5 三套皮肤，并继续支持 60%–160% 大小与粒子/樱花拖尾。",
    "练习场开局会自动推进人机先手，避免停在人机回合无法操作。",
  ],
};

const env = import.meta.env;

export const ADMIN_EMAIL = "944358575@qq.com";
export const CLOUDBASE_ENV_ID =
  env.VITE_CLOUDBASE_ENV_ID || "card-game-auth-d1gesqyiz6c7e59bd";
export const CLOUDBASE_REGION = env.VITE_CLOUDBASE_REGION || "ap-shanghai";

// CloudBase 匿名访问令牌只从 apps/web/.env 读取，避免复制到源码。
export const CLOUDBASE_ACCESS_KEY = (env.VITE_CLOUDBASE_ACCESS_KEY || "").trim();

// ================== PHOTON APP ID 需要替换的位置 ==================
export const PHOTON_APP_ID = "a38134da-b3e5-4cde-8d1b-fccb45e75f28";
// =================================================================

// 狼人杀使用独立协议版本；标准牌局规则不在本轮修改。
export const PROTOCOL_VERSION = "1.4-werewolf-2";
export const PHOTON_APP_VERSION = PROTOCOL_VERSION;
export const PHOTON_REGION = "cn";
export const PHOTON_CHINA_NAME_SERVER = "wss://ns.photonengine.cn:19093";

export const LAST_ROOM_KEY = "cardgame.photon.lastRoom";

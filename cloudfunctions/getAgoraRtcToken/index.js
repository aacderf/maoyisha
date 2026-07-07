const crypto = require("node:crypto");
const cloudbase = require("@cloudbase/node-sdk");
const { RtcRole, RtcTokenBuilder } = require("agora-token");

const TOKEN_LIFETIME_SECONDS = 3600;
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });

exports.main = async (event = {}) => {
  const { uid } = app.auth().getUserInfo();
  if (!uid) throw new Error("UNAUTHORIZED");

  const appId = String(process.env.AGORA_APP_ID || "").trim();
  const appCertificate = String(process.env.AGORA_APP_CERTIFICATE || "").trim();
  if (!appId || !appCertificate) throw new Error("AGORA_CONFIG_MISSING");

  const roomCode = normalizeRoomCode(event.roomCode);
  if (!roomCode) throw new Error("INVALID_ROOM_CODE");
  const voiceScope = event.voiceScope === "wolves" ? "wolves" : "public";

  const channel = `maoyi-1-4-${roomCode.toLowerCase()}-${voiceScope}`;
  const rtcUid = crypto.createHash("sha256").update(String(uid)).digest("hex").slice(0, 24);
  const token = RtcTokenBuilder.buildTokenWithUserAccount(
    appId,
    appCertificate,
    channel,
    rtcUid,
    RtcRole.PUBLISHER,
    TOKEN_LIFETIME_SECONDS,
    TOKEN_LIFETIME_SECONDS
  );

  return {
    appId,
    token,
    channel,
    rtcUid,
    expiresAt: Date.now() + TOKEN_LIFETIME_SECONDS * 1000,
  };
};

function normalizeRoomCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
}

const Photon = require("photon-realtime");

const APP_ID = process.env.MAOYI_PHOTON_APP_ID || "a38134da-b3e5-4cde-8d1b-fccb45e75f28";
const APP_VERSION = "1.4-werewolf-2";
const REGION = "cn";
const NAME_SERVER = "wss://ns.photonengine.cn:19093";
const LBC = Photon.LoadBalancing.LoadBalancingClient;
const roomName = `QA-CREATE-${Date.now().toString(36).toUpperCase()}`;
const timeline = [];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeClient() {
  const client = new LBC(Photon.ConnectionProtocol.Wss, APP_ID, APP_VERSION);
  client.setNameServerAddress?.(NAME_SERVER);
  client.setUserId(`qa-create-${Date.now()}`);
  client.setLogLevel?.(Photon.Logger?.Level?.ERROR ?? 1);
  const stateWaiters = [];
  const joinWaiters = [];

  client.onStateChange = (state) => {
    const name = LBC.StateToName(state);
    timeline.push({ at: Date.now(), state: name });
    for (const waiter of [...stateWaiters]) {
      if (waiter.state === state) {
        clearTimeout(waiter.timer);
        stateWaiters.splice(stateWaiters.indexOf(waiter), 1);
        waiter.resolve(name);
      }
    }
    if (state === LBC.State.Joined) {
      for (const waiter of [...joinWaiters]) {
        clearTimeout(waiter.timer);
        joinWaiters.splice(joinWaiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
  };

  client.onOperationResponse = (errorCode, errorMessage, operationCode) => {
    timeline.push({ at: Date.now(), operationCode, errorCode, errorMessage });
    if (operationCode === 226 && errorCode) {
      const error = Object.assign(new Error(errorMessage || `Photon join error ${errorCode}`), { errorCode });
      for (const waiter of [...joinWaiters]) {
        clearTimeout(waiter.timer);
        joinWaiters.splice(joinWaiters.indexOf(waiter), 1);
        waiter.reject(error);
      }
    }
  };

  client.waitState = (state, timeoutMs = 20_000) =>
    new Promise((resolve, reject) => {
      const waiter = {
        state,
        resolve,
        reject,
        timer: setTimeout(() => {
          stateWaiters.splice(stateWaiters.indexOf(waiter), 1);
          reject(new Error(`Timeout waiting for ${LBC.StateToName(state)}`));
        }, timeoutMs),
      };
      stateWaiters.push(waiter);
    });

  client.waitJoin = (timeoutMs = 20_000) =>
    new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          joinWaiters.splice(joinWaiters.indexOf(waiter), 1);
          reject(new Error("Timeout waiting for room join"));
        }, timeoutMs),
      };
      joinWaiters.push(waiter);
    });

  return client;
}

async function main() {
  const client = makeClient();
  const lobby = client.waitState(LBC.State.JoinedLobby);
  client.connectToRegionMaster(REGION);
  await lobby;

  const joined = client.waitJoin();
  client.joinRoom(
    roomName,
    { createIfNotExists: true },
    {
      isVisible: false,
      isOpen: true,
      maxPlayers: 4,
      playerTTL: 120_000,
      roomTTL: 120_000,
      customGameProperties: {
        cg_status: "waiting",
        cg_protocol_version: APP_VERSION,
        cg_game_kind: "card",
      },
    }
  );
  await joined;

  if (!client.isJoinedToRoom?.() || client.myRoom?.().name !== roomName) {
    throw new Error("Client did not enter the created room");
  }

  const backToLobby = client.waitState(LBC.State.JoinedLobby);
  client.leaveRoom?.();
  await backToLobby;
  client.disconnect?.();
  await wait(200);

  console.log(JSON.stringify({ ok: true, roomName, timeline }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, roomName, error: error.stack || String(error), timeline }, null, 2));
  process.exit(1);
});

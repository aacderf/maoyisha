const Photon = require("photon-realtime");

const APP_ID = process.env.MAOYI_PHOTON_APP_ID || "a38134da-b3e5-4cde-8d1b-fccb45e75f28";
const APP_VERSION = "1.4-werewolf-2";
const REGION = "cn";
const NAME_SERVER = "wss://ns.photonengine.cn:19093";
const LBC = Photon.LoadBalancing.LoadBalancingClient;
const roomName = `QA-RECONNECT-${Date.now().toString(36).toUpperCase()}`;
const timeline = [];

function makeClient(label, userId) {
  const client = new LBC(Photon.ConnectionProtocol.Wss, APP_ID, APP_VERSION);
  client.setNameServerAddress?.(NAME_SERVER);
  client.setUserId(userId);
  client.setLogLevel?.(Photon.Logger?.Level?.ERROR ?? 1);
  const stateWaiters = [];
  const operationWaiters = [];
  client.onStateChange = (state) => {
    const name = LBC.StateToName(state);
    timeline.push({ at: Date.now(), label, state: name });
    for (const waiter of [...stateWaiters]) {
      if (waiter.state === state) {
        clearTimeout(waiter.timer);
        stateWaiters.splice(stateWaiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
    if (state === LBC.State.Joined) {
      for (const waiter of [...operationWaiters]) {
        clearTimeout(waiter.timer);
        operationWaiters.splice(operationWaiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
  };
  client.onOperationResponse = (errorCode, errorMessage, operationCode) => {
    timeline.push({ at: Date.now(), label, operationCode, errorCode });
    for (const waiter of [...operationWaiters]) {
      if (operationCode === 226 && errorCode) {
        clearTimeout(waiter.timer);
        operationWaiters.splice(operationWaiters.indexOf(waiter), 1);
        waiter.reject(Object.assign(new Error(errorMessage || `Photon error ${errorCode}`), { errorCode }));
      }
    }
    if (operationCode === 226 && errorCode) {
      for (const waiter of [...stateWaiters].filter((item) => item.state === LBC.State.Joined)) {
        clearTimeout(waiter.timer);
        stateWaiters.splice(stateWaiters.indexOf(waiter), 1);
        waiter.reject(Object.assign(new Error(errorMessage || `Photon error ${errorCode}`), { errorCode }));
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
          reject(new Error(`${label} did not reach ${LBC.StateToName(state)}`));
        }, timeoutMs),
      };
      stateWaiters.push(waiter);
    });
  client.waitJoin = (timeoutMs = 20_000) =>
    Promise.race([
      client.waitState(LBC.State.Joined, timeoutMs),
      new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            operationWaiters.splice(operationWaiters.indexOf(waiter), 1);
            reject(new Error(`${label} join operation timed out`));
          }, timeoutMs),
        };
        operationWaiters.push(waiter);
      }),
    ]);
  return client;
}

async function connect(client) {
  const ready = client.waitState(LBC.State.JoinedLobby);
  client.connectToRegionMaster(REGION);
  await ready;
}

async function rejoinWithRetry(client) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const joined = client.waitJoin();
    client.joinRoom(roomName, { rejoin: true });
    try {
      await joined;
      return;
    } catch (error) {
      if (error.errorCode !== 32746) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
  throw new Error("active actor did not become rejoinable");
}

async function main() {
  const host = makeClient("host", `qa-host-${Date.now()}`);
  const guestUserId = `qa-guest-${Date.now()}`;
  const guest = makeClient("guest", guestUserId);
  await connect(host);
  const hostJoined = host.waitJoin();
  host.joinRoom(
    roomName,
    { createIfNotExists: true },
    {
      isVisible: false,
      isOpen: true,
      maxPlayers: 2,
      playerTTL: 120_000,
      roomTTL: 120_000,
      customGameProperties: { qa_snapshot: JSON.stringify({ turn: 7 }) },
    }
  );
  await hostJoined;
  await connect(guest);
  const guestJoined = guest.waitJoin();
  guest.joinRoom(roomName, { createIfNotExists: false });
  await guestJoined;
  if (JSON.parse(guest.myRoom().getCustomProperties().qa_snapshot).turn !== 7) {
    throw new Error("room snapshot did not reach guest");
  }

  guest.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 400));
  const resumedGuest = makeClient("resumed-guest", guestUserId);
  await connect(resumedGuest);
  await rejoinWithRetry(resumedGuest);
  if (JSON.parse(resumedGuest.myRoom().getCustomProperties().qa_snapshot).turn !== 7) {
    throw new Error("snapshot was not restored after rejoin");
  }

  host.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 800));
  const room = resumedGuest.myRoom();
  const currentMaster = room.masterClientId;
  if (!currentMaster) throw new Error("master client was not assigned after host disconnect");

  room.setRoomTTL?.(0);
  room.setPlayerTTL?.(0);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const backInLobby = resumedGuest.waitState(LBC.State.JoinedLobby);
  resumedGuest.leaveRoom?.();
  await backInLobby;
  resumedGuest.disconnect();
  console.log(JSON.stringify({ ok: true, roomName, currentMaster, timeline }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, roomName, error: error.stack || String(error), timeline }, null, 2));
  process.exit(1);
});

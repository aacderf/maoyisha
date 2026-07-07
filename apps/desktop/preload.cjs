const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  mode: "desktop",
  restart: () => ipcRenderer.send("desktop:restart"),
  quit: () => ipcRenderer.send("desktop:quit"),
  openLogs: () => ipcRenderer.invoke("desktop:open-logs"),
  canEncryptText: () => ipcRenderer.invoke("desktop:can-encrypt-text"),
  encryptText: (value) => ipcRenderer.invoke("desktop:encrypt-text", value),
  decryptText: (value) => ipcRenderer.invoke("desktop:decrypt-text", value),
  storageGet: (key) => ipcRenderer.sendSync("desktop:storage-get", key),
  storageSet: (key, value) => ipcRenderer.sendSync("desktop:storage-set", key, value),
  storageRemove: (key) => ipcRenderer.sendSync("desktop:storage-remove", key),
  reportNetworkDiagnostic: (value) => ipcRenderer.send("desktop:network-diagnostic", value),
});

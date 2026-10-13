import { contextBridge, ipcRenderer } from "electron";

const annotationBridge = {
  inspectConfirmed: (selection: unknown) => {
    ipcRenderer.sendToHost("inspect-confirmed", selection);
  },
};

contextBridge.exposeInMainWorld(
  "inspectConfirmed",
  Object.freeze(annotationBridge),
);

import { contextBridge, ipcRenderer } from "electron";

const annotationBridge = {
  inspectConfirmed: (selection: unknown) => {
    ipcRenderer.sendToHost("inspect-confirmed", selection);
  },
  annotationExited: () => {
    ipcRenderer.sendToHost("inspect-exited");
  },
};

contextBridge.exposeInMainWorld(
  "inspectConfirmed",
  Object.freeze(annotationBridge),
);

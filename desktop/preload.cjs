const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cleanSpeechDesktop', {
  isDesktop: true,
  onStartRecording(callback) {
    const listener = () => callback();
    ipcRenderer.on('desktop:start-recording', listener);
    return () => ipcRenderer.removeListener('desktop:start-recording', listener);
  },
  onStopRecording(callback) {
    const listener = () => callback();
    ipcRenderer.on('desktop:stop-recording', listener);
    return () => ipcRenderer.removeListener('desktop:stop-recording', listener);
  },
  insertText(text) {
    ipcRenderer.send('desktop:insert-text', text);
  },
  notifyError(message) {
    ipcRenderer.send('desktop:error', message);
  },
  setOverlayStatus(status, label, detail, recordingTime = 0) {
    ipcRenderer.send('desktop:overlay-status', { status, label, detail, recordingTime });
  },
  onOverlayStatus(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('overlay:status', listener);
    return () => ipcRenderer.removeListener('overlay:status', listener);
  },
});

contextBridge.exposeInMainWorld('overlay', {
  onOverlayStatus(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('overlay:status', listener);
    return () => ipcRenderer.removeListener('overlay:status', listener);
  },
});

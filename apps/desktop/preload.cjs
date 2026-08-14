const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  bootstrap: () => ipcRenderer.invoke('desktop:bootstrap'),
  login: credentials => ipcRenderer.invoke('desktop:login', credentials),
})

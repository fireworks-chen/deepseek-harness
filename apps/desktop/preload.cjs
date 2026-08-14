const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  bootstrap: () => ipcRenderer.invoke('desktop:bootstrap'),
  login: credentials => ipcRenderer.invoke('desktop:login', credentials),
  account: () => ipcRenderer.invoke('desktop:account'),
  logout: () => ipcRenderer.invoke('desktop:logout'),
})

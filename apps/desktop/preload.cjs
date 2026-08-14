const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  bootstrap: () => ipcRenderer.invoke('desktop:bootstrap'),
  requestVerificationCode: phone => ipcRenderer.invoke('desktop:request-verification-code', phone),
  login: credentials => ipcRenderer.invoke('desktop:login', credentials),
  account: () => ipcRenderer.invoke('desktop:account'),
  logout: () => ipcRenderer.invoke('desktop:logout'),
})

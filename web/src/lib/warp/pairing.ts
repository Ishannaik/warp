export interface PairedDevice {
  token: string;
  name: string;
}

const STORAGE_KEY = "warp.pairedDevices";

export function getPairedDevices(): PairedDevice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

export function savePairedDevice(device: PairedDevice) {
  try {
    let devices = getPairedDevices();
    devices = devices.filter((d) => d.token !== device.token);
    devices.push(device);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
    window.dispatchEvent(new Event("warp-paired-devices-changed"));
  } catch {
    // ignore
  }
}

export function forgetPairedDevice(token: string) {
  try {
    let devices = getPairedDevices();
    devices = devices.filter((d) => d.token !== token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
    window.dispatchEvent(new Event("warp-paired-devices-changed"));
  } catch {
    // ignore
  }
}

export function getPairedTokens(): string[] {
  return getPairedDevices().map((d) => d.token);
}

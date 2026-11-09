export const SETTINGS_CHANGED_EVENT = 'harness:settings-changed';

export function notifySettingsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

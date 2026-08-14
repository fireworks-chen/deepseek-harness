/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/** Locale labels for the built-in permission presets. */
interface PermissionPresetLabels {
  readOnly: string
  workspaceWrite: string
  fullAccess: string
}

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @param labels - optional localized labels for the built-in presets.
 * @returns the localized built-in label or the conventional display name.
 */
export function displayPermissionPreset(
  value: string,
  name: string,
  labels?: PermissionPresetLabels,
): string {
  if (labels !== undefined) {
    if (value === 'read-only') return labels.readOnly
    if (value === 'workspace-write') return labels.workspaceWrite
    if (value === FULL_ACCESS_PRESET) return labels.fullAccess
  }
  return value === FULL_ACCESS_PRESET ? 'Full access' : displayPresetName(name)
}

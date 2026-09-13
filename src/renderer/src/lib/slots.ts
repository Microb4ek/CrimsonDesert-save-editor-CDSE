import type { SlotInfo } from '@shared/ipc';

/** slot0..2 are the manual slots the game numbers 1..3; slot100+ are its rolling autosaves. */
export function slotTitle(info: SlotInfo | null): string {
  if (!info) return 'Save';
  if (info.slot >= 100) return `Autosave ${info.slot - 100 + 1}`;
  return `Slot ${info.slot + 1}`;
}

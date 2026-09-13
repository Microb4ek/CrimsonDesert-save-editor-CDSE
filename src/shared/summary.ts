import { openSave } from './cdcrypto';
import { Model } from './cdmodel';
import { parseParc } from './parc';

/** What the slot picker shows: parsed from lobby.save (small) so scanning is cheap. */
export interface SlotSummary {
  characterKey: number;
  level: number;
  generatedTime: number;
  missionKey: number;
  questKey: number;
  customName: string;
  gameSaveVersion: number;
  generateNo: number;
}

export function summarizeLobby(bytes: Uint8Array): SlotSummary {
  const c = openSave(bytes);
  const m = new Model(parseParc(c.blob));
  const lobby = m.root('LobbySaveData');
  if (!lobby) throw new Error('lobby.save has no LobbySaveData');
  const slot = m.obj(lobby, '_slotSaveData');
  return {
    characterKey: slot ? m.num(slot, '_characterKey') : 0,
    level: slot ? m.num(slot, '_level') : 0,
    generatedTime: slot ? m.num(slot, '_generatedTime') : 0,
    missionKey: slot ? m.num(slot, '_slotDisplayNameMissionKey') : 0,
    questKey: slot ? m.num(slot, '_slotDisplayNameMainQuestKey') : 0,
    customName: slot ? m.str(slot, '_customDisplayName') : '',
    gameSaveVersion: m.num(lobby, '_gameSaveVersion'),
    generateNo: m.num(lobby, '_generateNo'),
  };
}

export const MOB_ROOM_COUNT = 40;
export const EMU_ROOM_COUNT = 10;
export const SUP_ROOM_COUNT = 4;
export const PERMANENT_ROOM_COUNT =
  MOB_ROOM_COUNT + EMU_ROOM_COUNT + SUP_ROOM_COUNT;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function roomTitle(number: number) {
  if (number <= MOB_ROOM_COUNT) return `MOB ${pad(number)}`;
  if (number <= MOB_ROOM_COUNT + EMU_ROOM_COUNT) {
    return `EMU ${pad(number - MOB_ROOM_COUNT)}`;
  }
  return `SUP ${pad(number - MOB_ROOM_COUNT - EMU_ROOM_COUNT)}`;
}

export function isMobRoom(number: number) {
  return number >= 1 && number <= MOB_ROOM_COUNT;
}

export function isEmuRoom(number: number) {
  return number > MOB_ROOM_COUNT && number <= MOB_ROOM_COUNT + EMU_ROOM_COUNT;
}

export function isSupRoom(number: number) {
  return number > MOB_ROOM_COUNT + EMU_ROOM_COUNT;
}

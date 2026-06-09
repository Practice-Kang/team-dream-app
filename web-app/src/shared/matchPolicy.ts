import type { Attendee } from "./domain";

export function isForbiddenThreeToOneGenderCount(maleCount: number, femaleCount: number): boolean {
  return (maleCount === 3 && femaleCount === 1) || (maleCount === 1 && femaleCount === 3);
}

export function createsForbiddenThreeToOneMixedRemainder(maleCount: number, femaleCount: number): boolean {
  const maleRemainder = maleCount % 4;
  const femaleRemainder = femaleCount % 4;

  return maleRemainder + femaleRemainder === 4 && isForbiddenThreeToOneGenderCount(maleRemainder, femaleRemainder);
}

export function isForbiddenThreeToOnePlayers(players: Array<Pick<Attendee, "gender">>): boolean {
  if (players.length !== 4) return false;

  const maleCount = players.filter((player) => player.gender === "남").length;
  const femaleCount = players.filter((player) => player.gender === "여").length;

  return isForbiddenThreeToOneGenderCount(maleCount, femaleCount);
}

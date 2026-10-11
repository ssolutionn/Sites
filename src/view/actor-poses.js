// The game owns actions and paths. Clips only present them.
const GIRL = {
  idle: ['idle'], menu: ['idle'], walk: ['walk'], cut: ['cut'], mix: ['stir'],
  work: ['work', 'stir'], wash: ['wash', 'stir'], wipe: ['wipe', 'stir'],
  stove: ['stove', 'stir'], grate: ['grate', 'cut'], unpack: ['unpack', 'carry'],
  carry: ['carry'], reach: ['reach_up', 'celebrate'], phone: ['phone_answer'],
  shoo: ['shoo'], joy: ['celebrate'], taste: ['taste'], take: ['open_fridge', 'carry'],
};
export const ONCE = new Set(['phone_answer', 'shoo', 'taste', 'open_fridge', 'celebrate', 'reach_up', 'knock_over', 'jump_up', 'meow']);
export function clipForGirl(pose, available, carrying = false) {
  const names = pose === 'walk' && carrying ? ['walk_carry', 'walk'] : GIRL[pose] ?? ['work', 'stir'];
  return [...names, 'idle'].find((n) => available.has(n)) ?? null;
}
export function clipForCat(mode, available, moving = false, loot = false) {
  const names = mode === 'jump' ? ['jump_up'] : mode === 'knock' ? ['knock_over', 'reach']
    : moving ? (loot ? ['steal_run', 'walk'] : ['walk']) : mode === 'play' ? ['idle'] : [mode];
  return [...names, 'idle'].find((n) => available.has(n)) ?? null;
}
export const upperBodyTrack = (name) => /^(?:spine_\d+|shoulder_[lr]|upper_arm_[lr]|forearm_[lr]|hand_[lr]|socket_hand_[lr]|neck|head)\./.test(name);

// ConstantQuest — achievement definitions
// Achievements are computed live from progress/streak/friend data rather
// than stored as their own "unlocked" flags, so they can never drift out
// of sync with the underlying stats.
'use strict';

const ACHIEVEMENTS = [
  {
    id: 'first-steps',
    icon: '🎯',
    name: 'First Steps',
    description: 'Complete your first quiz attempt.',
    check: ctx => ctx.totalAttempts >= 1
  },
  {
    id: 'perfect-pi',
    icon: '🥧',
    name: 'Perfect Pi',
    description: 'Master Pi at any difficulty.',
    check: ctx => DIFFICULTIES.some(d => ctx.perfectSet.has(`pi:${d.id}`))
  },
  {
    id: 'century-club',
    icon: '💯',
    name: 'Century Club',
    description: 'Master any constant at 100 digits (Master difficulty).',
    check: ctx => [...ctx.perfectSet].some(key => key.endsWith(':master'))
  },
  {
    id: 'well-rounded',
    icon: '🌱',
    name: 'Well Rounded',
    description: 'Master Easy difficulty on every constant.',
    check: ctx => CONSTANTS.every(c => ctx.perfectSet.has(`${c.id}:easy`))
  },
  {
    id: 'halfway-there',
    icon: '⚖️',
    name: 'Halfway There',
    description: 'Master Medium difficulty on every constant.',
    check: ctx => CONSTANTS.every(c => ctx.perfectSet.has(`${c.id}:medium`))
  },
  {
    id: 'constant-master',
    icon: '👑',
    name: 'Constant Master',
    description: 'Master all 4 difficulties on every constant — the ultimate badge.',
    check: ctx => CONSTANTS.every(c => DIFFICULTIES.every(d => ctx.perfectSet.has(`${c.id}:${d.id}`)))
  },
  {
    id: 'on-fire',
    icon: '🔥',
    name: 'On Fire',
    description: 'Reach a 3-day practice streak.',
    check: ctx => ctx.longestStreak >= 3
  },
  {
    id: 'unstoppable',
    icon: '⚡',
    name: 'Unstoppable',
    description: 'Reach a 7-day practice streak.',
    check: ctx => ctx.longestStreak >= 7
  },
  {
    id: 'iron-will',
    icon: '🏔️',
    name: 'Iron Will',
    description: 'Reach a 30-day practice streak.',
    check: ctx => ctx.longestStreak >= 30
  },
  {
    id: 'social-butterfly',
    icon: '🦋',
    name: 'Social Butterfly',
    description: 'Add 3 friends.',
    check: ctx => ctx.friendsCount >= 3
  },
  {
    id: 'speed-demon',
    icon: '🏎️',
    name: 'Speed Demon',
    description: 'Type 50 correct characters in a row during a timed Speed Run.',
    check: ctx => ctx.bestSpeedStreak >= 50
  }
];

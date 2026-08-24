import { Plan } from '../../types';

export const DEMO_PLAN_ID = 'demo-showcase';

/**
 * The customization showcase — a small, honest demo plan that exercises every
 * field of the plan model so new users can see what each piece does. It is
 * seeded like any custom plan: freely editable, forkable and deletable
 * (deletions stick via the normal tombstone flow).
 */
export const DEMO_PLAN: Plan = {
  id: DEMO_PLAN_ID,
  name: 'Demo — Try everything',
  emoji: '🧪',
  accent: 'warning',
  description: 'A sample plan showing off themes, layouts, widgets and quests',
  method:
    'This little plan exists to play with. Open Settings → Appearance to switch my theme or layout, tap the swap icon on the study activity card to try other widgets, and add a daily quest below to build a routine. Edit me, break me, delete me — nothing here is precious.',
  principle: [
    { step: 'Switch the theme — every color follows' },
    { step: 'Change the layout density' },
    { step: 'Swap the activity widget' },
    { step: 'Add a daily quest' }
  ],
  sections: [
    { id: 'demo-basics', title: 'Basics — what a phase looks like' },
    { id: 'demo-deep', title: 'Deeper fields — notes, timers, tips' }
  ],
  phases: [
    {
      id: 1,
      section: 'demo-basics',
      title: 'Anatomy of a phase card',
      shortTitle: 'Phase anatomy',
      what:
        'Every roadmap is a list of phases like this one. A phase carries a goal, concrete steps you tick off, and exit criteria that tell you when to move on.',
      estimatedHours: 2,
      concepts: ['phases', 'steps', 'exit criteria'],
      docLinks: [
        { title: 'Plan editor (fork me first)', url: '#' }
      ],
      steps: [
        'Tick this step — checkboxes sync across devices',
        'Start this step’s countdown timer to see the bar appear',
        'Filter by the concept chips above'
      ],
      exit: [
        'You can explain what steps vs exit criteria are',
        'You tried at least one filter'
      ],
      proTip: 'Fork any built-in plan from the plan switcher to make it yours.'
    },
    {
      id: 2,
      section: 'demo-basics',
      title: 'Make it yours — appearance',
      shortTitle: 'Make it yours',
      dense: true,
      what:
        'Themes recolor the whole app; layouts change density and what shows on the home page; the activity widget is swappable.',
      estimatedHours: 1,
      concepts: ['themes', 'layouts', 'widgets'],
      steps: [
        'Settings → Appearance → try Daylight or Nord',
        'Pick the Focus layout for single-column studying',
        'Swap Study activity for the goal ring or stat tiles'
      ],
      exit: ['Your tracker looks like yours']
    },
    {
      id: 3,
      section: 'demo-deep',
      title: 'Routines with daily quests + XP',
      shortTitle: 'Daily quests',
      what:
        'Quests are small recurring tasks — flashcards, review, reading — that reset every day. Checking them earns XP; finishing all enabled quests pays a bonus.',
      estimatedHours: 1,
      concepts: ['quests', 'xp', 'streaks'],
      steps: [
        'Add a quest from the template chips',
        'Check it off today and watch the XP chip move',
        'Disable or delete it whenever you like'
      ],
      exit: ['One quest checked today'],
      codeSnippet: '// streaks and XP are independent:\n// study minutes feed the graph,\n// quests feed XP',
      codeLanguage: 'go'
    },
    {
      id: 4,
      section: 'demo-deep',
      title: 'Graduation — delete this plan',
      shortTitle: 'Clean up',
      what: 'When you have seen enough, delete me from the plan switcher. Your real plans, progress and XP stay untouched.',
      estimatedHours: 0.5,
      concepts: [],
      steps: ['Open the plan switcher', 'Delete “Demo — Try everything”'],
      exit: ['Back to your own roadmap']
    }
  ]
};

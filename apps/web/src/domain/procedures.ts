import type { EvidenceId } from './evidence'
import type { RiskArea } from './riskEngine'

export interface Procedure {
  id: string
  title: string
  areas: RiskArea[]
  when: string
  steps: string[]
  escalate: string
  evidence: EvidenceId[]
}

// Written so that any crew member can follow them, because the crew medical officer is often not a
// physician and may be the one who is ill.
export const PROCEDURES: readonly Procedure[] = [
  {
    id: 'measure-vitals',
    title: 'Measure vital signs at rest',
    areas: ['clinical', 'vitals'],
    when: 'At the daily check-in, or when an alert asks for new measurements.',
    steps: [
      'Sit or strap in and rest quietly for 5 minutes.',
      'Put on the sensor garment or attach the finger sensor; keep the hand still.',
      'Record heart rate, oxygen saturation, blood pressure, temperature and breathing rate.',
      'If a value looks wrong, wait 2 minutes and measure again before logging it.',
    ],
    escalate: 'If oxygen saturation is 91% or lower, or you feel chest pain, contact the crew medical officer now.',
    evidence: ['news2'],
  },
  {
    id: 'solar-storm-shelter',
    title: 'Solar particle event: go to the storm shelter',
    areas: ['radiation'],
    when: 'When a solar radiation storm alert (S1 or higher) is active outside Earth’s magnetic field.',
    steps: [
      'Stop non-essential work and move to the most shielded area (storm shelter, water or supply walls).',
      'Bring the personal dosimeter and log the time you entered.',
      'Stay until the alert ends; check the proton level every hour.',
      'Log the time you left and the dosimeter reading.',
    ],
    escalate: 'If anyone feels nausea, vomiting or unusual fatigue during the event, inform the crew medical officer.',
    evidence: ['noaaScales', 'nasaStd3001Radiation', 'mars2024Storm'],
  },
  {
    id: 'vigilance-test',
    title: 'Take the 3-minute vigilance test',
    areas: ['cognition'],
    when: 'Once a day, after short sleep, or before a critical task.',
    steps: [
      'Find a quiet spot and silence notifications.',
      'Press the button as fast as you can each time the counter appears; do not press early.',
      'Complete the full 3 minutes; an interrupted test is not scored.',
    ],
    escalate: 'With 5 or more lapses, postpone critical tasks and repeat the test after rest.',
    evidence: ['pvtBrief', 'pvt'],
  },
  {
    id: 'balance-tests',
    title: 'Balance and mobility field tests',
    areas: ['sensorimotor'],
    when: 'Before landing preparations, extravehicular activity, or when dizzy.',
    steps: [
      'Sit-to-stand: from seated, stand up and stay still for 10 seconds; record the time.',
      'Tandem walk: walk 10 steps heel-to-toe in a straight line; count correct steps.',
      'Walk and turn: walk 3 metres, turn and walk back; record the time.',
      'Have another crew member nearby for safety during every test.',
    ],
    escalate: 'If any task is much slower than your baseline, do not perform egress or EVA tasks alone.',
    evidence: ['fieldTest'],
  },
  {
    id: 'visual-self-check',
    title: 'Visual self-check (Amsler grid)',
    areas: ['vision'],
    when: 'When you notice any change in vision.',
    steps: [
      'Hold the screen at reading distance with normal lighting.',
      'Cover one eye and look at the central dot.',
      'Note any wavy, missing or blurred lines; repeat with the other eye.',
    ],
    escalate: 'Report any change to the crew medical officer; this is a self-check, not a diagnosis.',
    evidence: ['sans'],
  },
  {
    id: 'high-co2',
    title: 'High cabin CO2',
    areas: ['environment'],
    when: 'When cabin CO2 is above 4 mmHg, especially with headache.',
    steps: [
      'Tell the crew and check that the ventilation fan near your work area is running.',
      'Move away from places where air stagnates (sleeping bags, behind equipment).',
      'Take breaks in a better-ventilated module.',
    ],
    escalate: 'If headaches or confusion increase, inform the commander and the crew medical officer.',
    evidence: ['co2Law2014'],
  },
  {
    id: 'fever-protocol',
    title: 'Fever or possible infection',
    areas: ['immune', 'clinical'],
    when: 'When temperature is 38 °C or more, or cold sores or a rash appear.',
    steps: [
      'Measure temperature now and twice a day.',
      'Drink fluids and rest; reduce shared contact surfaces.',
      'Record symptoms in the check-in.',
    ],
    escalate: 'If the crew medical officer is the one ill, another crew member follows this protocol and contacts the flight surgeon.',
    evidence: ['herpes2019', 'news2'],
  },
  {
    id: 'exercise-hydration',
    title: 'Protect bone and kidneys',
    areas: ['musculoskeletal', 'renal'],
    when: 'When resistance exercise or fluid intake is below target.',
    steps: [
      'Plan the missing resistance sessions; load matters more than duration.',
      'Drink to reach about 2.5 litres per day.',
      'Log both in the daily check-in.',
    ],
    escalate: 'Back or flank pain with low fluid intake needs the crew medical officer.',
    evidence: ['boneLoss', 'exerciseLoading', 'renalStone', 'stoneFluids'],
  },
  {
    id: 'sleep-protection',
    title: 'Protect the next sleep period',
    areas: ['sleep'],
    when: 'After two or more nights under 7 hours.',
    steps: [
      'Dim the lights an hour before sleep and avoid screens.',
      'Avoid exercise and caffeine in the last hours before sleep.',
      'Use eye mask and ear plugs; keep the sleeping area ventilated.',
    ],
    escalate: 'If short sleep continues for a week, talk to the crew medical officer.',
    evidence: ['sleepNeed', 'sleep2014'],
  },
  {
    id: 'chest-pain',
    title: 'Chest pain or shortness of breath',
    areas: ['cardiopulmonary'],
    when: 'Immediately, whenever these symptoms appear.',
    steps: [
      'Stop all activity and stay still.',
      'Call the crew medical officer and another crew member.',
      'Measure vital signs and keep measuring every 5 minutes.',
    ],
    escalate: 'This is always urgent: contact the crew medical officer and the flight surgeon now.',
    evidence: ['jugular2019', 'eimo'],
  },
]

export function proceduresFor(area: RiskArea): Procedure[] {
  return PROCEDURES.filter((p) => p.areas.includes(area))
}

// Every rule, threshold and action in AURORA points to one of these sources, and the UI shows it.
// Keep entries short and verifiable: who, where, year and a stable link.

export interface Evidence {
  id: string
  citation: string
  finding: string
  url: string
}

export const EVIDENCE = {
  nasaStd3001Radiation: {
    id: 'nasaStd3001Radiation',
    citation: 'NASA-STD-3001 Vol. 1, V1 4030; NASA OCHMO Radiation Protection Technical Brief',
    finding: 'Career effective dose limit of 600 mSv; 250 mSv limit per solar particle event.',
    url: 'https://www.nasa.gov/sites/default/files/atoms/files/radiation_protection_technical_brief_ochmo.pdf',
  },
  radlab: {
    id: 'radlab',
    citation: 'NASA OSDR RadLab (DOSTEL, CRaTER, MSL-RAD data)',
    finding: 'Measured absorbed dose rates in µGy/h from ISS, lunar orbit and Mars surface detectors.',
    url: 'https://visualization.osdr.nasa.gov/radlab/',
  },
  berger2017: {
    id: 'berger2017',
    citation: 'Berger et al., J. Space Weather Space Clim., 2017 (DOSTEL, ISS Columbus)',
    finding: 'Up to 286 µGy/day absorbed with 647 µSv/day dose equivalent (quality factor ≈ 2.3).',
    url: 'https://www.swsc-journal.org/10.1051/swsc/2017005',
  },
  zhang2020: {
    id: 'zhang2020',
    citation: "Zhang et al., Science Advances, 2020 (Chang'e-4 LND, lunar surface)",
    finding: '13.2 µGy/h absorbed and 1,369 µSv/day dose equivalent (quality factor ≈ 4.3).',
    url: 'https://www.dlr.de/en/latest/news/2020/03/20200925_how-intense-and-dangerous-is-cosmic-radiation-on-the-moon',
  },
  hassler2014: {
    id: 'hassler2014',
    citation: 'Hassler et al., Science, 2014 (Curiosity RAD, Mars surface)',
    finding: '0.21 mGy/day absorbed and 0.64 mSv/day dose equivalent on the surface of Mars.',
    url: 'https://www.swri.org/newsroom/press-releases/swri-led-team-calculates-radiation-exposure-associated-trip-mars',
  },
  zeitlin2013: {
    id: 'zeitlin2013',
    citation: 'Zeitlin et al., Science, 2013 (Curiosity RAD during cruise)',
    finding: '1.84 mSv/day dose equivalent in interplanetary cruise; a 180/500/180-day Mars mission ≈ 1 Sv.',
    url: 'https://www.swri.org/newsroom/press-releases/swri-led-team-calculates-radiation-exposure-associated-trip-mars',
  },
  noaaScales: {
    id: 'noaaScales',
    citation: 'NOAA Space Weather Scales, Solar Radiation Storms (S1 to S5)',
    finding: 'S1 starts at 10 pfu of ≥10 MeV protons; each level is ten times the previous one.',
    url: 'https://www.swpc.noaa.gov/noaa-scales-explanation',
  },
  mars2024Storm: {
    id: 'mars2024Storm',
    citation: 'NASA, "NASA Watches Mars Light Up During Epic Solar Storm", 2024',
    finding: 'On 20 May 2024 Curiosity measured its largest radiation surge since landing.',
    url: 'https://www.nasa.gov/solar-system/planets/mars/nasa-watches-mars-light-up-during-epic-solar-storm',
  },
  boneLoss: {
    id: 'boneLoss',
    citation: 'NASA OCHMO Bone Loss Technical Brief (OCHMO-TB-030)',
    finding: 'Bone mineral loss of about 1 to 1.5% per month in flight, much faster than osteoporosis.',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-030-bone-loss.pdf',
  },
  exerciseLoading: {
    id: 'exerciseLoading',
    citation: 'NASA NTRS 20110015001, on-orbit exercise loading',
    finding: 'Crew members were loaded 43 min/day on average although 146.8 min were assigned.',
    url: 'https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20110015001.pdf',
  },
  muscle6months: {
    id: 'muscle6months',
    citation: 'Trappe et al., J. Appl. Physiol., 2009 (ISS 6-month missions)',
    finding: 'Calf muscle volume fell about 13% and peak power 32% after six months.',
    url: 'https://epublications.marquette.edu/bio_fac/24/',
  },
  renalStone: {
    id: 'renalStone',
    citation: 'NASA Human Research Program, Risk of Renal Stone Formation',
    finding: 'Bone loss raises circulating calcium; exercise and hydration mitigate; no in-mission treatment yet.',
    url: 'https://www.nasa.gov/directorates/esdmd/hhp/risk-of-renal-stone-formation/',
  },
  orthostatic: {
    id: 'orthostatic',
    citation: 'NASA NTRS 20080043912, post-spaceflight orthostatic intolerance',
    finding: 'Hypotension and presyncope in 20 to 30% of returning astronauts (shuttle-era data).',
    url: 'https://ntrs.nasa.gov/citations/20080043912',
  },
  jugular2019: {
    id: 'jugular2019',
    citation: 'Marshall-Goebel et al., JAMA Network Open, 2019',
    finding: '6 of 11 crew had stagnant or reverse jugular flow around flight day 50; one had a thrombus.',
    url: 'https://scholarlycommons.henryford.com/surgery_articles/390',
  },
  sans: {
    id: 'sans',
    citation: 'NASA clinical update on SANS, 2023; NASA-led review, 2025',
    finding: 'About 66% of long-duration astronauts show the earliest signs of SANS.',
    url: 'https://ntrs.nasa.gov/citations/20220014606',
  },
  herpes2019: {
    id: 'herpes2019',
    citation: 'Mehta, Crucian et al., Frontiers in Microbiology, 2019',
    finding: '61% of ISS astronauts shed reactivated herpes viruses; only a few had symptoms.',
    url: 'https://public-pages-files-2025.frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2019.00016/text',
  },
  sleep2014: {
    id: 'sleep2014',
    citation: 'Barger et al., Lancet Neurology, 2014',
    finding: 'ISS crews slept about 6.1 h per night although 8.5 h were scheduled.',
    url: 'https://www.technologynetworks.com/neuroscience/news/ten-year-study-highlights-sleep-deficiency-and-sleep-medication-use-astronauts-282474',
  },
  pvt: {
    id: 'pvt',
    citation: 'NASA Cognition battery and ISS Reaction Self Test (University of Pennsylvania)',
    finding: 'A 3-minute Psychomotor Vigilance Test measures vigilant attention; sleep loss degrades it.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7198903',
  },
  mars500: {
    id: 'mars500',
    citation: 'Basner et al., PNAS, 2013 (Mars-500, 520 days)',
    finding: 'Large individual differences in sleep and activity; one crew member drifted to a ~25 h cycle.',
    url: 'https://penntoday.upenn.edu/news/penn-medicine-520-day-simulated-mission-mars-reveals-critical-data-about-sleep-and-activity-nee',
  },
  co2Law2014: {
    id: 'co2Law2014',
    citation: 'Law et al., J. Occup. Environ. Med., 2014',
    finding: 'Each 1 mmHg of CO2 doubled the odds of headache on the ISS; ≤4 mmHg halved weekly risk.',
    url: 'https://ohsonline.com/articles/2014/05/12/study-indicates-co2-may-cause-astronauts-headaches.aspx',
  },
  fieldTest: {
    id: 'fieldTest',
    citation: 'NASA Field Test and Functional Task Test studies',
    finding: 'One day after landing, the functional course took 48% longer; deficits lasted up to a week.',
    url: 'https://www.nasa.gov/humans-in-space/walk-the-line-nasa-studies-physical-performance-after-spaceflight',
  },
  news2: {
    id: 'news2',
    citation: 'Royal College of Physicians, National Early Warning Score 2 (NEWS2), 2017',
    finding: 'Clinical bands for respiration, SpO2, blood pressure, pulse and temperature.',
    url: 'https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/',
  },
  hrpHazards: {
    id: 'hrpHazards',
    citation: 'NASA Human Research Program, the five hazards of human spaceflight',
    finding: 'Radiation, isolation, distance, gravity and hostile environments interact and can worsen each other.',
    url: 'https://www.nasa.gov/hrp/hazards',
  },
  pvtBrief: {
    id: 'pvtBrief',
    citation: 'Basner, Mollicone & Dinges, Acta Astronautica, 2011 (3-minute PVT-B)',
    finding: 'The brief 3-minute PVT uses 2 to 5 s intervals and counts reactions of 355 ms or more as lapses.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3197786/',
  },
  sleepNeed: {
    id: 'sleepNeed',
    citation: 'Watson et al., Sleep, 2015 (AASM and SRS consensus)',
    finding: 'Adults should sleep 7 hours or more per night on a regular basis.',
    url: 'https://jcsm.aasm.org/doi/10.5664/jcsm.4758',
  },
  stoneFluids: {
    id: 'stoneFluids',
    citation: 'Pearle et al., AUA Guideline on Medical Management of Kidney Stones, 2014',
    finding: 'Fluid intake should achieve a urine volume of at least 2.5 litres per day.',
    url: 'https://www.auanet.org/guidelines-and-quality/guidelines/kidney-stones-medical-mangement-guideline',
  },
  modifiedZ: {
    id: 'modifiedZ',
    citation: 'Iglewicz & Hoaglin, How to Detect and Handle Outliers, ASQC, 1993',
    finding: 'Modified z-score based on the median and MAD; values above 3.5 are potential outliers.',
    url: 'https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm',
  },
  eimo: {
    id: 'eimo',
    citation: 'Earth Independent Medical Operations (EIMO), PMC 10810302',
    finding: 'Mars one-way delay of about 3 to 22 minutes; medical decisions must move to the crew.',
    url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10810302/',
  },
} as const satisfies Record<string, Evidence>

export type EvidenceId = keyof typeof EVIDENCE

export function evidence(id: EvidenceId): Evidence {
  return EVIDENCE[id]
}

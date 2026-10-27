// Portuguese for the content the domain produces (alerts, scenarios, procedures, findings). The
// domain stays in English; these tables are looked up by id, so the rules never depend on language.

import type { Symptom } from '../domain/checkin'
import { EVIDENCE, type EvidenceId } from '../domain/evidence'
import { PROCEDURES, type Procedure } from '../domain/procedures'
import type { RadiationEnvironment } from '../domain/radiation'
import type { Alert, Severity } from '../domain/riskEngine'
import { UNITS, VITAL_NAMES, type ClinicalRisk, type VitalKind } from '../domain/vitals'
import type { Scenario } from '../sim/scenarios'
import type { Lang } from './messages'

const VITALS_PT: Record<VitalKind, string> = {
  heartRate: 'Frequência cardíaca',
  hrv: 'VFC',
  spo2: 'SpO2',
  systolic: 'PA sistólica',
  diastolic: 'PA diastólica',
  temperature: 'Temperatura',
  respiratoryRate: 'Frequência respiratória',
}

export function unitName(kind: VitalKind, lang: Lang): string {
  return lang === 'pt' && kind === 'respiratoryRate' ? 'resp/min' : UNITS[kind]
}

/** Decimal comma in Portuguese; numbers are never shown with a different precision per language. */
export function localNumber(value: number | string, lang: Lang): string {
  return lang === 'pt' ? String(value).replace('.', ',') : String(value)
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "16 nov, 07:00 UTC", the Portuguese form of the risk engine's time format. */
export function utcTimePt(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS_PT[d.getUTCMonth()]}, ${hh}:${mm} UTC`
}

export function vitalName(kind: VitalKind, lang: Lang): string {
  return lang === 'pt' ? VITALS_PT[kind] : VITAL_NAMES[kind]
}

export function featureName(feature: string, lang: Lang): string {
  return feature in VITAL_NAMES ? vitalName(feature as VitalKind, lang) : feature
}

const SEVERITY: Record<Lang, Record<Severity, string>> = {
  en: { info: 'Info', watch: 'Watch', warning: 'Warning', critical: 'Critical' },
  pt: { info: 'Info', watch: 'Atenção', warning: 'Alerta', critical: 'Crítico' },
}

export const severityName = (severity: Severity, lang: Lang) => SEVERITY[lang][severity]

const RISK: Record<Lang, Record<ClinicalRisk, string>> = {
  en: { low: 'low', 'low-medium': 'low-medium', medium: 'medium', high: 'high', incomplete: 'incomplete' },
  pt: { low: 'baixo', 'low-medium': 'baixo-médio', medium: 'médio', high: 'alto', incomplete: 'incompleto' },
}

export const riskName = (risk: ClinicalRisk, lang: Lang) => RISK[lang][risk]

const ENVIRONMENT: Record<Lang, Record<RadiationEnvironment, string>> = {
  en: { iss: 'ISS, low Earth orbit', lunar_orbit: 'Lunar orbit', mars_transit: 'Transit to Mars', mars_surface: 'Mars surface' },
  pt: { iss: 'ISS, órbita baixa', lunar_orbit: 'Órbita lunar', mars_transit: 'Trânsito para Marte', mars_surface: 'Superfície de Marte' },
}

export const environmentName = (env: RadiationEnvironment, lang: Lang) => ENVIRONMENT[lang][env]

const SYMPTOMS: Record<Lang, Record<Symptom, string>> = {
  en: {
    headache: 'Headache', nausea: 'Nausea', backPain: 'Back pain', congestion: 'Nasal congestion',
    visionChange: 'Change in vision', fever: 'Fever or chills', skinRash: 'Skin rash', coldSores: 'Cold sores',
    fatigue: 'Unusual fatigue', dizziness: 'Dizziness', chestPain: 'Chest pain', shortnessOfBreath: 'Shortness of breath',
  },
  pt: {
    headache: 'Dor de cabeça', nausea: 'Náusea', backPain: 'Dor nas costas', congestion: 'Congestão nasal',
    visionChange: 'Mudança na visão', fever: 'Febre ou calafrios', skinRash: 'Erupção na pele', coldSores: 'Herpes labial',
    fatigue: 'Cansaço incomum', dizziness: 'Tontura', chestPain: 'Dor no peito', shortnessOfBreath: 'Falta de ar',
  },
}

export const symptomName = (symptom: Symptom, lang: Lang) => SYMPTOMS[lang][symptom]

const ROLES_PT: Record<string, string> = {
  Commander: 'Comandante',
  'Flight engineer': 'Engenheiro de voo',
  'Crew medical officer': 'Oficial médico da tripulação',
}

export const roleName = (role: string, lang: Lang) => (lang === 'pt' ? (ROLES_PT[role] ?? role) : role)

const SCENARIOS_PT: Record<string, { title: string; description: string }> = {
  'healthy-iss': {
    title: 'Semana de rotina na ISS',
    description: 'Três semanas na ISS sem eventos: o sistema deve ficar em silêncio.',
  },
  'mars-solar-storm': {
    title: 'Tempestade solar em Marte (padrão de maio de 2024)',
    description: 'Estadia na superfície de Marte quando chega um evento de partículas como o que a Curiosity mediu em 20 de maio de 2024.',
  },
  'sleep-loss': {
    title: 'Cinco noites de sono curto',
    description: 'Um engenheiro de voo dorme cerca de duas horas a menos por cinco noites antes de uma tarefa crítica.',
  },
  'co2-excursion': {
    title: 'Pico de CO2 na cabine',
    description: 'Uma falha no filtro eleva o CO2 da cabine para 6 mmHg por quatro dias; dois tripulantes relatam dor de cabeça.',
  },
  infection: {
    title: 'Febre no oficial médico da tripulação',
    description: 'O oficial médico tem febre; qualquer tripulante precisa conseguir seguir o protocolo.',
  },
  'exercise-gap': {
    title: 'Sessões de exercício perdidas',
    description: 'A carga de trabalho reduz o exercício resistido a um quarto do prescrito e a ingestão de líquidos cai.',
  },
  'combined-transit': {
    title: 'Tudo ao mesmo tempo no trânsito para Marte',
    description: 'Sono curto, CO2 alto e uma tempestade solar se sobrepõem durante a viagem a Marte.',
  },
}

export function scenarioText(scenario: Scenario, lang: Lang): { title: string; description: string } {
  return lang === 'pt' ? (SCENARIOS_PT[scenario.id] ?? scenario) : scenario
}

const FINDINGS_PT: Record<EvidenceId, string> = {
  nasaStd3001Radiation: 'Limite de dose efetiva de carreira de 600 mSv; limite de 250 mSv por evento de partículas solares.',
  radlab: 'Taxas de dose absorvida medidas em µGy/h por detectores na ISS, na órbita lunar e na superfície de Marte.',
  berger2017: 'Até 286 µGy/dia absorvidos com 647 µSv/dia de dose equivalente (fator de qualidade ≈ 2,3).',
  zhang2020: '13,2 µGy/h absorvidos e 1.369 µSv/dia de dose equivalente (fator de qualidade ≈ 4,3).',
  hassler2014: '0,21 mGy/dia absorvidos e 0,64 mSv/dia de dose equivalente na superfície de Marte.',
  zeitlin2013: '1,84 mSv/dia de dose equivalente no cruzeiro interplanetário; uma missão a Marte de 180/500/180 dias ≈ 1 Sv.',
  noaaScales: 'S1 começa em 10 pfu de prótons ≥10 MeV; cada nível é dez vezes o anterior.',
  mars2024Storm: 'Em 20 de maio de 2024 a Curiosity mediu o maior pico de radiação desde o pouso.',
  boneLoss: 'Perda de massa óssea de cerca de 1 a 1,5% por mês em voo, muito mais rápida que na osteoporose.',
  exerciseLoading: 'Os tripulantes fizeram em média 43 min/dia de carga, embora 146,8 min estivessem previstos.',
  muscle6months: 'O volume da panturrilha caiu cerca de 13% e a potência máxima 32% após seis meses.',
  renalStone: 'A perda óssea eleva o cálcio circulante; exercício e hidratação reduzem o risco; ainda não há tratamento em missão.',
  orthostatic: 'Hipotensão e pré-síncope em 20 a 30% dos astronautas no retorno (dados da era do ônibus espacial).',
  jugular2019: '6 de 11 tripulantes tiveram fluxo jugular parado ou invertido por volta do 50º dia; um teve trombo.',
  sans: 'Cerca de 66% dos astronautas de longa duração mostram os primeiros sinais de SANS.',
  herpes2019: '61% dos astronautas da ISS eliminaram herpes-vírus reativados; poucos tiveram sintomas.',
  sleep2014: 'As tripulações da ISS dormiram cerca de 6,1 h por noite, embora 8,5 h estivessem programadas.',
  pvt: 'Um teste de vigilância psicomotora de 3 minutos mede a atenção; a perda de sono a degrada.',
  mars500: 'Grandes diferenças individuais de sono e atividade; um tripulante passou a um ciclo de ~25 h.',
  co2Law2014: 'Cada 1 mmHg de CO2 dobrou a chance de dor de cabeça na ISS; ≤4 mmHg reduziu o risco semanal à metade.',
  fieldTest: 'Um dia após o pouso, o circuito funcional levou 48% mais tempo; os déficits duraram até uma semana.',
  news2: 'Faixas clínicas para respiração, SpO2, pressão arterial, pulso e temperatura.',
  hrpHazards: 'Radiação, isolamento, distância, gravidade e ambientes hostis interagem e podem se agravar.',
  pvtBrief: 'O PVT breve de 3 minutos usa intervalos de 2 a 5 s e conta reações de 355 ms ou mais como lapsos.',
  sleepNeed: 'Adultos devem dormir 7 horas ou mais por noite regularmente.',
  stoneFluids: 'A ingestão de líquidos deve garantir pelo menos 2,5 litros de urina por dia.',
  modifiedZ: 'Escore z modificado baseado na mediana e no MAD; valores acima de 3,5 são possíveis outliers.',
  eimo: 'Atraso de ida a Marte de cerca de 3 a 22 minutos; as decisões médicas passam para a tripulação.',
}

export function finding(id: EvidenceId, lang: Lang): string {
  return lang === 'pt' ? FINDINGS_PT[id] : EVIDENCE[id].finding
}

type ProcedureText = Pick<Procedure, 'title' | 'when' | 'steps' | 'escalate'>

const PROCEDURES_PT: Record<string, ProcedureText> = {
  'measure-vitals': {
    title: 'Medir os sinais vitais em repouso',
    when: 'No check-in diário, ou quando um alerta pede novas medições.',
    steps: [
      'Sente-se ou prenda-se e descanse em silêncio por 5 minutos.',
      'Vista a roupa com sensores ou coloque o sensor no dedo; mantenha a mão parada.',
      'Registre frequência cardíaca, saturação de oxigênio, pressão arterial, temperatura e frequência respiratória.',
      'Se um valor parecer errado, espere 2 minutos e meça de novo antes de registrar.',
    ],
    escalate: 'Se a saturação de oxigênio estiver em 91% ou menos, ou se sentir dor no peito, chame o oficial médico agora.',
  },
  'solar-storm-shelter': {
    title: 'Evento de partículas solares: ir para o abrigo',
    when: 'Quando há alerta de tempestade de radiação solar (S1 ou mais) fora do campo magnético da Terra.',
    steps: [
      'Pare o trabalho não essencial e vá para a área mais blindada (abrigo, paredes de água ou de suprimentos).',
      'Leve o dosímetro pessoal e registre a hora de entrada.',
      'Fique até o alerta acabar; confira o nível de prótons a cada hora.',
      'Registre a hora de saída e a leitura do dosímetro.',
    ],
    escalate: 'Se alguém sentir náusea, vômito ou cansaço incomum durante o evento, avise o oficial médico.',
  },
  'vigilance-test': {
    title: 'Fazer o teste de vigilância de 3 minutos',
    when: 'Uma vez por dia, depois de sono curto, ou antes de uma tarefa crítica.',
    steps: [
      'Procure um lugar tranquilo e silencie as notificações.',
      'Aperte o botão ou a barra de espaço o mais rápido possível cada vez que ele acender; não aperte antes.',
      'Complete os 3 minutos; um teste interrompido não é pontuado.',
    ],
    escalate: 'Com 5 ou mais lapsos, adie tarefas críticas e repita o teste depois de descansar.',
  },
  'balance-tests': {
    title: 'Testes de campo de equilíbrio e mobilidade',
    when: 'Antes dos preparativos de pouso, de atividade extraveicular, ou quando sentir tontura.',
    steps: [
      'Sentar e levantar: sentado, levante e fique parado por 10 segundos; registre o tempo.',
      'Marcha em tandem: ande 10 passos, calcanhar na ponta do pé, em linha reta; conte os passos corretos.',
      'Andar e virar: ande 3 metros, vire e volte; registre o tempo.',
      'Tenha outro tripulante por perto em todos os testes, por segurança.',
    ],
    escalate: 'Se alguma tarefa estiver muito mais lenta que a sua referência, não faça saída da nave nem EVA sozinho.',
  },
  'visual-self-check': {
    title: 'Autoexame visual (grade de Amsler)',
    when: 'Quando notar qualquer mudança na visão.',
    steps: [
      'Segure a tela à distância de leitura, com iluminação normal.',
      'Cubra um olho e olhe para o ponto central.',
      'Anote linhas onduladas, faltando ou borradas; repita com o outro olho.',
    ],
    escalate: 'Relate qualquer mudança ao oficial médico; este é um autoexame, não um diagnóstico.',
  },
  'high-co2': {
    title: 'CO2 alto na cabine',
    when: 'Quando o CO2 da cabine passar de 4 mmHg, principalmente com dor de cabeça.',
    steps: [
      'Avise a tripulação e confira se o ventilador perto da sua área de trabalho está ligado.',
      'Afaste-se de lugares onde o ar fica parado (sacos de dormir, atrás de equipamentos).',
      'Faça pausas num módulo mais ventilado.',
    ],
    escalate: 'Se a dor de cabeça ou a confusão aumentarem, avise o comandante e o oficial médico.',
  },
  'fever-protocol': {
    title: 'Febre ou possível infecção',
    when: 'Quando a temperatura for 38 °C ou mais, ou aparecer herpes labial ou erupção na pele.',
    steps: [
      'Meça a temperatura agora e duas vezes por dia.',
      'Beba líquidos e descanse; reduza superfícies de contato compartilhadas.',
      'Registre os sintomas no check-in.',
    ],
    escalate: 'Se o oficial médico for quem está doente, outro tripulante segue este protocolo e chama o médico de voo.',
  },
  'exercise-hydration': {
    title: 'Proteger ossos e rins',
    when: 'Quando o exercício resistido ou a ingestão de líquidos estiverem abaixo da meta.',
    steps: [
      'Planeje as sessões de exercício resistido que faltam; a carga importa mais que a duração.',
      'Beba até chegar a cerca de 2,5 litros por dia.',
      'Registre os dois no check-in diário.',
    ],
    escalate: 'Dor nas costas ou no flanco com pouca ingestão de líquidos exige o oficial médico.',
  },
  'sleep-protection': {
    title: 'Proteger o próximo período de sono',
    when: 'Depois de duas ou mais noites com menos de 7 horas.',
    steps: [
      'Diminua a luz uma hora antes de dormir e evite telas.',
      'Evite exercício e cafeína nas últimas horas antes de dormir.',
      'Use máscara de olhos e protetor auricular; mantenha a área de dormir ventilada.',
    ],
    escalate: 'Se o sono curto continuar por uma semana, fale com o oficial médico.',
  },
  'chest-pain': {
    title: 'Dor no peito ou falta de ar',
    when: 'Imediatamente, sempre que esses sintomas aparecerem.',
    steps: [
      'Pare toda atividade e fique parado.',
      'Chame o oficial médico e outro tripulante.',
      'Meça os sinais vitais e continue medindo a cada 5 minutos.',
    ],
    escalate: 'É sempre urgente: chame o oficial médico e o médico de voo agora.',
  },
}

export function localProcedure(procedure: Procedure, lang: Lang): Procedure {
  const pt = lang === 'pt' ? PROCEDURES_PT[procedure.id] : undefined
  return pt ? { ...procedure, ...pt } : procedure
}

export function localProcedures(lang: Lang): Procedure[] {
  return PROCEDURES.map((p) => localProcedure(p, lang))
}

const STRESSORS_PT: Record<string, string> = {
  'solar radiation storm': 'tempestade de radiação solar',
  'sleep debt': 'débito de sono',
  'low exercise': 'pouco exercício',
  'high CO2': 'CO2 alto',
  'high stress': 'estresse alto',
}

const READINESS_PT: Record<string, string> = { 'not-ready': 'não apto', watch: 'atenção' }

const ruleOf = (alert: Alert) => alert.key.slice(alert.key.indexOf(':') + 1)
const num = (value: string | number | undefined) => String(value ?? '').replace('.', ',')

/** The alert worded for the reader. English is the domain's own text. */
export function alertText(alert: Alert, lang: Lang): { title: string; why: string; action: string } {
  if (lang === 'en') return alert
  const p = alert.params ?? {}
  const rule = ruleOf(alert)
  if (rule.startsWith('baseline-')) {
    const kind = p.kind as VitalKind
    return {
      title: `${vitalName(kind, 'pt')} ${p.direction === 'up' ? 'acima' : 'abaixo'} do seu normal`,
      why: `${p.count} leituras seguidas desde ${utcTimePt(String(p.since))} longe da sua mediana de ${num(p.median)} ${unitName(kind, 'pt')}.`,
      action: 'Veja como você se sente, repita a medição em repouso e registre qualquer sintoma.',
    }
  }
  switch (rule) {
    case 'news2-incomplete':
      return {
        title: 'Medições faltando',
        why: `Nenhuma leitura nas últimas 24 h de: ${String(p.missing ?? '').split(',').filter(Boolean).map((k) => vitalName(k as VitalKind, 'pt')).join(', ')}. Valor ausente nunca é tratado como normal.`,
        action: 'Faça as medições que faltam para completar a avaliação de hoje.',
      }
    case 'news2':
      return {
        title: `Escore de alerta precoce ${p.total} (${riskName(p.risk as ClinicalRisk, 'pt')})`,
        why: `Pontos do NEWS2: ${String(p.points ?? '').split(',').filter(Boolean).map((e) => { const [k, v] = e.split(':'); return `${vitalName(k as VitalKind, 'pt')} +${v}` }).join(', ')}.`,
        action: p.critical
          ? 'Chame o oficial médico agora e repita as medições.'
          : 'Repita as medições em até uma hora e avise o oficial médico.',
      }
    case 'proton-storm':
      return {
        title: `Tempestade de radiação solar S${p.level}`,
        why: p.shielded
          ? 'A ISS é protegida em parte pelo campo magnético da Terra, mas a dose ainda pode subir.'
          : 'Fora do campo magnético da Terra, um evento de partículas solares pode dar uma dose alta em horas.',
        action: p.shielded
          ? 'Siga as regras de voo para eventos solares e limite o tempo nos módulos menos blindados.'
          : 'Vá para o abrigo agora e fique até o alerta acabar.',
      }
    case 'career-dose':
      return {
        title: `Dose de carreira em ${p.pct}% do limite da NASA`,
        why: `${num(p.msv)} mSv acumulados; o limite de carreira é 600 mSv.`,
        action: 'Revise o planejamento de exposição com o médico de voo e reduza a exposição opcional.',
      }
    case 'sleep':
      return {
        title: `Sono com média de ${num(p.avg)} h`,
        why: `${p.short} de ${p.nights} noites abaixo de 7 h; ${num(p.debt)} h de débito nesta semana.`,
        action: 'Proteja o próximo período de sono: pouca luz, menos telas e nada de exercício tarde.',
      }
    case 'vigilance':
      return {
        title: `Vigilância abaixo do normal (${p.lapses} lapsos)`,
        why: `Reação mediana de ${p.median} ms, desempenho ${num(p.performance)}.`,
        action: 'Evite tarefas críticas por enquanto, descanse e repita o teste de 3 minutos depois.',
      }
    case 'exercise':
      return {
        title: `Exercício resistido em ${p.pct}% do prescrito`,
        why: `${p.done} de ${p.prescribed} min com carga nesta semana. Em voo, o osso pode perder de 1 a 1,5% por mês.`,
        action: 'Planeje as sessões de exercício resistido que faltam; a carga importa mais que a duração.',
      }
    case 'hydration':
      return {
        title: `Hidratação com média de ${p.ml} ml/dia`,
        why: 'A perda óssea aumenta o cálcio na urina; pouca ingestão de líquidos soma risco de cálculo renal, que não pode ser tratado em voo.',
        action: `Beba o suficiente para chegar a cerca de ${p.target} ml por dia.`,
      }
    case 'co2':
      return {
        title: `CO2 na cabine em ${num(p.mmhg)} mmHg`,
        why: `Na ISS, cada 1 mmHg dobrou a chance de dor de cabeça: cerca de ${num(p.odds)}x a chance na meta de 4 mmHg.`,
        action: 'Avise a tripulação; confira a ventilação perto da sua área de trabalho e faça pausas em módulos mais ventilados.',
      }
    case 'cardiopulmonary-symptom':
      return {
        title: 'Dor no peito ou falta de ar relatada',
        why: 'Esses sintomas precisam de avaliação médica imediata.',
        action: 'Pare a atividade e chame o oficial médico agora.',
      }
    case 'vision':
      return {
        title: 'Mudança na visão relatada',
        why: 'Cerca de 66% dos astronautas de longa duração mostram sinais iniciais de SANS.',
        action: 'Faça o autoexame visual e relate ao oficial médico.',
      }
    case 'immune':
      return {
        title: 'Possível sintoma imunológico',
        why: 'O voo espacial enfraquece o controle imunológico; 61% dos astronautas da ISS eliminam herpes-vírus reativados.',
        action: 'Registre a temperatura duas vezes por dia e avise o oficial médico se persistir.',
      }
    case 'dizziness':
      return {
        title: 'Tontura relatada',
        why: 'A intolerância ortostática afeta de 20 a 30% dos astronautas na volta à gravidade.',
        action: 'Sente-se ou deite, beba líquidos e evite mudanças bruscas de posição.',
      }
    case 'sensorimotor':
      return {
        title: `Equilíbrio e mobilidade: ${READINESS_PT[String(p.readiness)] ?? p.readiness}`,
        why: 'Depois de missões longas, as tarefas de campo levaram 48% mais tempo um dia após o pouso.',
        action: 'Não faça saída da nave nem EVA sozinho; repita os testes de campo depois de descansar.',
      }
    case 'combined':
      return {
        title: `${p.count} fatores de estresse ao mesmo tempo`,
        why: `Ativos juntos: ${String(p.stressors ?? '').split(',').filter(Boolean).map((s) => STRESSORS_PT[s] ?? s).join(', ')}. Os riscos do voo espacial interagem e podem se agravar.`,
        action: 'Trate primeiro o item mais grave e reduza a carga de trabalho até melhorarem.',
      }
    default:
      return alert
  }
}

// Isolation Forest scoring, written to match scikit-learn's score_samples exactly, so the model
// trained in Python runs in the browser with no AI runtime, no network and no paid service.

import { z } from 'zod'

const treeSchema = z.object({
  left: z.array(z.number().int()),
  right: z.array(z.number().int()),
  feature: z.array(z.number().int()),
  threshold: z.array(z.number()),
  samples: z.array(z.number().int().nonnegative()),
})

export const modelSchema = z.object({
  version: z.string(),
  kind: z.literal('isolation-forest'),
  features: z.array(z.string()).min(1),
  maxSamples: z.number().int().positive(),
  threshold: z.number(),
  trees: z.array(treeSchema).min(1),
  trainedOn: z.string(),
  metrics: z.record(z.string(), z.unknown()),
})

export type AnomalyModel = z.infer<typeof modelSchema>
type Tree = z.infer<typeof treeSchema>

const EULER_GAMMA = 0.5772156649

/** Average path length of an unsuccessful search in a binary search tree (sklearn's c(n)). */
export function averagePathLength(n: number): number {
  if (n <= 1) return 0
  if (n === 2) return 1
  return 2 * (Math.log(n - 1) + EULER_GAMMA) - (2 * (n - 1)) / n
}

function pathLength(tree: Tree, x: readonly number[]): number {
  let node = 0
  let depth = 0
  while (tree.left[node] !== -1) {
    const feature = tree.feature[node]!
    node = x[feature]! <= tree.threshold[node]! ? tree.left[node]! : tree.right[node]!
    depth++
  }
  return depth + averagePathLength(tree.samples[node]!)
}

export function loadModel(json: unknown): AnomalyModel {
  const model = modelSchema.parse(json)
  for (const tree of model.trees) {
    const n = tree.left.length
    const consistent = [tree.right, tree.feature, tree.threshold, tree.samples].every((a) => a.length === n)
    const inBounds = [...tree.left, ...tree.right].every((i) => i === -1 || (i > 0 && i < n))
    const features = tree.feature.every((f, i) => tree.left[i] === -1 || (f >= 0 && f < model.features.length))
    if (!consistent || !inBounds || !features) throw new Error('Model file is malformed')
  }
  return model
}

/** Higher means more anomalous; equals -sklearn.score_samples(x). */
export function anomalyScore(model: AnomalyModel, x: readonly number[]): number {
  if (x.length !== model.features.length || x.some((v) => !Number.isFinite(v))) {
    throw new RangeError(`expected ${model.features.length} finite features`)
  }
  const mean = model.trees.reduce((sum, tree) => sum + pathLength(tree, x), 0) / model.trees.length
  return 2 ** (-mean / averagePathLength(model.maxSamples))
}

export interface AnomalyResult {
  score: number
  anomalous: boolean
  /** Signals furthest from the personal normal, as a plain explanation of the score. */
  drivers: { feature: string; deviation: number }[]
}

export function assess(model: AnomalyModel, x: readonly number[]): AnomalyResult {
  const score = anomalyScore(model, x)
  const drivers = model.features
    .map((feature, i) => ({ feature, deviation: x[i]! }))
    .filter((d) => !d.feature.endsWith('Deviation'))
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
    .slice(0, 3)
  return { score, anomalous: score >= model.threshold, drivers }
}

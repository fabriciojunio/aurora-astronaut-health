import { useEffect, useRef, useState } from 'react'
import { applyBatch, emptyGround, type Batch, type Delivery, type GroundState } from '../sync/outbox'

// Simulates the ground station receiving batches after the real one-way light delay. The ground
// checks every signature with the device's public key and keeps only valid batches.
export function useGroundLink(publicKey: CryptoKey) {
  const [pending, setPending] = useState<Delivery[]>([])
  const [ground, setGround] = useState<GroundState>(emptyGround)
  const groundChain = useRef<Promise<GroundState>>(Promise.resolve(emptyGround()))
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const active = timers.current
    return () => {
      for (const t of active.values()) clearTimeout(t)
    }
  }, [])

  function deliver(delivery: Delivery) {
    clearTimeout(timers.current.get(delivery.batch.batchId))
    timers.current.delete(delivery.batch.batchId)
    setPending((list) => list.filter((d) => d.batch.batchId !== delivery.batch.batchId))
    // Batches are applied one after another so a slow signature check cannot reorder them.
    groundChain.current = groundChain.current.then(async (state) => {
      const next = await applyBatch(state, delivery.batch, publicKey)
      setGround(next)
      return next
    })
  }

  function send(batch: Batch, delayMs: number, now = Date.now()) {
    const delivery: Delivery = { batch, sentAt: now, arrivesAt: now + delayMs }
    setPending((list) => [...list, delivery])
    timers.current.set(batch.batchId, setTimeout(() => deliver(delivery), delayMs))
  }

  function deliverAllNow() {
    for (const d of pending) deliver(d)
  }

  return { pending, ground, send, deliverAllNow }
}

export type GroundLink = ReturnType<typeof useGroundLink>

import { useEffect, useRef } from 'react'

// A shared tablet left open would show another person's health data, so the vault locks itself.
export const IDLE_LOCK_MS = 5 * 60_000
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export function useIdleLock(onIdle: () => void, timeoutMs = IDLE_LOCK_MS): void {
  const callback = useRef(onIdle)
  useEffect(() => {
    callback.current = onIdle
  })

  useEffect(() => {
    let timer = setTimeout(() => callback.current(), timeoutMs)
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => callback.current(), timeoutMs)
    }
    for (const event of ACTIVITY) window.addEventListener(event, reset, { passive: true })
    return () => {
      clearTimeout(timer)
      for (const event of ACTIVITY) window.removeEventListener(event, reset)
    }
  }, [timeoutMs])
}

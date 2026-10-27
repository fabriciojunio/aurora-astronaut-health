// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react'
import { IDLE_LOCK_MS, useIdleLock } from './useIdleLock'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('idle lock', () => {
  it('locks after five minutes without input', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLock(onIdle))
    vi.advanceTimersByTime(IDLE_LOCK_MS - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('restarts the countdown on any key, tap or scroll', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLock(onIdle))
    for (const fire of [() => fireEvent.keyDown(window), () => fireEvent.pointerDown(window), () => fireEvent.wheel(window)]) {
      vi.advanceTimersByTime(IDLE_LOCK_MS - 1_000)
      fire()
    }
    vi.advanceTimersByTime(IDLE_LOCK_MS - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('calls the latest callback and stops listening once unmounted', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = renderHook(({ cb }) => useIdleLock(cb), { initialProps: { cb: first } })
    rerender({ cb: second })
    vi.advanceTimersByTime(IDLE_LOCK_MS)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    unmount()
    vi.advanceTimersByTime(IDLE_LOCK_MS * 2)
    expect(second).toHaveBeenCalledOnce()
  })
})

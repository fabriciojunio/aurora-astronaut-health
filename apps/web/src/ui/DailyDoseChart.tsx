import { useId, useState } from 'react'
import type { DailyDose } from '../domain/radiation'

interface Props {
  title: string
  days: readonly DailyDose[]
  spikes: ReadonlySet<string>
}

const WIDTH = 320
const HEIGHT = 150
const PAD = { top: 18, right: 6, bottom: 20, left: 34 }
const GAP = 2

function niceStep(max: number): number {
  const raw = max / 3
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
}

/** Bar with a 4px rounded top and a square base on the axis. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

const shortDate = (date: string) => `${Number(date.slice(8, 10))} May`

// Each environment gets its own scale: the lunar storm peak is about 100 times a quiet day on Mars,
// so a shared axis would flatten two of the three charts.
export function DailyDoseChart({ title, days, spikes }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const captionId = useId()
  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const maxUgy = Math.max(...days.map((d) => d.absorbedUgy), 1)
  const peak = days.findIndex((d) => d.absorbedUgy === maxUgy)
  const step = niceStep(maxUgy)
  const top = Math.ceil(maxUgy / step) * step
  const slot = plotW / Math.max(days.length, 1)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const hovered = hover === null ? undefined : days[hover]

  return (
    <figure className="chart" aria-labelledby={captionId}>
      <figcaption id={captionId}>{title}</figcaption>
      <div className="chart-plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${title}: daily absorbed dose for ${days.length} days, ${spikes.size} spike ${spikes.size === 1 ? 'day' : 'days'}. Values in the table below.`}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
              <text x={PAD.left - 4} y={y(t) + 3} className="tick" textAnchor="end">
                {t >= 1000 ? `${t / 1000}k` : t}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = PAD.left + i * slot + GAP / 2
            const h = Math.max(plotH - (y(d.absorbedUgy) - PAD.top), 1)
            const spike = spikes.has(d.date)
            return (
              <g key={d.date}>
                <path
                  d={barPath(x, PAD.top + plotH - h, Math.max(slot - GAP, 1), h)}
                  className={spike ? 'bar spike' : hover === i ? 'bar active' : 'bar'}
                />
                {spike && i === peak && (
                  <text x={x + slot / 2} y={PAD.top + plotH - h - 5} className="bar-label" textAnchor="middle">
                    {shortDate(d.date)}
                  </text>
                )}
                {/* Full-height hit area: thin bars are hard to hover. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                />
              </g>
            )
          })}
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} className="axis" />
          {days.length > 0 && (
            <>
              <text x={PAD.left} y={HEIGHT - 4} className="tick">
                {shortDate(days[0]!.date)}
              </text>
              <text x={WIDTH - PAD.right} y={HEIGHT - 4} className="tick" textAnchor="end">
                {shortDate(days[days.length - 1]!.date)}
              </text>
            </>
          )}
        </svg>
        {hovered && hover !== null && (
          <div
            className="tooltip"
            style={{ left: `${((PAD.left + (hover + 0.5) * slot) / WIDTH) * 100}%` }}
            role="status"
          >
            <strong>{shortDate(hovered.date)} 2024</strong>
            <span>{hovered.absorbedUgy} µGy absorbed</span>
            <span>≈ {hovered.equivalentUsv} µSv equivalent (est.)</span>
            {hovered.hoursCovered < 24 && <span className="muted">{hovered.hoursCovered} of 24 h measured</span>}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Absorbed (µGy)</th>
              <th scope="col">Equivalent, est. (µSv)</th>
              <th scope="col">Hours measured</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{d.absorbedUgy}</td>
                <td>{d.equivalentUsv}</td>
                <td>{d.hoursCovered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

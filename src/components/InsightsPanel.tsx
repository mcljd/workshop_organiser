import type { Analysis } from '../analyse'

interface Props {
  analysis: Analysis
  onSelectItem: (id: string) => void
  onOptimise: () => void
}

/** The "AI" panel: a live efficiency score plus ranked, clickable insights. */
export function InsightsPanel({ analysis, onSelectItem, onOptimise }: Props) {
  const { score, insights, metrics } = analysis
  const band = score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad'

  return (
    <section className="insights" aria-label="Efficiency insights">
      <div className="insights-head">
        <h3>Efficiency</h3>
        <span className="ai-badge">AI assist</span>
      </div>

      <div className={`score score-${band}`} aria-live="polite">
        <div className="score-num" aria-label={`Efficiency score ${score} out of 100`}>
          {score}
        </div>
        <div className="score-meta">
          <div className="score-bar" role="presentation">
            <span style={{ width: `${score}%` }} />
          </div>
          <span className="muted">
            {metrics.items} items · {metrics.ready} ready · {metrics.blocked} blocked
          </span>
        </div>
      </div>

      <button className="optimise-btn" onClick={onOptimise}>
        ✨ Optimise layout
      </button>

      <ul className="insight-list" aria-live="polite">
        {insights.map((it) => {
          const clickable = !!it.itemId
          return (
            <li
              key={it.id}
              className={`insight insight-${it.severity} ${clickable ? 'clickable' : ''}`}
              onClick={() => it.itemId && onSelectItem(it.itemId)}
              onKeyDown={(e) => {
                if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onSelectItem(it.itemId!)
                }
              }}
              tabIndex={clickable ? 0 : undefined}
              role={clickable ? 'button' : undefined}
            >
              <span className="dot" />
              <span>{it.message}</span>
            </li>
          )
        })}
      </ul>

      <p className="insights-foot muted">
        Updates live as you move things. “Optimise” rearranges to clear aisles, separate
        overlaps and send ready jobs to the exit — the seed of the workflow assistant
        that will learn from real movement and camera data.
      </p>
    </section>
  )
}

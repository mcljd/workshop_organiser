import type { Analysis } from '../analyse'

interface Props {
  analysis: Analysis
  onSelectItem: (id: string) => void
}

/** The "AI" panel: a live efficiency score plus ranked, clickable insights. */
export function InsightsPanel({ analysis, onSelectItem }: Props) {
  const { score, insights, metrics } = analysis
  const band = score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad'

  return (
    <div className="insights">
      <div className="insights-head">
        <h3>Efficiency</h3>
        <span className="ai-badge">AI assist · preview</span>
      </div>

      <div className={`score score-${band}`}>
        <div className="score-num">{score}</div>
        <div className="score-meta">
          <div className="score-bar">
            <span style={{ width: `${score}%` }} />
          </div>
          <span className="muted">
            {metrics.items} items · {metrics.ready} ready · {metrics.blocked} blocked
          </span>
        </div>
      </div>

      <ul className="insight-list">
        {insights.map((it) => (
          <li
            key={it.id}
            className={`insight insight-${it.severity} ${it.itemId ? 'clickable' : ''}`}
            onClick={() => it.itemId && onSelectItem(it.itemId)}
          >
            <span className="dot" />
            <span>{it.message}</span>
          </li>
        ))}
      </ul>

      <p className="insights-foot muted">
        Updates live as you move things. This previews the workflow assistant — today
        it’s transparent rules; next it learns from real movement and camera data.
      </p>
    </div>
  )
}

import { useRef, useState } from 'react'

interface Props {
  onRun: (dataUrl: string, labels: string[]) => void
  onClose: () => void
}

const SUGGESTED = ['boat', 'trailer', 'car', 'forklift', 'shipping container', 'ladder', 'pallet']

/** Collects an image + the things to look for, then hands off to the model. */
export function SmartFindDialog({ onRun, onClose }: Props) {
  const [labels, setLabels] = useState('boat, trailer, car, forklift')
  const [preview, setPreview] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  function pick(file: File | undefined) {
    if (!file) return
    const r = new FileReader()
    r.onload = () => setPreview(String(r.result))
    r.readAsDataURL(file)
  }

  function run() {
    if (!preview) return
    const list = labels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (list.length === 0) return
    onRun(preview, list)
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Smart find">
      <div className="wizard add-dialog">
        <button className="wizard-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="wizard-body">
          <div className="wizard-kicker">Smart find · on-device AI</div>
          <h1>Find anything by name</h1>
          <p className="lead">
            Type what to look for and pick a photo. A zero-shot AI model finds those things —
            even ones it was never specifically trained on. Runs on your device; the model
            downloads once (no account, no cost).
          </p>

          <label className="wfield">
            <span>Look for (comma-separated)</span>
            <input value={labels} onChange={(e) => setLabels(e.target.value)} />
          </label>
          <div className="suggest-row">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                className="suggest"
                onClick={() =>
                  setLabels((l) => (l.trim() ? `${l}, ${s}` : s))
                }
              >
                + {s}
              </button>
            ))}
          </div>

          <div className="wfield">
            <span>Photo</span>
            <div className="upload-card" onClick={() => fileInput.current?.click()}>
              {preview ? (
                <img src={preview} alt="Selected" />
              ) : (
                <>
                  <span className="upload-icon">📷</span>
                  <strong>Choose or take a photo</strong>
                </>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          <div className="wizard-actions">
            <button className="primary" disabled={!preview} onClick={run}>
              Find them
            </button>
            <button className="ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

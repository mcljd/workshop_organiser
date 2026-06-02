import { useEffect, useRef, useState } from 'react'
import type { WorkshopState } from '../types'
import {
  generateWorkshop,
  layoutItems,
  type SpaceSize,
  type SpaceType,
  type WizardAnswers,
} from '../generate'
import { analyzeFloorPlan } from '../vision'
import { seedItemDates } from '../manager'

interface Props {
  onClose: () => void
  onBuild: (state: WorkshopState) => void
}

const TYPES: { key: SpaceType; label: string; emoji: string }[] = [
  { key: 'boatyard', label: 'Boatyard', emoji: '⛵' },
  { key: 'garage', label: 'Garage', emoji: '🚗' },
  { key: 'warehouse', label: 'Warehouse', emoji: '📦' },
  { key: 'other', label: 'Other', emoji: '🏭' },
]

const SIZES: { key: SpaceSize; label: string; hint: string }[] = [
  { key: 'small', label: 'Small', hint: 'a few bays' },
  { key: 'medium', label: 'Medium', hint: 'a yard / unit' },
  { key: 'large', label: 'Large', hint: 'a big site' },
]

/** Multi-step onboarding: intro → upload → questions → build. */
export function Onboarding({ onClose, onBuild }: Props) {
  const [step, setStep] = useState(0)
  const [floorImage, setFloorImage] = useState<string | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [answers, setAnswers] = useState<Omit<WizardAnswers, 'floorImage'>>({
    name: '',
    type: 'boatyard',
    size: 'medium',
    count: 8,
    noun: '',
  })
  const planInput = useRef<HTMLInputElement | null>(null)
  const photoInput = useRef<HTMLInputElement | null>(null)
  const cameraInput = useRef<HTMLInputElement | null>(null)

  // Let Escape close the wizard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function readFile(file: File, cb: (dataUrl: string) => void) {
    const r = new FileReader()
    r.onload = () => cb(String(r.result))
    r.readAsDataURL(file)
  }

  const [building, setBuilding] = useState('Building your 3D workshop…')

  async function build() {
    setStep(3)
    // If they uploaded a floor plan, read it with the in-browser vision engine
    // and place the detected doors/objects; otherwise use the template.
    if (floorImage) {
      try {
        setBuilding('Reading your floor plan…')
        const det = await analyzeFloorPlan(floorImage)
        const isBoat = answers.type === 'boatyard'
        const noun = answers.noun.trim() || (isBoat ? 'Boat' : 'Item')
        const boats = layoutItems(
          answers.count,
          noun,
          isBoat,
          det.floorWidth,
          det.floorHeight,
        )
        const merged = [...det.items, ...boats]
        seedItemDates(merged)
        onBuild({
          version: 2,
          name: answers.name.trim() || 'My Workshop',
          floor: { imageDataUrl: floorImage, width: det.floorWidth, height: det.floorHeight },
          zones: det.zones,
          items: merged,
        })
        return
      } catch {
        // Reading failed — fall back to a generated template.
      }
    }
    onBuild(generateWorkshop({ ...answers, floorImage }))
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Set up your workshop">
      <div className="wizard">
        <button className="wizard-close" onClick={onClose} aria-label="Close setup">
          ✕
        </button>

        {step === 0 && (
          <div className="wizard-body">
            <div className="wizard-kicker">Workshop Organiser</div>
            <h1>Turn your space into a live 3D organiser</h1>
            <p className="lead">
              Upload a floor plan and photos, answer a couple of questions, and we’ll
              build an interactive 3D model of your workshop — then help you arrange it
              and spot ways to work more efficiently.
            </p>
            <div className="wizard-steps-preview">
              <span>1 · Upload</span>
              <span>2 · Tell us about it</span>
              <span>3 · Get your 3D view</span>
            </div>
            <div className="wizard-actions">
              <button className="primary" autoFocus onClick={() => setStep(1)}>
                Build from my space
              </button>
              <button className="ghost" onClick={onClose}>
                Explore the live demo first
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-body">
            <div className="wizard-kicker">Step 1 of 3</div>
            <h1>Upload what you’ve got</h1>
            <p className="lead">
              A floor plan works best (it becomes the floor of your 3D model). Photos
              help us picture the space. Don’t have them handy? You can skip.
            </p>

            <div className="upload-row">
              <div className="upload-card" onClick={() => planInput.current?.click()}>
                {floorImage ? (
                  <img src={floorImage} alt="Floor plan" />
                ) : (
                  <>
                    <span className="upload-icon">🗺️</span>
                    <strong>Floor plan</strong>
                    <span className="muted">PNG / JPG</span>
                  </>
                )}
              </div>

              <div className="upload-card" onClick={() => photoInput.current?.click()}>
                {photos.length ? (
                  <div className="photo-stack">
                    {photos.slice(0, 4).map((p, i) => (
                      <img key={i} src={p} alt="" />
                    ))}
                    <span className="muted">{photos.length} photo(s)</span>
                  </div>
                ) : (
                  <>
                    <span className="upload-icon">📷</span>
                    <strong>Photos</strong>
                    <span className="muted">optional, multiple</span>
                  </>
                )}
              </div>
            </div>

            <input
              ref={planInput}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) readFile(f, setFloorImage)
                e.target.value = ''
              }}
            />
            <input
              ref={photoInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                Array.from(e.target.files ?? []).forEach((f) =>
                  readFile(f, (d) => setPhotos((p) => [...p, d])),
                )
                e.target.value = ''
              }}
            />

            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                Array.from(e.target.files ?? []).forEach((f) =>
                  readFile(f, (d) => setPhotos((p) => [...p, d])),
                )
                e.target.value = ''
              }}
            />

            <div className="wizard-actions">
              <button className="primary" onClick={() => setStep(2)}>
                Next
              </button>
              <button className="ghost camera-btn" onClick={() => cameraInput.current?.click()}>
                📷 Take a photo
              </button>
              <button className="ghost" onClick={() => setStep(2)}>
                Skip
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-body">
            <div className="wizard-kicker">Step 2 of 3</div>
            <h1>Tell us about your space</h1>

            <label className="wfield">
              <span>Business / space name</span>
              <input
                type="text"
                placeholder="e.g. Redbay Boats"
                value={answers.name}
                onChange={(e) => setAnswers({ ...answers, name: e.target.value })}
              />
            </label>

            <div className="wfield">
              <span>What kind of space is it?</span>
              <div className="choice-grid">
                {TYPES.map((t) => (
                  <button
                    key={t.key}
                    className={`choice ${answers.type === t.key ? 'active' : ''}`}
                    onClick={() => setAnswers({ ...answers, type: t.key })}
                  >
                    <span className="choice-emoji">{t.emoji}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="wfield">
              <span>Roughly how big?</span>
              <div className="choice-grid three">
                {SIZES.map((s) => (
                  <button
                    key={s.key}
                    className={`choice ${answers.size === s.key ? 'active' : ''}`}
                    onClick={() => setAnswers({ ...answers, size: s.key })}
                  >
                    <strong>{s.label}</strong>
                    <span className="muted">{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="wfield-row">
              <label className="wfield">
                <span>How many items to track?</span>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={answers.count}
                  onChange={(e) =>
                    setAnswers({ ...answers, count: Number(e.target.value) })
                  }
                />
              </label>
              <label className="wfield">
                <span>What do you call them?</span>
                <input
                  type="text"
                  placeholder="Boat / Vehicle / Pallet"
                  value={answers.noun}
                  onChange={(e) => setAnswers({ ...answers, noun: e.target.value })}
                />
              </label>
            </div>

            <div className="wizard-actions">
              <button className="primary" onClick={build}>
                Build my 3D view
              </button>
              <button className="ghost" onClick={() => setStep(1)}>
                Back
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-body building">
            <div className="spinner" />
            <h1>{building}</h1>
            <p className="lead">
              {floorImage
                ? 'Finding walls, doors and objects in your plan, then placing them in 3D.'
                : 'Placing zones and items from your answers.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

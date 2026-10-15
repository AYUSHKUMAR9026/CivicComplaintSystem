import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, ScanLine, AlertTriangle, Info, CheckCircle, XCircle, Timer } from 'lucide-react'
import { Card, CardContent, Alert, Badge } from '../components/UI'
import { detectAPI } from '../services/api'
import { formatErrorMessage } from '../utils/helpers'

// Curated so the demo shows the model's real behaviour, including its limits.
const SAMPLES = [
  { file: 'road-pothole.jpg', label: 'Road pothole', note: 'Clear detection' },
  { file: 'road-rough.jpg', label: 'Damaged surface', note: 'Lower confidence' },
  { file: 'road-cracks.jpg', label: 'Cracked street', note: 'Cracks, not a pothole' },
  { file: 'closeup-pothole.jpg', label: 'Close-up photo', note: 'Out of distribution' },
  { file: 'no-damage.jpg', label: 'No road damage', note: 'Negative control' },
]

const MAX_BYTES = 10 * 1024 * 1024

function confidenceTone(value) {
  if (value >= 0.5) return 'bg-emerald-500'
  if (value >= 0.3) return 'bg-amber-500'
  return 'bg-rose-500'
}

export function DetectionDemoPage() {
  const [imageUrl, setImageUrl] = useState(null)
  const [imageName, setImageName] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confidence, setConfidence] = useState(0.4)
  const [elapsedMs, setElapsedMs] = useState(null)
  const [health, setHealth] = useState(null)
  const [hovered, setHovered] = useState(null)
  const objectUrlRef = useRef(null)
  const lastFileRef = useRef(null)

  useEffect(() => {
    detectAPI.health()
      .then((res) => setHealth(res.data))
      .catch(() => setHealth({ reachable: false, detail: 'Could not reach the backend.' }))
  }, [])

  // Revoke the previous blob URL only after a new image replaces it.
  const setPreview = useCallback((url, name) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = url.startsWith('blob:') ? url : null
    setImageUrl(url)
    setImageName(name)
  }, [])

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  const runDetection = useCallback(async (file, conf) => {
    setLoading(true)
    setError('')
    setResult(null)
    const started = performance.now()
    try {
      const response = await detectAPI.road(file, conf)
      setResult(response.data)
      setElapsedMs(Math.round(performance.now() - started))
    } catch (err) {
      setError(formatErrorMessage(err, 'Detection failed. Is the AI service running on port 8001?'))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be at most 10 MB.')
      return
    }
    lastFileRef.current = file
    setPreview(URL.createObjectURL(file), file.name)
    await runDetection(file, confidence)
  }, [confidence, runDetection, setPreview])

  const handleSample = useCallback(async (sample) => {
    setError('')
    try {
      const response = await fetch(`/samples/${sample.file}`)
      if (!response.ok) throw new Error(`Could not load sample (${response.status})`)
      const blob = await response.blob()
      const file = new File([blob], sample.file, { type: blob.type || 'image/jpeg' })
      lastFileRef.current = file
      setPreview(`/samples/${sample.file}`, sample.label)
      await runDetection(file, confidence)
    } catch (err) {
      setError(formatErrorMessage(err, 'Could not load that sample image.'))
    }
  }, [confidence, runDetection, setPreview])

  const rerunAtConfidence = useCallback(() => {
    if (lastFileRef.current) runDetection(lastFileRef.current, confidence)
  }, [confidence, runDetection])

  const detections = result?.detections ?? []
  const potholes = detections.filter((d) => d.is_pothole)
  const imageWidth = result?.image?.width
  const imageHeight = result?.image?.height

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <ScanLine className="h-7 w-7 text-primary-500" />
          <h1 className="text-heading-lg font-bold text-text-primary">Road Damage Detection</h1>
          <Badge variant="default">Experimental</Badge>
        </div>
        <p className="text-body text-text-secondary mt-2">
          Live computer vision on road photographs, running the hosted{' '}
          <code className="text-body-sm">{health?.road_model?.model_id ?? 'road damage'}</code> model.
        </p>
      </div>

      {health && !health.reachable && (
        <Alert variant="warning" title="Detection service unavailable" className="mb-6">
          {health.detail}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" title="Detection error" className="mb-6" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: image and overlay */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4">
              <label
                htmlFor="detect-upload"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]) }}
                className="flex items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl py-4 cursor-pointer hover:border-primary-500 transition-colors"
              >
                <Upload className="h-5 w-5 text-text-secondary" />
                <span className="text-body-sm text-text-secondary">
                  Drop a road photo here, or click to choose (max 10 MB)
                </span>
              </label>
              <input
                id="detect-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />

              <div className="mt-4 relative bg-surface-elevated rounded-xl overflow-hidden min-h-[240px] flex items-center justify-center">
                {imageUrl ? (
                  <>
                    <img src={imageUrl} alt={imageName} className="w-full h-auto block" />
                    {/* Boxes are positioned in percentages so they scale with the image. */}
                    {imageWidth > 0 && imageHeight > 0 && detections.map((det, index) => {
                      const [left, top, right, bottom] = det.xyxy
                      const active = hovered === index
                      return (
                        <div
                          key={index}
                          onMouseEnter={() => setHovered(index)}
                          onMouseLeave={() => setHovered(null)}
                          className={`absolute border-2 transition-all ${
                            det.is_pothole ? 'border-rose-500' : 'border-amber-400'
                          } ${active ? 'ring-2 ring-white/70' : ''}`}
                          style={{
                            left: `${(left / imageWidth) * 100}%`,
                            top: `${(top / imageHeight) * 100}%`,
                            width: `${((right - left) / imageWidth) * 100}%`,
                            height: `${((bottom - top) / imageHeight) * 100}%`,
                          }}
                        >
                          <span
                            className={`absolute -top-6 left-0 whitespace-nowrap px-1.5 py-0.5 text-xs font-semibold text-white rounded ${
                              det.is_pothole ? 'bg-rose-500' : 'bg-amber-500'
                            }`}
                          >
                            {det.class_name} {(det.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      )
                    })}
                    {loading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="text-center">
                          <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full mx-auto" />
                          <p className="text-white text-body-sm mt-3">Running inference…</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-body-sm text-text-secondary py-16">
                    Choose a sample below or upload a photo to begin.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Samples */}
          <div>
            <h2 className="text-heading-sm font-semibold text-text-primary mb-3">Sample images</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.file}
                  type="button"
                  onClick={() => handleSample(sample)}
                  disabled={loading}
                  className="group text-left rounded-xl overflow-hidden border border-border hover:border-primary-500 transition-colors disabled:opacity-50"
                >
                  <img src={`/samples/${sample.file}`} alt={sample.label} className="w-full h-20 object-cover" />
                  <div className="p-2">
                    <p className="text-xs font-medium text-text-primary truncate">{sample.label}</p>
                    <p className="text-[11px] text-text-secondary truncate">{sample.note}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: controls and results */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <label htmlFor="confidence" className="text-body-sm font-medium text-text-primary">
                Confidence threshold: {confidence.toFixed(2)}
              </label>
              <input
                id="confidence"
                type="range"
                min="0.05"
                max="0.90"
                step="0.05"
                value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))}
                onMouseUp={rerunAtConfidence}
                onTouchEnd={rerunAtConfidence}
                className="w-full mt-2 accent-primary-500"
              />
              <p className="text-xs text-text-secondary mt-1">
                Release the slider to re-run. Lower values surface weaker, less reliable boxes.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="text-heading-sm font-semibold text-text-primary mb-3">Detections</h2>
              {!result && <p className="text-body-sm text-text-secondary">No image analysed yet.</p>}
              {result && detections.length === 0 && (
                <div className="flex items-start gap-2 text-body-sm text-text-secondary">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>No road damage above {confidence.toFixed(2)} confidence. A zero result is a valid outcome.</span>
                </div>
              )}
              {detections.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-3 text-body-sm">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span className="text-text-primary font-medium">
                      {potholes.length} pothole{potholes.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-text-secondary">
                      · {detections.length} total finding{detections.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {detections.map((det, index) => (
                      <li
                        key={index}
                        onMouseEnter={() => setHovered(index)}
                        onMouseLeave={() => setHovered(null)}
                        className={`rounded-lg p-2 transition-colors ${hovered === index ? 'bg-surface-elevated' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-body-sm font-medium text-text-primary">{det.class_name}</span>
                          <Badge variant={det.is_pothole ? 'danger' : 'warning'}>{det.class_code}</Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                            <div
                              className={`h-full ${confidenceTone(det.confidence)}`}
                              style={{ width: `${det.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-text-secondary">
                            {(det.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {elapsedMs !== null && result && (
                <p className="flex items-center gap-1.5 text-xs text-text-secondary mt-4 pt-3 border-t border-border">
                  <Timer className="h-3.5 w-3.5" />
                  {elapsedMs} ms round trip · {result.server_time_ms} ms model compute
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="flex items-center gap-2 text-heading-sm font-semibold text-text-primary mb-2">
                <Info className="h-4 w-4" /> Model scope
              </h2>
              <dl className="text-xs space-y-1 text-text-secondary">
                <div className="flex justify-between gap-2">
                  <dt>Model</dt>
                  <dd className="text-text-primary font-mono">{result?.model_id ?? health?.road_model?.model_id ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Hosting</dt>
                  <dd className="text-text-primary">Roboflow serverless</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Classes</dt>
                  <dd className="text-text-primary">D00, D10, D20, D40</dd>
                </div>
              </dl>
              <div className="flex items-start gap-2 mt-3 pt-3 border-t border-border">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-text-secondary">
                  Trained on the RDD2022 road survey dataset. Only <strong>D40</strong> is a pothole;
                  D00/D10/D20 are crack types shown in amber. It detects road surface damage only —
                  not garbage or streetlights — and is most reliable on road-level views rather than
                  close-up photos. Confidence is a model score, not verified accuracy.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default DetectionDemoPage

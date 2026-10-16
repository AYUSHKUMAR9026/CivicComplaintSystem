import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera, CameraOff, Video, ScanLine, MapPin, AlertTriangle,
  CheckCircle2, X, Loader, ShieldCheck,
} from 'lucide-react'
import { Card, CardContent, Badge, Alert } from './UI'
import { detectAPI, complaintAPI, geocodeAPI } from '../services/api'
import { formatErrorMessage } from '../utils/helpers'

// --- Safeguards -------------------------------------------------------------
// Auto-filing creates real municipal complaints under the citizen's name, so
// every one of these limits exists to stop a false positive becoming spam.
const SCAN_INTERVAL_MS = 1500   // hosted inference is billed per call
const CONFIRM_STREAK = 2        // same category on N consecutive scans
const MIN_CONFIDENCE = 0.5
const COOLDOWN_MS = 5 * 60 * 1000  // per category, after a successful filing
const DEDUP_METERS = 50         // skip if the citizen already reported it here
const SESSION_CAP = 5           // hard ceiling per scanning session
const COUNTDOWN_SECONDS = 8     // cancellable window before submit
const FRAME_WIDTH = 640

const CATEGORY_LABELS = { pothole: 'Pothole / Road Damage', garbage: 'Garbage / Waste' }

function metresBetween(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function buildDescription(suggestion, address, coords, requiresReview) {
  const label = CATEGORY_LABELS[suggestion.civic_category] || suggestion.civic_category
  const types = suggestion.class_names.join(', ')
  const pct = Math.round(suggestion.confidence * 100)
  const where = address || `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
  return (
    `${requiresReview ? 'Detected by live camera scan and confirmed by the reporter' : 'Automatically detected by live camera scan'}: ${suggestion.count} x ${types} ` +
    `(${label}), highest model confidence ${pct}%. Observed at ${where} on ` +
    `${new Date().toLocaleString()}. A camera frame is attached as evidence. ` +
    `This detection needs on-site verification.`
  )
}

export function LiveScanner({ existingComplaints = [], onComplaintFiled }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const videoUrlRef = useRef(null)
  const timerRef = useRef(null)
  const streakRef = useRef({ category: null, count: 0 })
  const cooldownRef = useRef({})
  const busyRef = useRef(false)
  const filingRef = useRef(false)
  const sessionRef = useRef(0)
  const pendingRef = useRef(null)

  const [active, setActive] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [mode, setMode] = useState('camera')
  const [videoSrc, setVideoSrc] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [coords, setCoords] = useState(null)
  const [address, setAddress] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [pending, setPending] = useState(null)
  const [pendingImageUrl, setPendingImageUrl] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [filed, setFiled] = useState([])
  const [categories, setCategories] = useState([])
  const [filing, setFiling] = useState(false)

  useEffect(() => { pendingRef.current = pending }, [pending])

  useEffect(() => {
    if (!pending?.blob) { setPendingImageUrl(''); return undefined }
    const url = URL.createObjectURL(pending.blob)
    setPendingImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pending])

  // Categories come from the database so detected classes map to real ids.
  useEffect(() => {
    complaintAPI.categories()
      .then((res) => setCategories(res.data || []))
      .catch(() => setError('Could not load complaint categories; filing is disabled.'))
  }, [])

  // A complaint needs a location, so acquire it before scanning starts.
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('This browser cannot provide location, so complaints cannot be filed automatically.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        setCoords({ latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy })
        try {
          const res = await geocodeAPI.reverse(c.latitude, c.longitude)
          setAddress(res.data?.display_name || '')
        } catch {
          setAddress('')
        }
      },
      (err) => setError(`Location unavailable (${err.message}). Automatic filing needs a location.`),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

  const stop = useCallback(() => {
    sessionRef.current += 1
    setActive(false)
    setScanning(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    pendingRef.current = null
    setPending(null)
    setCountdown(0)
    streakRef.current = { category: null, count: 0 }
  }, [])

  useEffect(() => () => {
    sessionRef.current += 1
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
  }, [])

  const startCamera = useCallback(async () => {
    setError('')
    stop()
    requestLocation()
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires a secure connection (HTTPS or localhost) and a supported browser')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Camera preview is unavailable')
      video.removeAttribute('src')
      video.srcObject = stream
      setMode('camera')
      setVideoSrc(null)
      await video.play()
      setActive(true)
      setScanning(true)
    } catch (err) {
      stop()
      setError(`Could not open the camera: ${err.message}. Check browser permissions.`)
    }
  }, [requestLocation, stop])

  const startVideoFile = useCallback((file) => {
    if (!file) return
    setError('')
    stop()
    requestLocation()
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    const url = URL.createObjectURL(file)
    videoUrlRef.current = url
    setVideoSrc(url)
    setMode('video')
    setActive(true)
    setScanning(true)
  }, [requestLocation, stop])

  useEffect(() => {
    if (active && mode === 'video' && videoSrc) {
      videoRef.current?.play().catch((err) => {
        setError(`Could not play the video: ${err.message}`)
        setScanning(false)
      })
    }
  }, [active, mode, videoSrc])

  const captureFrame = useCallback(() => new Promise((resolve) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return resolve(null)
    const scale = Math.min(1, FRAME_WIDTH / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8)
  }), [])

  const alreadyReportedNearby = useCallback((category) => {
    if (!coords) return false
    return existingComplaints.some((c) => {
      if (c.latitude == null || c.longitude == null) return false
      const name = c.category?.name || ''
      if (!name.includes(category)) return false
      return metresBetween(coords.latitude, coords.longitude, c.latitude, c.longitude) < DEDUP_METERS
    })
  }, [coords, existingComplaints])

  const fileComplaint = useCallback(async (draft) => {
    if (filingRef.current) return
    filingRef.current = true
    setFiling(true)
    try {
      const category = categories.find((c) => c.name === draft.category)
      if (!category) throw new Error(`No "${draft.category}" category exists on the server.`)
      const formData = new FormData()
      formData.append('description', draft.description)
      formData.append('category_id', String(category.id))
      formData.append('location', draft.location)
      formData.append('latitude', String(draft.coords.latitude))
      formData.append('longitude', String(draft.coords.longitude))
      formData.append('evidence_files', draft.blob, `scan-${Date.now()}.jpg`)
      const response = await complaintAPI.create(formData)
      cooldownRef.current[draft.category] = Date.now() + COOLDOWN_MS
      setFiled((prev) => [{ id: response.data.id, category: draft.category, at: new Date() }, ...prev])
      setNotice(`Complaint #${response.data.id} filed for ${CATEGORY_LABELS[draft.category]}.`)
      if (onComplaintFiled) onComplaintFiled()
    } catch (err) {
      setError(formatErrorMessage(err, 'Could not file the complaint automatically.'))
    } finally {
      filingRef.current = false
      setFiling(false)
      setPending(null)
      setCountdown(0)
    }
  }, [categories, onComplaintFiled])

  // Countdown gives the citizen a window to cancel before anything is submitted.
  useEffect(() => {
    if (!pending || countdown <= 0) return undefined
    const id = setTimeout(() => setCountdown((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [pending, countdown])

  useEffect(() => {
    if (pending && countdown === 0 && !pending.requiresReview && !filing && !reviewOnly) fileComplaint(pending)
  }, [pending, countdown, filing, reviewOnly, fileComplaint])

  const considerSuggestion = useCallback((suggestion, blob) => {
    const streak = streakRef.current
    if (!suggestion) { streakRef.current = { category: null, count: 0 }; return }

    const category = suggestion.civic_category
    streakRef.current = category === streak.category
      ? { category, count: streak.count + 1 }
      : { category, count: 1 }
    if (streakRef.current.count < CONFIRM_STREAK) return
    if (suggestion.confidence < MIN_CONFIDENCE) return
    if (pendingRef.current || filing) return
    if (filed.length >= SESSION_CAP) {
      setNotice(`Session limit of ${SESSION_CAP} automatic complaints reached. Scanning continues without filing.`)
      return
    }
    if ((cooldownRef.current[category] || 0) > Date.now()) return
    if (!categories.some((item) => item.name === category)) {
      setNotice(`The ${CATEGORY_LABELS[category] || category} category is unavailable; no complaint will be filed.`)
      return
    }
    if (!coords) { setNotice('Waiting for location before any complaint can be filed.'); return }
    if (alreadyReportedNearby(category)) {
      setNotice(`You already reported ${CATEGORY_LABELS[category]} within ${DEDUP_METERS} m; skipping.`)
      cooldownRef.current[category] = Date.now() + COOLDOWN_MS
      return
    }

    streakRef.current = { category: null, count: 0 }
    const requiresReview = suggestion.requires_review || category === 'garbage'
    setPending({
      category,
      suggestion,
      blob,
      requiresReview,
      coords,
      location: address || `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
      description: buildDescription(suggestion, address, coords, requiresReview),
    })
    setCountdown(requiresReview ? 0 : COUNTDOWN_SECONDS)
  }, [address, alreadyReportedNearby, categories, coords, filed.length, filing])

  const scanOnce = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    const session = sessionRef.current
    try {
      const blob = await captureFrame()
      if (!blob) return
      const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' })
      const response = await detectAPI.scan(file, MIN_CONFIDENCE)
      if (session !== sessionRef.current) return
      setResult(response.data)
      considerSuggestion(response.data.suggestion, blob)
    } catch (err) {
      if (session !== sessionRef.current) return
      setError(formatErrorMessage(err, 'Detection failed. Is the AI service running?'))
      setScanning(false)
    } finally {
      busyRef.current = false
    }
  }, [captureFrame, considerSuggestion])

  useEffect(() => {
    if (!active || !scanning) return undefined
    timerRef.current = setInterval(scanOnce, SCAN_INTERVAL_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [active, scanning, scanOnce])

  const detections = result?.detections ?? []
  const imageWidth = result?.image?.width
  const imageHeight = result?.image?.height

  return (
    <Card className="mb-8">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-heading-sm font-semibold text-text-primary flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary-400" />
              Live defect scanner
              <Badge variant="warning">Experimental</Badge>
            </h2>
            <p className="text-body-sm text-text-secondary mt-1">
              Point your camera at a road or waste pile. Garbage reports always need your confirmation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!active ? (
              <>
                <button type="button" onClick={startCamera} className="btn-primary text-body-sm">
                  <Camera className="h-4 w-4" /> Start camera
                </button>
                <label className="btn-secondary text-body-sm cursor-pointer">
                  <Video className="h-4 w-4" /> Use video
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => startVideoFile(e.target.files?.[0])}
                  />
                </label>
              </>
            ) : (
              <>
                {!scanning && (
                  <button type="button" onClick={() => { setError(''); setScanning(true) }} className="btn-secondary text-body-sm">
                    <ScanLine className="h-4 w-4" /> Retry scanning
                  </button>
                )}
                <button type="button" onClick={stop} className="btn-danger text-body-sm">
                  <CameraOff className="h-4 w-4" /> Stop
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="danger" className="mb-4" dismissible onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        {notice && !error && (
          <Alert variant="info" className="mb-4" dismissible onClose={() => setNotice('')}>
            {notice}
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="relative bg-surface-elevated rounded-xl overflow-hidden min-h-[220px] flex items-center justify-center">
              <video
                ref={videoRef}
                src={mode === 'video' ? videoSrc : undefined}
                controls={mode === 'video'}
                loop={mode === 'video'}
                autoPlay
                muted
                playsInline
                className={active ? 'w-full h-auto block' : 'hidden'}
              />
              {active && imageWidth > 0 && detections.map((det, index) => {
                const [left, top, right, bottom] = det.xyxy
                return (
                  <div
                    key={index}
                    className={`absolute border-2 ${det.civic_category ? 'border-rose-500' : 'border-warm-400'}`}
                    style={{
                      left: `${(left / imageWidth) * 100}%`,
                      top: `${(top / imageHeight) * 100}%`,
                      width: `${((right - left) / imageWidth) * 100}%`,
                      height: `${((bottom - top) / imageHeight) * 100}%`,
                    }}
                  >
                    <span className={`absolute -top-5 left-0 whitespace-nowrap px-1 text-[11px] font-semibold text-white rounded ${det.civic_category ? 'bg-rose-500' : 'bg-warm-500'}`}>
                      {det.class_name} {(det.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                )
              })}
              {!active && (
                <p className="text-body-sm text-text-secondary py-16 px-4 text-center">
                  Start the camera, or load a video file, to begin scanning.
                </p>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="space-y-3">
            {pending && (
              <div className="rounded-xl border-2 border-rose-500/60 bg-rose-500/5 p-3">
                <p className="text-body-sm font-semibold text-text-primary">
                  Possible {CATEGORY_LABELS[pending.category]} detected
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  {pending.suggestion.count} x {pending.suggestion.class_names.join(', ')} ·{' '}
                  {(pending.suggestion.confidence * 100).toFixed(0)}% confidence
                </p>
                <p className="text-xs text-text-secondary mt-1 truncate">{pending.location}</p>
                {pendingImageUrl && (
                  <img src={pendingImageUrl} alt="Captured frame for review" className="w-full rounded-lg mt-3" />
                )}
                {pending.requiresReview && (
                  <p className="text-xs text-warm-300 mt-2">Check the captured frame before filing. This detection may be incorrect.</p>
                )}
                {filing ? (
                  <p className="flex items-center gap-2 text-body-sm text-text-primary mt-3">
                    <Loader className="h-4 w-4 animate-spin" /> Filing…
                  </p>
                ) : (
                  <div className="flex items-center gap-2 mt-3">
                    <button type="button" onClick={() => fileComplaint(pending)} className="btn-primary text-body-sm flex-1">
                      {pending.requiresReview ? 'Confirm and file' : 'File now'}{!pending.requiresReview && !reviewOnly && countdown > 0 ? ` (${countdown})` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPending(null); setCountdown(0) }}
                      className="btn-ghost text-body-sm"
                      aria-label="Cancel this complaint"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-border p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewOnly}
                  onChange={(e) => setReviewOnly(e.target.checked)}
                  className="mt-1 accent-primary-500"
                />
                <span className="text-xs text-text-secondary">
                  <span className="text-text-primary font-medium flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> Review before filing
                  </span>
                  Require confirmation for road reports too. Garbage reports always require it.
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-border p-3 text-xs text-text-secondary space-y-1">
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {coords
                  ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)} (±${Math.round(coords.accuracy)} m)`
                  : 'Location not acquired'}
              </p>
              {address && <p className="truncate">{address}</p>}
              <p>Scanning every {SCAN_INTERVAL_MS / 1000}s · filed {filed.length}/{SESSION_CAP} this session</p>
              {result && <p>Last scan: {detections.length} finding(s), {result.server_time_ms} ms</p>}
            </div>

            {filed.length > 0 && (
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs font-medium text-text-primary mb-2">Filed this session</p>
                <ul className="space-y-1">
                  {filed.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-xs text-text-secondary">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      #{f.id} · {CATEGORY_LABELS[f.category]}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-text-secondary">
              <AlertTriangle className="h-4 w-4 text-warm-500 shrink-0 mt-0.5" />
              <p>
                Detection can be wrong. Check each garbage frame before confirming a complaint.
                Road cracks are shown in amber and are never filed automatically.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default LiveScanner

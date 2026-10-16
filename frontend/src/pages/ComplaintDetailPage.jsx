import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { complaintAPI, adminAPI, resolveAssetUrl } from '../services/api'
import { Button, Card, CardContent, Badge, StatusBadge, Alert, LoadingState, Modal, Select, Input } from '../components/UI'
import { 
  MapPin, Clock, Info, FileText, Flag, 
  UserCheck, Loader, CheckCircle2, XCircle,
  ArrowLeft, ThumbsUp, ChevronLeft, ChevronRight,
  Sparkles, AlertTriangle, Shield, RefreshCw, Edit, Scale, Navigation,
  Mail, Phone, Copy, Check, ExternalLink, User, Home, ShieldCheck,
  Trash2, Building2
} from 'lucide-react'
import { formatDateTime, formatDate, formatRelativeTime, getStatusConfig, classNames, getInitials, generateAvatarColor, formatErrorMessage, calculateDistanceKm } from '../utils/helpers'
import { LocationModal } from '../components/LocationModal'

const STATUS_ORDER = ['pending', 'working', 'completed']

export function ComplaintDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isCitizen, isAdmin, isDepartment } = useAuth()
  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [upvoting, setUpvoting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [departments, setDepartments] = useState([])
  const [assignDeptId, setAssignDeptId] = useState('')
  const [assigning, setAssigning] = useState(false)
  
  // Assessment state
  const [showAssessmentModal, setShowAssessmentModal] = useState(false)
  const [assessmentForm, setAssessmentForm] = useState({
    severity_score: 50,
    impact_score: 50,
    urgency_score: 50,
    is_safety_escalated: false,
    needs_human_review: false,
    admin_notes: '',
  })
  const [savingAssessment, setSavingAssessment] = useState(false)
  const [reassessing, setReassessing] = useState(false)
  
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    targetStatus: null,
    title: '',
    message: '',
    confirmText: '',
    variant: 'primary',
  })

  // Location guard state for 25km radius
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [upvoteMessage, setUpvoteMessage] = useState(null)

  // Applicant details state
  const [applicant, setApplicant] = useState(null)
  const [loadingApplicant, setLoadingApplicant] = useState(false)
  const [copiedField, setCopiedField] = useState(null)

  const handleCopy = (text, field) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const fetchComplaint = async () => {
    try {
      setLoading(true)
      const response = await complaintAPI.get(id)
      setComplaint(response.data)
      if (response.data?.applicant || response.data?.citizen_details) {
        setApplicant(response.data.applicant || response.data.citizen_details)
      }
      setError(null)
    } catch (err) {
      setError(formatErrorMessage(err, 'Failed to load complaint'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchComplaint()
  }, [id])

  useEffect(() => {
    if (complaint?.applicant || complaint?.citizen_details) {
      setApplicant(complaint.applicant || complaint.citizen_details)
    } else if (complaint && (isAdmin || isDepartment)) {
      setLoadingApplicant(true)
      const fetchApp = isAdmin ? adminAPI.applicantDetail(id) : complaintAPI.getApplicant(id)
      fetchApp
        .then(res => setApplicant(res.data))
        .catch(err => {
          console.log('Applicant fetch fallback error:', err)
          if (isAdmin) {
            complaintAPI.getApplicant(id)
              .then(res2 => setApplicant(res2.data))
              .catch(() => {})
          }
        })
        .finally(() => setLoadingApplicant(false))
    }
  }, [complaint, isAdmin, isDepartment, id])

  useEffect(() => {
    if (isAdmin) {
      adminAPI.departments().then(res => {
        const unique = []
        const seen = new Set()
        for (const d of res.data) {
          if (!seen.has(d.display_name)) {
            seen.add(d.display_name)
            unique.push(d)
          }
        }
        setDepartments(unique)
      }).catch(err => console.error('Failed to load departments:', err))
    }
  }, [isAdmin])

  const openAssignModal = () => {
    setAssignDeptId(complaint?.department_id ? String(complaint.department_id) : '')
    setShowAssignModal(true)
  }

  const confirmAssign = async () => {
    if (!assignDeptId) return
    setAssigning(true)
    try {
      await adminAPI.assign(id, parseInt(assignDeptId))
      await fetchComplaint()
      setShowAssignModal(false)
    } catch (err) {
      console.error('Assign failed:', err)
      alert(formatErrorMessage(err, 'Failed to assign department'))
    } finally {
      setAssigning(false)
    }
  }

  const handleUpvote = async () => {
    if (!complaint || upvoting) return
    // Only pending complaints can be upvoted
    if (complaint.status && complaint.status !== 'pending') {
      setUpvoteMessage({
        type: 'warning',
        text: `Voting is only allowed when the incident status is pending (current status: ${complaint.status}).`
      })
      return
    }

    // Intercept if citizen has no saved location (Requirement 4)
    if (isCitizen && (user?.latitude == null || user?.longitude == null)) {
      setShowLocationModal(true)
      return
    }

    setUpvoting(true)
    try {
      await complaintAPI.upvote(id)
      setComplaint((prev) => ({
        ...prev,
        upvote_count: prev.upvote_count + 1,
        user_voted: true
      }))
      setUpvoteMessage({ type: 'success', text: 'Thank you for supporting this incident!' })
    } catch (err) {
      setUpvoteMessage({ type: 'danger', text: formatErrorMessage(err, 'Failed to upvote complaint.') })
    } finally {
      setUpvoting(false)
    }
  }

  const handleLocationSaved = async (newLoc) => {
    // Check distance between user's new saved location and incident
    const dist = (newLoc.latitude != null && complaint?.latitude != null)
      ? calculateDistanceKm(newLoc.latitude, newLoc.longitude, complaint.latitude, complaint.longitude)
      : null

    if (dist !== null && dist > 25.0) {
      setUpvoteMessage({
        type: 'danger',
        text: `Location saved. However, this incident is ${dist.toFixed(1)} km away, which is outside your 25 km community radius. Upvoting is only permitted within 25 km.`
      })
      return
    }

    if (complaint?.status && complaint.status !== 'pending') {
      setUpvoteMessage({
        type: 'warning',
        text: `Location saved. However, this incident is ${complaint.status} and can no longer be upvoted.`
      })
      return
    }

    // Automatically proceed with original upvote action
    setUpvoting(true)
    try {
      await complaintAPI.upvote(id)
      setComplaint((prev) => ({
        ...prev,
        upvote_count: prev.upvote_count + 1,
        user_voted: true
      }))
      setUpvoteMessage({
        type: 'success',
        text: 'Location saved! This incident is within your 25 km community and was automatically upvoted.'
      })
    } catch (err) {
      setUpvoteMessage({
        type: 'danger',
        text: formatErrorMessage(err, 'Failed to upvote after saving location.')
      })
    } finally {
      setUpvoting(false)
    }
  }

  const requestStatusChange = (newStatus) => {
    const isStart = newStatus === 'working'
    setConfirmModal({
      isOpen: true,
      targetStatus: newStatus,
      title: isStart ? 'Start Work on Complaint?' : 'Complete Complaint Work?',
      message: isStart
        ? 'Are you sure you want to start work on this complaint? The status will change from Pending to Ongoing.'
        : 'Are you sure you want to mark this complaint as completed? The status will change from Ongoing to Completed.',
      confirmText: isStart ? 'Yes, Start Work' : 'Yes, Mark Completed',
      variant: isStart ? 'primary' : 'success',
    })
  }

  const handleConfirmStatus = async () => {
    if (!complaint || !confirmModal.targetStatus) return
    setUpdatingStatus(true)
    try {
      await complaintAPI.update(id, { status: confirmModal.targetStatus })
      setConfirmModal(prev => ({ ...prev, isOpen: false, targetStatus: null }))
      await fetchComplaint()
    } catch (err) {
      console.error('Status update failed:', err)
      alert(formatErrorMessage(err, 'Failed to update status. Please ensure your department is authorized for this complaint.'))
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleOpenAssessment = () => {
    if (!complaint) return
    setAssessmentForm({
      severity_score: complaint.severity_score !== null && complaint.severity_score !== undefined ? complaint.severity_score : 50,
      impact_score: complaint.impact_score !== null && complaint.impact_score !== undefined ? complaint.impact_score : 50,
      urgency_score: complaint.urgency_score !== null && complaint.urgency_score !== undefined ? complaint.urgency_score : 50,
      is_safety_escalated: !!complaint.is_safety_escalated,
      needs_human_review: !!complaint.needs_human_review,
      admin_notes: complaint.admin_override_reason || '',
    })
    setShowAssessmentModal(true)
  }

  const handleSaveAssessment = async () => {
    if (!complaint) return
    setSavingAssessment(true)
    try {
      await adminAPI.updateAssessment(complaint.id, assessmentForm)
      setShowAssessmentModal(false)
      await fetchComplaint()
    } catch (err) {
      console.error('Failed to update assessment:', err)
      alert(formatErrorMessage(err, 'Failed to update priority assessment.'))
    } finally {
      setSavingAssessment(false)
    }
  }

  const handleReassess = async () => {
    if (!complaint) return
    setReassessing(true)
    try {
      await adminAPI.reassess(complaint.id)
      await fetchComplaint()
    } catch (err) {
      console.error('Reassessment failed:', err)
      alert(formatErrorMessage(err, 'Failed to re-run assessment.'))
    } finally {
      setReassessing(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!complaint) return
    setDeleting(true)
    try {
      if (isAdmin) {
        await adminAPI.deleteComplaint(complaint.id)
      } else {
        await complaintAPI.delete(complaint.id)
      }
      setShowDeleteModal(false)
      navigate(isAdmin ? '/admin' : '/dashboard')
    } catch (err) {
      console.error('Delete failed:', err)
      alert(formatErrorMessage(err, 'Failed to delete complaint'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <LoadingState />
          <LoadingState />
          <LoadingState />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
        <Alert variant="danger" className="max-w-2xl">
          <p className="font-medium">Failed to load complaint</p>
          <p className="text-body-sm mt-1">{error}</p>
        </Alert>
        <Button variant="primary" onClick={fetchComplaint} className="mt-4">
          Try Again
        </Button>
      </div>
    )
  }

  if (!complaint) return null

  const config = getStatusConfig(complaint.status || 'pending')
  const statusStep = STATUS_ORDER.indexOf(complaint.status || 'pending')
  
  let evidenceUrls = []
  if (Array.isArray(complaint.evidence_urls)) {
    evidenceUrls = complaint.evidence_urls
  } else if (typeof complaint.evidence_urls === 'string' && complaint.evidence_urls.trim() !== '') {
    try {
      evidenceUrls = JSON.parse(complaint.evidence_urls)
    } catch (e) {
      console.error('Failed to parse evidence_urls', e)
    }
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-heading-lg font-bold text-text-primary">Complaint #{complaint.id}</h1>
            <p className="text-body text-text-secondary">{complaint.category?.display_name || 'Unknown Category'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {isAdmin && complaint.priority_score != null && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 font-mono text-sm font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-primary-400" />
              <span>Priority Score: {Number(complaint.priority_score).toFixed(1)} / 100</span>
            </div>
          )}
          <StatusBadge status={complaint.status || 'pending'} size="lg" />
          {(isAdmin || isDepartment || (isCitizen && complaint.status === 'pending')) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
              onClick={() => setShowDeleteModal(true)}
              title="Delete this complaint"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete Complaint
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
        {/* Left Column: Incident Description, Evidence, Priority Assessment & Timeline */}
        <div className="lg:col-span-7 space-y-6">
          {/* Description & Overview Card */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-heading-sm font-semibold text-text-primary">Description</h2>
                  <Badge variant="primary">{complaint.category?.display_name || 'General'}</Badge>
                </div>
                <span className="text-body-sm text-text-muted flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Submitted {formatRelativeTime(complaint.created_at)}
                </span>
              </div>
              <p className="text-body text-text-primary whitespace-pre-wrap leading-relaxed">{complaint.description}</p>
              
              <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-body-sm text-text-secondary">
                <span className="flex items-center gap-1.5 font-medium text-text-primary">
                  <MapPin className="h-4 w-4 text-primary-400 shrink-0" />
                  {complaint.location || 'Location not specified'}
                </span>
                {complaint.resolved_at && (
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Resolved {formatRelativeTime(complaint.resolved_at)}
                  </span>
                )}
              </div>

              {/* Distance from logged in user if available */}
              {user?.latitude != null && complaint?.latitude != null && (() => {
                const dist = calculateDistanceKm(user.latitude, user.longitude, complaint.latitude, complaint.longitude)
                return dist != null ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-500/10 text-primary-300 border border-primary-500/20">
                    <Navigation className="h-3.5 w-3.5 text-primary-400" />
                    <span>{dist <= 0.1 ? '< 100m' : `${dist.toFixed(1)} km`} from your community ({dist <= 25.0 ? 'Within 25 km' : 'Outside 25 km'})</span>
                  </div>
                ) : null
              })()}
            </CardContent>
          </Card>

          {/* Evidence Gallery */}
          {evidenceUrls.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="text-heading-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <span>Evidence Photos</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-300 font-mono">
                    {imageIndex + 1} / {evidenceUrls.length}
                  </span>
                </h2>
                <div className="relative">
                  <div className="aspect-video rounded-card overflow-hidden bg-surface-elevated border border-border">
                    <img
                      src={resolveAssetUrl(evidenceUrls[imageIndex])}
                      alt={`Evidence ${imageIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {evidenceUrls.length > 1 && (
                    <>
                      <button
                        onClick={() => setImageIndex((i) => (i - 1 + evidenceUrls.length) % evidenceUrls.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-surface-card/90 backdrop-blur flex items-center justify-center shadow-elevated border border-border hover:bg-surface-hover transition-colors"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="h-5 w-5 text-text-primary" />
                      </button>
                      <button
                        onClick={() => setImageIndex((i) => (i + 1) % evidenceUrls.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-surface-card/90 backdrop-blur flex items-center justify-center shadow-elevated border border-border hover:bg-surface-hover transition-colors"
                        aria-label="Next image"
                      >
                        <ChevronRight className="h-5 w-5 text-text-primary" />
                      </button>
                    </>
                  )}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm">
                    {evidenceUrls.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setImageIndex(idx)}
                        className={classNames(
                          'w-2 h-2 rounded-full transition-colors',
                          idx === imageIndex ? 'bg-primary-400 w-4' : 'bg-white/40 hover:bg-white/70'
                        )}
                        aria-label={`View image ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Priority Assessment Card (Admin Only) - Expanded & Spacious */}
          {isAdmin && (
            <Card className="border border-border-strong shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary-500/15 via-transparent to-accent-500/10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary-400" />
                  <h2 className="text-heading-sm font-semibold text-text-primary">Priority Assessment</h2>
                </div>
                {complaint.priority_score != null && (
                  <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-primary-500/10 border border-primary-500/20 text-primary-300">
                    Formula Score: {Number(complaint.priority_score).toFixed(1)} / 100
                  </span>
                )}
              </div>
              <CardContent className="p-5 space-y-4">
                {/* Score summary & status */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-elevated border border-border">
                  <div>
                    <span className="text-caption uppercase tracking-wider text-text-muted font-bold">Total Priority Score</span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-3xl font-bold font-mono text-text-primary">
                        {complaint.priority_score !== null && complaint.priority_score !== undefined ? complaint.priority_score.toFixed(1) : '—'}
                      </span>
                      <span className="text-sm text-text-muted">/ 100</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={classNames(
                      'text-caption font-semibold px-2.5 py-1 rounded-full border',
                      complaint.assessment_status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      complaint.assessment_status === 'provisional' ? 'bg-warm-500/10 text-warm-400 border-warm-500/20' :
                      'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    )}>
                      {complaint.assessment_status === 'completed' ? 'AI Evaluated' :
                       complaint.assessment_status === 'provisional' ? 'Provisional Baseline' :
                       complaint.assessment_status || 'Pending'}
                    </span>
                    {complaint.assessment_confidence && (
                      <span className="text-[11px] text-text-muted">
                        Confidence: <span className="font-semibold text-text-secondary capitalize">{complaint.assessment_confidence}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Safety Alert or Review Needed */}
                {complaint.is_safety_escalated && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-body-sm">
                    <Shield className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold text-rose-300">Immediate Safety Hazard Escalation</strong>
                      <p className="text-xs text-rose-300/80 mt-0.5">This issue has an urgent safety hazard flag requiring prompt action.</p>
                    </div>
                  </div>
                )}

                {complaint.needs_human_review && (
                  <div className="p-3 rounded-xl bg-warm-500/10 border border-warm-500/30 flex items-start gap-2.5 text-warm-300 text-body-sm">
                    <AlertTriangle className="h-4 w-4 text-warm-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold text-warm-300">Awaiting Admin Verification</strong>
                      <p className="text-xs text-warm-300/80 mt-0.5">Vague evidence or potential safety risk flagged for human triage.</p>
                    </div>
                  </div>
                )}

                {/* Component Scores Breakdown (2-Column Grid on md) */}
                <div className="pt-2">
                  <span className="text-caption font-bold tracking-wider text-text-muted uppercase block mb-3">Formula Breakdown</span>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Severity */}
                    <div className="p-3 rounded-lg bg-surface-elevated/50 border border-border">
                      <div className="flex justify-between text-body-sm mb-1.5">
                        <span className="text-text-secondary flex items-center gap-1.5">
                          Severity <span className="text-[11px] text-text-muted">(40%)</span>
                        </span>
                        <span className="font-mono font-semibold text-text-primary">
                          {complaint.severity_score !== null ? `${complaint.severity_score}/100` : '—'}
                        </span>
                      </div>
                      <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${complaint.severity_score || 0}%` }} />
                      </div>
                    </div>

                    {/* Public Impact */}
                    <div className="p-3 rounded-lg bg-surface-elevated/50 border border-border">
                      <div className="flex justify-between text-body-sm mb-1.5">
                        <span className="text-text-secondary flex items-center gap-1.5">
                          Public Impact <span className="text-[11px] text-text-muted">(25%)</span>
                        </span>
                        <span className="font-mono font-semibold text-text-primary">
                          {complaint.impact_score !== null ? `${complaint.impact_score}/100` : '—'}
                        </span>
                      </div>
                      <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                        <div className="h-full bg-warm-400 rounded-full transition-all" style={{ width: `${complaint.impact_score || 0}%` }} />
                      </div>
                    </div>

                    {/* Urgency */}
                    <div className="p-3 rounded-lg bg-surface-elevated/50 border border-border">
                      <div className="flex justify-between text-body-sm mb-1.5">
                        <span className="text-text-secondary flex items-center gap-1.5">
                          Urgency <span className="text-[11px] text-text-muted">(20%)</span>
                        </span>
                        <span className="font-mono font-semibold text-text-primary">
                          {complaint.urgency_score !== null ? `${complaint.urgency_score}/100` : '—'}
                        </span>
                      </div>
                      <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                        <div className="h-full bg-accent-400 rounded-full transition-all" style={{ width: `${complaint.urgency_score || 0}%` }} />
                      </div>
                    </div>

                    {/* Citizen Support */}
                    <div className="p-3 rounded-lg bg-surface-elevated/50 border border-border">
                      <div className="flex justify-between text-body-sm mb-1.5">
                        <span className="text-text-secondary flex items-center gap-1.5">
                          Citizen Support <span className="text-[11px] text-text-muted">(15%)</span>
                        </span>
                        <span className="font-mono font-semibold text-text-primary">
                          {complaint.upvote_count || 0} votes
                        </span>
                      </div>
                      <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-400 rounded-full transition-all" 
                          style={{ 
                            width: `${Math.min(100, Math.round(100 * (Math.log(1 + (complaint.upvote_count || 0)) / Math.log(51))))}%` 
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reason / Explanation */}
                {complaint.assessment_reason && (
                  <div className="p-3 rounded-xl bg-surface-elevated/60 border border-border">
                    <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1">Assessment Rationale</span>
                    <p className="text-body-sm text-text-secondary leading-relaxed">{complaint.assessment_reason}</p>
                  </div>
                )}

                {/* Missing Information Tags */}
                {complaint.missing_information && complaint.missing_information.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1.5">Missing Details for Higher Confidence</span>
                    <div className="flex flex-wrap gap-1.5">
                      {complaint.missing_information.map((item, idx) => (
                        <span key={idx} className="text-caption px-2 py-0.5 rounded-badge bg-surface-hover/60 border border-border text-text-muted">
                          • {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin Override Indicator */}
                {complaint.admin_override && (
                  <div className="p-2.5 rounded-lg bg-primary-500/10 border border-primary-500/20 text-xs text-primary-300 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary-400 shrink-0" />
                    <span>Admin Verified {complaint.admin_override_reason ? `: "${complaint.admin_override_reason}"` : ''}</span>
                  </div>
                )}

                {/* Admin Actions */}
                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <Button variant="primary" size="sm" className="flex-1 justify-center" onClick={handleOpenAssessment}>
                    <Edit className="h-3.5 w-3.5" />
                    Review / Adjust Assessment
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1 justify-center text-xs" onClick={handleReassess} disabled={reassessing}>
                    <RefreshCw className={classNames('h-3.5 w-3.5', reassessing ? 'animate-spin' : '')} />
                    {reassessing ? 'Re-evaluating with AI...' : 'Re-run AI Assessment'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status Timeline */}
          <Card>
            <CardContent className="p-5">
              <h2 className="text-heading-sm font-semibold text-text-primary mb-4">Status Timeline</h2>
              <div className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
                {STATUS_ORDER.map((step, idx) => {
                  const stepConfig = getStatusConfig(step)
                  const StepIcon = getIconComponent(stepConfig.icon)
                  const isCompleted = idx <= statusStep
                  const isCurrent = idx === statusStep
                  const historyEntry = complaint.status_history?.find(h => h.new_status === step)
                  
                  return (
                    <div key={step} className="relative pl-14 pb-6 last:pb-0 flex items-start">
                      <div className={classNames(
                        'absolute left-6 top-1 w-3 h-3 rounded-full border-3 flex-shrink-0 z-10',
                        isCompleted ? 'bg-primary-500 border-primary-500' : 'bg-surface border-border-strong'
                      )}>
                        {isCurrent && <div className="absolute inset-1 bg-surface" /> }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={classNames('flex items-center gap-2', isCurrent ? 'text-primary-600' : 'text-text-secondary')}>
                          <StepIcon className={classNames('h-4 w-4', isCurrent ? 'text-primary-500' : '')} />
                          <span className={classNames('font-medium', isCurrent ? 'text-text-primary' : '')}>
                            {stepConfig.label}
                          </span>
                          {isCurrent && <span className="text-caption bg-primary-500/15 text-primary-400 px-2 py-0.5 rounded-full">Current</span>}
                        </div>
                        {historyEntry && (
                          <p className="mt-1 text-body-sm text-text-muted pl-6">
                            {formatDateTime(historyEntry.created_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Citizen Upvote Section */}
          {isCitizen && (
            <Card>
              <CardContent className="p-5">
                {upvoteMessage && (
                  <Alert
                    variant={upvoteMessage.type || 'info'}
                    className="mb-4"
                    dismissible
                    onClose={() => setUpvoteMessage(null)}
                  >
                    {upvoteMessage.text}
                  </Alert>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleUpvote}
                      disabled={upvoting || complaint.user_voted || (complaint.status && complaint.status !== 'pending')}
                      title={complaint.status && complaint.status !== 'pending' ? `Voting closed (${complaint.status})` : 'Upvote incident'}
                      className={classNames(
                        'flex items-center gap-2 px-4 py-2 rounded-button border transition-colors',
                        complaint.user_voted
                          ? 'bg-primary-50 border-primary-200 text-primary-600'
                          : complaint.status && complaint.status !== 'pending'
                          ? 'opacity-40 cursor-not-allowed bg-surface-elevated/40 border-border/50 text-text-muted'
                          : 'bg-surface-elevated border-border text-text-secondary hover:bg-surface-hover'
                      )}
                      aria-label="Upvote"
                    >
                      <ThumbsUp className={classNames('h-5 w-5', complaint.user_voted ? 'text-primary-500' : '')} />
                      <span className="font-medium">{complaint.upvote_count || 0}</span>
                    </button>
                    <div className="hidden sm:block text-body-sm text-text-muted">
                      {complaint.user_voted
                        ? 'You upvoted this'
                        : complaint.status && complaint.status !== 'pending'
                        ? `Voting closed (incident is ${complaint.status === 'working' ? 'in progress' : complaint.status})`
                        : 'Upvote to increase priority (within 25 km)'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Activity / Status Updates Log */}
          {complaint.status_history && complaint.status_history.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="text-heading-sm font-semibold text-text-primary mb-4">Updates & Activity Log</h2>
                <div className="space-y-4">
                  {complaint.status_history.slice().reverse().map((entry) => (
                    <div key={entry.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-500/15 flex items-center justify-center flex-shrink-0">
                        <Info className="h-4 w-4 text-primary-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-body text-text-primary">Status changed to {getStatusConfig(entry.new_status).label}</p>
                        <p className="text-caption text-text-muted mt-0.5">
                          {formatDateTime(entry.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Person Applying (Citizen Profile) & Complaint Info / Management */}
        <div className="lg:col-span-5 space-y-6">
          {/* Applicant Details Card (Admin & Department Admin Only) */}
          {(isAdmin || isDepartment) && (
            <Card className="border border-primary-500/30 shadow-card bg-surface-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary-500/15 via-surface-card to-accent-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-primary-500/20 text-primary-400">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-heading-sm font-semibold text-text-primary">Person Applying</h2>
                    <p className="text-[11px] text-text-muted">Complainant / Citizen Details</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Verified Citizen
                </span>
              </div>

              <CardContent className="p-5 space-y-4">
                {loadingApplicant && !applicant ? (
                  <div className="py-6 text-center text-text-muted">
                    <Loader className="h-5 w-5 animate-spin mx-auto mb-2 text-primary-400" />
                    <p className="text-body-sm">Loading applicant details...</p>
                  </div>
                ) : applicant ? (
                  <>
                    {/* Profile Header */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-elevated/70 border border-border">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base text-white shadow-sm flex-shrink-0"
                        style={{ backgroundColor: generateAvatarColor(applicant.full_name || 'Citizen') }}
                      >
                        {getInitials(applicant.full_name || 'Citizen')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-text-primary text-base truncate">
                          {applicant.full_name || 'Anonymous Citizen'}
                        </h3>
                        <p className="text-caption text-text-muted flex items-center gap-1.5 mt-0.5">
                          <span>Citizen ID: #{applicant.id}</span>
                          <span>•</span>
                          <span>User #{applicant.user_id}</span>
                        </p>
                      </div>
                    </div>

                    {/* Contact Details */}
                    <div className="space-y-2.5 text-body-sm">
                      {/* Email */}
                      <div className="p-2.5 rounded-lg bg-surface-elevated/40 border border-border/60 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-4 w-4 text-primary-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Email Address</span>
                            <a
                              href={`mailto:${applicant.email}?subject=JanSewa Complaint %23${complaint.id}: ${encodeURIComponent(complaint.category?.display_name || 'Civic Issue')}`}
                              className="text-text-primary hover:text-primary-400 font-medium truncate block transition-colors"
                            >
                              {applicant.email}
                            </a>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(applicant.email, 'email')}
                          className="p-1.5 text-text-muted hover:text-text-primary rounded-md hover:bg-surface-hover transition-colors"
                          title="Copy Email"
                        >
                          {copiedField === 'email' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      {/* Phone */}
                      <div className="p-2.5 rounded-lg bg-surface-elevated/40 border border-border/60 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Phone className="h-4 w-4 text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Phone Number</span>
                            {applicant.phone ? (
                              <a
                                href={`tel:${applicant.phone}`}
                                className="text-text-primary hover:text-emerald-400 font-medium font-mono truncate block transition-colors"
                              >
                                {applicant.phone}
                              </a>
                            ) : (
                              <span className="text-text-muted italic">Not provided</span>
                            )}
                          </div>
                        </div>
                        {applicant.phone && (
                          <button
                            type="button"
                            onClick={() => handleCopy(applicant.phone, 'phone')}
                            className="p-1.5 text-text-muted hover:text-text-primary rounded-md hover:bg-surface-hover transition-colors"
                            title="Copy Phone"
                          >
                            {copiedField === 'phone' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>

                      {/* Address */}
                      <div className="p-2.5 rounded-lg bg-surface-elevated/40 border border-border/60 flex items-start gap-2">
                        <Home className="h-4 w-4 text-warm-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Citizen's Saved Address</span>
                          <p className="text-text-secondary text-body-sm leading-relaxed">
                            {applicant.address || 'No saved neighborhood address on file'}
                          </p>
                          {applicant.latitude != null && applicant.longitude != null && (
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted font-mono">
                              <span>Location: {applicant.latitude.toFixed(4)}, {applicant.longitude.toFixed(4)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Proximity to Incident */}
                      {applicant.latitude != null && complaint?.latitude != null && (() => {
                        const dist = calculateDistanceKm(applicant.latitude, applicant.longitude, complaint.latitude, complaint.longitude)
                        if (dist == null) return null
                        return (
                          <div className="p-2.5 rounded-lg bg-primary-500/10 border border-primary-500/20 text-xs text-primary-300 flex items-center gap-2">
                            <Navigation className="h-4 w-4 text-primary-400 shrink-0" />
                            <span>
                              Applicant lives <strong>{dist <= 0.1 ? '< 100m' : `${dist.toFixed(1)} km`}</strong> from this incident
                              {dist <= 1.0 ? ' (Immediate Resident)' : ''}
                            </span>
                          </div>
                        )
                      })()}

                      {/* Registration and Channels */}
                      <div className="pt-2 border-t border-border flex flex-col gap-1.5 text-xs text-text-muted">
                        {applicant.registered_at && (
                          <div className="flex justify-between items-center">
                            <span>Member Since:</span>
                            <span className="font-medium text-text-secondary">{formatDate(applicant.registered_at)}</span>
                          </div>
                        )}
                        {applicant.preferred_notification_channels && (
                          <div className="flex justify-between items-center">
                            <span>Notification Preferences:</span>
                            <span className="font-medium text-text-secondary capitalize">{applicant.preferred_notification_channels}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Contact Buttons */}
                    <div className="pt-2 flex gap-2">
                      <a
                        href={`mailto:${applicant.email}?subject=JanSewa Complaint %23${complaint.id}: ${encodeURIComponent(complaint.category?.display_name || 'Civic Issue')}`}
                        className="btn-primary flex-1 text-xs py-2 justify-center flex items-center gap-1.5"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Email Citizen
                      </a>
                      {applicant.phone && (
                        <a
                          href={`tel:${applicant.phone}`}
                          className="btn-secondary flex-1 text-xs py-2 justify-center flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Call
                        </a>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="py-4 text-center text-text-muted text-body-sm">
                    No applicant details available.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Consolidated Complaint Management & Info Card */}
          <Card>
            <CardContent className="p-5 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <h2 className="text-heading-sm font-semibold text-text-primary flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary-400" />
                  Complaint Management
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-elevated text-text-muted">
                  ID #{complaint.id}
                </span>
              </div>

              {/* Department Actions for Department Role */}
              {isDepartment && complaint.status !== 'completed' && (
                <div className="p-3.5 rounded-xl border border-primary-500/30 bg-primary-500/10 space-y-2">
                  <span className="text-caption uppercase font-bold text-primary-300 tracking-wider block">Department Actions</span>
                  {complaint.status === 'pending' ? (
                    <Button variant="primary" className="w-full justify-center" onClick={() => requestStatusChange('working')} loading={updatingStatus}>
                      Start Work
                    </Button>
                  ) : complaint.status === 'working' ? (
                    <Button variant="success" className="w-full justify-center" onClick={() => requestStatusChange('completed')} loading={updatingStatus}>
                      Mark Completed
                    </Button>
                  ) : null}
                </div>
              )}

              {/* Department Assignment for Admin Role */}
              {isAdmin && (
                <div className="p-3.5 rounded-xl border border-border bg-surface-elevated/60 space-y-2.5">
                  <span className="text-caption uppercase font-bold text-text-muted tracking-wider block">Assigned Department</span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-text-primary text-body-sm flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-primary-400" />
                      {complaint.department?.display_name || departments.find(d => d.id === complaint.department_id)?.display_name || 'Unassigned'}
                    </span>
                    <Button variant="secondary" size="sm" onClick={openAssignModal}>
                      {complaint.department_id ? 'Reassign' : 'Assign'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Key Attributes List */}
              <dl className="space-y-3 text-body-sm divide-y divide-border/60">
                <div className="flex justify-between items-center pt-2 first:pt-0">
                  <dt className="text-text-muted">Status</dt>
                  <dd><StatusBadge status={complaint.status || 'pending'} size="sm" /></dd>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <dt className="text-text-muted">Category</dt>
                  <dd className="font-medium text-text-primary">{complaint.category?.display_name || 'General'}</dd>
                </div>
                <div className="flex justify-between items-start pt-2 gap-4">
                  <dt className="text-text-muted shrink-0">Location</dt>
                  <dd className="font-medium text-text-primary text-right break-words">{complaint.location}</dd>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <dt className="text-text-muted">Submitted</dt>
                  <dd className="font-medium text-text-primary">{formatDateTime(complaint.created_at)}</dd>
                </div>
                {complaint.assigned_at && (
                  <div className="flex justify-between items-center pt-2">
                    <dt className="text-text-muted">Assigned</dt>
                    <dd className="font-medium text-text-primary">{formatDateTime(complaint.assigned_at)}</dd>
                  </div>
                )}
                {complaint.resolved_at && (
                  <div className="flex justify-between items-center pt-2">
                    <dt className="text-text-muted">Resolved</dt>
                    <dd className="font-medium text-emerald-400">{formatDateTime(complaint.resolved_at)}</dd>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2">
                  <dt className="text-text-muted">Citizen Upvotes</dt>
                  <dd className="font-bold text-warm-400 flex items-center gap-1 font-mono">
                    <ThumbsUp className="h-3.5 w-3.5" />
                    {complaint.upvote_count || 0}
                  </dd>
                </div>
              </dl>

              {/* Danger Zone: Delete Complaint */}
              {(isAdmin || isDepartment || (isCitizen && complaint.status === 'pending')) && (
                <div className="pt-3 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
                    onClick={() => setShowDeleteModal(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete Complaint
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Admin Assign Modal */}
      {isAdmin && (
        <Modal
          isOpen={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          title={complaint?.department_id ? "Reassign Department" : "Assign Department"}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-body text-text-secondary">
              {complaint?.department_id ? 'Reassign' : 'Assign'} complaint <strong>#{complaint?.id}</strong> to a department:
            </p>
            <Select
              label="Department"
              options={departments.map(d => ({ value: d.id, label: d.display_name }))}
              placeholder="Select department"
              value={assignDeptId}
              onChange={(e) => setAssignDeptId(e.target.value)}
            />
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" onClick={() => setShowAssignModal(false)}>
                Cancel
              </Button>
              <Button onClick={confirmAssign} disabled={!assignDeptId || assigning} loading={assigning}>
                {complaint?.department_id ? 'Reassign' : 'Assign'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Status Change Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-body text-text-secondary leading-relaxed">
            {confirmModal.message}
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              disabled={updatingStatus}
            >
              Cancel
            </Button>
            <Button
              variant={confirmModal.variant}
              onClick={handleConfirmStatus}
              loading={updatingStatus}
              disabled={updatingStatus}
            >
              {confirmModal.confirmText}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin Assessment Override Modal */}
      {showAssessmentModal && (
        <Modal
          isOpen={showAssessmentModal}
          onClose={() => setShowAssessmentModal(false)}
          title="Adjust Priority Assessment"
        >
          <div className="space-y-4">
            <p className="text-body-sm text-text-secondary">
              Modify the evidence-based component scores or apply safety escalation. The priority score will automatically update using the weighted formula.
            </p>

            <div className="space-y-4">
              <div>
                <label className="label flex justify-between">
                  <span>Severity Score (0–100) — Weight 40%</span>
                  <span className="font-mono text-primary-400 font-bold">{assessmentForm.severity_score}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={assessmentForm.severity_score}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, severity_score: parseInt(e.target.value) }))}
                  className="w-full accent-primary-500"
                />
              </div>

              <div>
                <label className="label flex justify-between">
                  <span>Public Impact Score (0–100) — Weight 25%</span>
                  <span className="font-mono text-primary-400 font-bold">{assessmentForm.impact_score}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={assessmentForm.impact_score}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, impact_score: parseInt(e.target.value) }))}
                  className="w-full accent-primary-500"
                />
              </div>

              <div>
                <label className="label flex justify-between">
                  <span>Urgency Score (0–100) — Weight 20%</span>
                  <span className="font-mono text-primary-400 font-bold">{assessmentForm.urgency_score}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={assessmentForm.urgency_score}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, urgency_score: parseInt(e.target.value) }))}
                  className="w-full accent-primary-500"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="p-3 rounded-lg bg-surface-elevated border border-border space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer text-body-sm font-medium text-text-primary">
                <input
                  type="checkbox"
                  checked={assessmentForm.is_safety_escalated}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, is_safety_escalated: e.target.checked }))}
                  className="rounded border-border text-rose-500 focus:ring-rose-500/20"
                />
                <span>Immediate Safety Escalation (verified hazard)</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-body-sm font-medium text-text-primary">
                <input
                  type="checkbox"
                  checked={assessmentForm.needs_human_review}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, needs_human_review: e.target.checked }))}
                  className="rounded border-border text-warm-500 focus:ring-warm-500/20"
                />
                <span>Flag for ongoing human review</span>
              </label>
            </div>

            {/* Admin Notes */}
            <div>
              <label className="label">Admin Verification Notes / Rationale</label>
              <textarea
                value={assessmentForm.admin_notes}
                onChange={(e) => setAssessmentForm(prev => ({ ...prev, admin_notes: e.target.value }))}
                placeholder="Reason for score adjustment or on-site verification notes..."
                rows={3}
                className="input resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" onClick={() => setShowAssessmentModal(false)} disabled={savingAssessment}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveAssessment} loading={savingAssessment}>
                Save Assessment
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Complaint Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => !deleting && setShowDeleteModal(false)}
        title="Delete Complaint"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-body-sm">
              <p className="font-semibold text-rose-200">Are you sure you want to delete this complaint?</p>
              <p className="mt-1 text-rose-300/80 leading-relaxed">
                Complaint <strong>#{complaint?.id}</strong> ({complaint?.category?.display_name || 'Civic Issue'}) and all associated citizen votes, timeline records, and data will be permanently deleted.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              loading={deleting}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Permanently Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Location Modal for Setting Profile Location before Upvoting */}
      <LocationModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onSuccess={handleLocationSaved}
        title="Location Required for Upvoting"
        explanation="Please add your location before upvoting. You can only view and support incidents within 25 km of your saved location."
      />
    </div>
  )
}

function getIconComponent(name) {
  const icons = {
    'file-text': FileText,
    'flag': Flag,
    'user-check': UserCheck,
    'loader': Loader,
    'check-circle-2': CheckCircle2,
    'x-circle': XCircle,
    'info': Info,
  }
  return icons[name] || FileText
}

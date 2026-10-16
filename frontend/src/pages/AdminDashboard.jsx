import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { adminAPI, complaintAPI } from '../services/api'
import { 
  Card, CardContent, Badge, StatusBadge, Button, 
  Select, Input, Modal, Alert, EmptyState, LoadingState, Skeleton 
} from '../components/UI'
import {
  LayoutDashboard, FileText, Users, TrendingUp, AlertTriangle,
  Clock, CheckCircle2, Filter, X, MoreVertical, Edit, Trash2,
  ArrowUpDown, Download, BarChart3, Building2, MapPin, FolderKanban,
  Settings, ChevronLeft, ChevronRight, ChevronDown, Search, ThumbsUp, Activity, Zap, RefreshCw,
  Sparkles, Sliders, ShieldAlert, Shield,
  UserCheck, User, Mail, Phone, Copy, Check, ExternalLink, Home, ShieldCheck, Navigation, Loader
} from 'lucide-react'
import { formatRelativeTime, formatDate, formatDateTime, getStatusConfig, classNames, truncate, formatNumber, formatErrorMessage, getInitials, generateAvatarColor, calculateDistanceKm } from '../utils/helpers'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const STATUS_ORDER = ['pending', 'working', 'completed']

export function AdminDashboard() {
  const { user, isAdmin, isDepartment } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    status: '',
    category_id: '',
    department_id: '',
    needs_human_review: '',
    search: '',
    sort_by: 'priority_score',
    sort_order: 'desc',
  })
  const [showFilterBar, setShowFilterBar] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState([])
  const [departments, setDepartments] = useState([])
  const pageSize = 20
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedComplaint, setSelectedComplaint] = useState(null)
  const [assignDeptId, setAssignDeptId] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    complaintId: null,
    targetStatus: null,
    title: '',
    message: '',
    confirmText: '',
    variant: 'primary',
  })
  // Priority Assessment Triage Modal State
  const [showAssessmentModal, setShowAssessmentModal] = useState(false)
  const [assessmentTarget, setAssessmentTarget] = useState(null)
  const [assessmentForm, setAssessmentForm] = useState({
    severity_score: 50,
    impact_score: 50,
    urgency_score: 50,
    is_safety_escalated: false,
    needs_human_review: false,
    admin_notes: '',
  })
  const [savingAssessment, setSavingAssessment] = useState(false)
  const [reassessingId, setReassessingId] = useState(null)

  // Applicant / Citizen Modal State
  const [showApplicantModal, setShowApplicantModal] = useState(false)
  const [selectedApplicant, setSelectedApplicant] = useState(null)
  const [selectedComplaintApplicant, setSelectedComplaintApplicant] = useState(null)
  const [loadingApplicantModal, setLoadingApplicantModal] = useState(false)
  const [copiedField, setCopiedField] = useState(null)

  // Delete Complaint Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const handleCopy = (text, field) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleOpenApplicantModal = async (complaint) => {
    setSelectedComplaintApplicant(complaint)
    setShowApplicantModal(true)
    if (complaint.applicant || complaint.citizen_details) {
      setSelectedApplicant(complaint.applicant || complaint.citizen_details)
      return
    }
    // Fetch if not present on list item
    setLoadingApplicantModal(true)
    try {
      const res = isAdmin 
        ? await adminAPI.applicantDetail(complaint.id).catch(() => complaintAPI.getApplicant(complaint.id))
        : await complaintAPI.getApplicant(complaint.id)
      setSelectedApplicant(res.data)
    } catch (err) {
      console.error('Failed to load applicant details:', err)
    } finally {
      setLoadingApplicantModal(false)
    }
  }

  const fetchStats = async () => {
    if (!isAdmin) return;
    try {
      const response = await adminAPI.stats()
      setStats(response.data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  const fetchComplaints = async () => {
    try {
      setLoading(true)
      const params = { page, page_size: pageSize }
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== '') params[k] = v
      })
      const response = isAdmin ? await adminAPI.complaints(params) : await complaintAPI.list(params)
      setComplaints(response.data.complaints)
      setTotal(response.data.total)
    } catch (err) {
      setError(formatErrorMessage(err, 'Failed to load complaints'))
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await (isAdmin ? adminAPI.categories() : complaintAPI.categories())
      setCategories(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      setCategories([])
    }
  }

  const fetchDepartments = async () => {
    if (!isAdmin) return;
    try {
      const response = await adminAPI.departments()
      const uniqueDepts = []
      const seen = new Set()
      for (const d of response.data) {
        if (!seen.has(d.display_name)) {
          seen.add(d.display_name)
          uniqueDepts.push(d)
        }
      }
      setDepartments(uniqueDepts)
    } catch (err) {
      console.error('Failed to fetch departments:', err)
    }
  }

  useEffect(() => {
    fetchStats()
    fetchComplaints()
    fetchCategories()
    fetchDepartments()
  }, [page, filters])

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({
      status: '',
      category_id: '',
      department_id: '',
      needs_human_review: '',
      search: '',
      sort_by: 'priority_score',
      sort_order: 'desc',
    })
    setPage(1)
  }

  const hasActiveFilters = Boolean(
    filters.status || 
    filters.category_id || 
    filters.department_id || 
    filters.needs_human_review || 
    filters.search
  )

  const activeFilterCount = [
    filters.status,
    filters.category_id,
    filters.department_id,
    filters.needs_human_review,
    filters.search,
  ].filter(Boolean).length

  const handleOpenAssessmentModal = (complaint) => {
    setAssessmentTarget(complaint)
    setAssessmentForm({
      severity_score: complaint.severity_score ?? 50,
      impact_score: complaint.impact_score ?? 50,
      urgency_score: complaint.urgency_score ?? 50,
      is_safety_escalated: !!complaint.is_safety_escalated,
      needs_human_review: !!complaint.needs_human_review,
      admin_notes: complaint.admin_override_reason || '',
    })
    setShowAssessmentModal(true)
  }

  const handleSaveAssessment = async () => {
    if (!assessmentTarget) return
    try {
      setSavingAssessment(true)
      await adminAPI.updateAssessment(assessmentTarget.id, {
        severity_score: Number(assessmentForm.severity_score),
        impact_score: Number(assessmentForm.impact_score),
        urgency_score: Number(assessmentForm.urgency_score),
        is_safety_escalated: Boolean(assessmentForm.is_safety_escalated),
        needs_human_review: Boolean(assessmentForm.needs_human_review),
        admin_override_reason: assessmentForm.admin_notes,
      })
      setShowAssessmentModal(false)
      setAssessmentTarget(null)
      await fetchComplaints()
      if (isAdmin) await fetchStats()
    } catch (err) {
      console.error('Failed to update assessment:', err)
      alert(formatErrorMessage(err, 'Failed to update assessment'))
    } finally {
      setSavingAssessment(false)
    }
  }

  const handleReassess = async (complaintId) => {
    try {
      setReassessingId(complaintId)
      const res = await adminAPI.reassess(complaintId)
      const updated = res.data
      if (assessmentTarget && assessmentTarget.id === complaintId) {
        setAssessmentTarget(updated)
        setAssessmentForm({
          severity_score: updated.severity_score ?? 50,
          impact_score: updated.impact_score ?? 50,
          urgency_score: updated.urgency_score ?? 50,
          is_safety_escalated: !!updated.is_safety_escalated,
          needs_human_review: !!updated.needs_human_review,
          admin_notes: updated.admin_override_reason || '',
        })
      }
      await fetchComplaints()
      if (isAdmin) await fetchStats()
    } catch (err) {
      console.error('Failed to re-assess complaint:', err)
      alert(formatErrorMessage(err, 'Failed to re-run AI assessment'))
    } finally {
      setReassessingId(null)
    }
  }

  const handleAssign = (complaint) => {
    setSelectedComplaint(complaint)
    setAssignDeptId(complaint.department_id ? String(complaint.department_id) : '')
    setShowAssignModal(true)
  }

  const confirmAssign = async () => {
    if (!selectedComplaint || !assignDeptId) return
    try {
      await adminAPI.assign(selectedComplaint.id, parseInt(assignDeptId))
      fetchComplaints()
      if (isAdmin) fetchStats()
      setShowAssignModal(false)
      setSelectedComplaint(null)
    } catch (err) {
      console.error('Assign failed:', err)
      alert(formatErrorMessage(err, 'Failed to assign department'))
    }
  }

  const requestStatusUpdate = (complaintId, targetStatus) => {
    const isStart = targetStatus === 'working'
    setConfirmModal({
      isOpen: true,
      complaintId,
      targetStatus,
      title: isStart ? 'Start Work on Complaint?' : 'Complete Complaint Work?',
      message: isStart
        ? 'Are you sure you want to start work on this complaint? The status will change from Pending to Ongoing.'
        : 'Are you sure you want to mark this complaint as completed? The status will change from Ongoing to Completed.',
      confirmText: isStart ? 'Yes, Start Work' : 'Yes, Mark Completed',
      variant: isStart ? 'primary' : 'success',
    })
  }

  const handleConfirmStatus = async () => {
    if (!confirmModal.complaintId || !confirmModal.targetStatus) return
    const { complaintId, targetStatus } = confirmModal
    setUpdatingStatus(true)
    try {
      await complaintAPI.update(complaintId, { status: targetStatus })
      setConfirmModal(prev => ({ ...prev, isOpen: false, complaintId: null, targetStatus: null }))
      await fetchComplaints()
      if (isAdmin) await fetchStats()
    } catch (err) {
      console.error('Status update failed:', err)
      alert(formatErrorMessage(err, 'Failed to update status. Please ensure your department is authorized for this complaint.'))
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleOpenDeleteModal = (complaint) => {
    setDeleteTarget(complaint)
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (isAdmin) {
        await adminAPI.deleteComplaint(deleteTarget.id)
      } else {
        await complaintAPI.delete(deleteTarget.id)
      }
      setComplaints((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setTotal((prev) => Math.max(0, prev - 1))
      setShowDeleteModal(false)
      setDeleteTarget(null)
      if (isAdmin) fetchStats()
    } catch (err) {
      console.error('Delete failed:', err)
      alert(formatErrorMessage(err, 'Failed to delete complaint'))
    } finally {
      setDeleting(false)
    }
  }

  if (!isAdmin && !isDepartment) {
    return <div className="page-container">Access denied</div>
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-heading-lg font-bold text-text-primary flex items-center gap-3">
            {isDepartment ? (
              <><Building2 className="h-7 w-7 text-primary-400" /> Department Dashboard</>
            ) : (
              <><Activity className="h-7 w-7 text-primary-400" /> Admin Dashboard</>
            )}
          </h1>
          <p className="text-body text-text-secondary mt-1">
            {isDepartment ? 'Manage and resolve complaints assigned to your department' : 'Manage and monitor civic complaints'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchComplaints}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard
            title="Open Complaints"
            value={stats.open_complaints}
            icon={FileText}
            gradient="from-primary-500/20 to-primary-500/5"
            iconColor="text-primary-400"
            borderGlow="border-primary-500/20"
            highlightValue
            trend={stats.resolved_this_week > 0 ? `+${stats.resolved_this_week} resolved this week` : null}
            trendColor="text-emerald-400"
          />
          <StatCard
            title="Awaiting Review"
            value={stats.needs_review_count || 0}
            icon={AlertTriangle}
            gradient="from-warm-500/20 to-warm-500/5"
            iconColor="text-warm-400"
            borderGlow="border-warm-500/20"
            trend="Needs Admin Triage"
            trendColor="text-warm-400"
          />
          <StatCard
            title="Resolved This Week"
            value={stats.resolved_this_week}
            icon={CheckCircle2}
            gradient="from-emerald-500/20 to-emerald-500/5"
            iconColor="text-emerald-400"
            borderGlow="border-emerald-500/20"
            trend={`Avg ${stats.avg_resolution_days} days to resolve`}
            trendColor="text-text-muted"
          />
          <StatCard
            title="Avg Resolution Time"
            value={`${stats.avg_resolution_days} days`}
            icon={Zap}
            gradient="from-warm-500/20 to-warm-500/5"
            iconColor="text-warm-400"
            borderGlow="border-warm-500/20"
            trend="Target: < 7 days"
            trendColor="text-text-muted"
          />
        </div>
      )}

      {/* Charts Row */}
      {stats && (
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <Card>
            <CardContent className="p-5">
              <h2 className="text-heading-sm font-bold text-text-primary mb-4 tracking-tight flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary-400" />
                Complaints by Category
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.by_category}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      stroke="rgba(17, 25, 26, 0.9)"
                      strokeWidth={2}
                      dataKey="count"
                      nameKey="category"
                      label={({ category, count, percent }) => `${category}: ${count} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {stats.by_category.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#11191a', borderColor: 'rgba(180, 220, 213, 0.12)', borderRadius: '12px', fontSize: '12px', color: '#eef8f5' }} formatter={(value) => [value, 'complaints']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="text-heading-sm font-bold text-text-primary mb-4 tracking-tight flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                Complaints by Status
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.by_status} layout="vertical">
                    <CartesianGrid strokeDasharray="2 2" stroke="rgba(180, 220, 213, 0.08)" vertical={false} />
                    <XAxis type="number" stroke="rgba(180, 220, 213, 0.12)" tick={{ fill: '#78908a', fontSize: 11 }} />
                    <YAxis dataKey="status" type="category" width={120} stroke="rgba(180, 220, 213, 0.12)" tick={{ fill: '#a9beb9', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#11191a', borderColor: 'rgba(180, 220, 213, 0.12)', borderRadius: '12px', fontSize: '12px', color: '#eef8f5' }} formatter={(value) => [value, 'complaints']} />
                    <Bar dataKey="count" fill="#65dece" radius={[0, 6, 6, 0]} maxBarWidth={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table Section Header & Filter Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-heading-sm font-bold text-text-primary flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-primary-400" />
            {isDepartment ? 'Assigned Complaints Queue' : 'Complaints Master Registry'}
          </h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-card border border-border text-text-secondary">
            {total} {total === 1 ? 'complaint' : 'complaints'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              className="text-text-muted hover:text-rose-400 text-xs gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Clear Filters
            </Button>
          )}

          <Button
            variant={showFilterBar ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowFilterBar(prev => !prev)}
            className={`gap-2 transition-all ${hasActiveFilters && !showFilterBar ? 'border-primary-500/50 text-primary-300' : ''}`}
            aria-expanded={showFilterBar}
            aria-label="Toggle Filters"
          >
            <Filter className="h-4 w-4" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${showFilterBar ? 'bg-white text-primary-950' : 'bg-primary-500 text-text-inverse'}`}>
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showFilterBar ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Active Filter Chips (visible when filter panel is collapsed so user knows what's applied) */}
      {!showFilterBar && hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-2.5 rounded-lg bg-surface-card/60 border border-border text-xs">
          <span className="text-text-muted flex items-center gap-1 font-medium">
            <Filter className="h-3 w-3 text-primary-400" />
            Active filters:
          </span>
          {filters.search && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
              "{filters.search}"
              <button type="button" onClick={() => handleFilterChange('search', '')} aria-label="Remove search filter"><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.status && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
              Status: {getStatusConfig(filters.status).label}
              <button type="button" onClick={() => handleFilterChange('status', '')} aria-label="Remove status filter"><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.category_id && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
              Category: {categories.find(c => String(c.id) === String(filters.category_id))?.display_name || filters.category_id}
              <button type="button" onClick={() => handleFilterChange('category_id', '')} aria-label="Remove category filter"><X className="h-3 w-3" /></button>
            </span>
          )}
          {isAdmin && filters.department_id && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
              Dept: {
                filters.department_id === 'unassigned'
                  ? 'Unassigned'
                  : filters.department_id === 'assigned'
                  ? 'All Assigned'
                  : departments.find(d => String(d.id) === String(filters.department_id))?.display_name || filters.department_id
              }
              <button type="button" onClick={() => handleFilterChange('department_id', '')} aria-label="Remove department filter"><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.needs_human_review && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
              Review: {filters.needs_human_review === 'true' ? 'Needs Review' : 'Verified'}
              <button type="button" onClick={() => handleFilterChange('needs_human_review', '')} aria-label="Remove review filter"><X className="h-3 w-3" /></button>
            </span>
          )}
          <button
            type="button"
            onClick={clearFilters}
            className="text-text-muted hover:text-rose-400 ml-auto transition-colors font-medium hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Expandable Filter Panel */}
      {showFilterBar && (
        <Card className="mb-6 border-primary-500/20 bg-surface-card/90 backdrop-blur-md">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/60">
              <div className="flex items-center gap-2 text-text-primary font-medium text-sm">
                <Sliders className="h-4 w-4 text-primary-400" />
                <span>Filter & Sort Complaints</span>
                {activeFilterCount > 0 && (
                  <span className="text-xs text-text-muted">({activeFilterCount} active)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs text-text-muted hover:text-rose-400 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-500/10"
                  >
                    <X className="h-3 w-3" />
                    Reset All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFilterBar(false)}
                  className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-elevated transition-colors"
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search complaints..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="input pl-9 w-full"
                  aria-label="Search complaints"
                />
                {filters.search && (
                  <button
                    type="button"
                    onClick={() => handleFilterChange('search', '')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="input w-auto min-w-[130px]"
                aria-label="Filter by status"
              >
                <option value="">All Status</option>
                {STATUS_ORDER.map((status) => {
                  const config = getStatusConfig(status)
                  return <option key={status} value={status}>{config.label}</option>
                })}
              </select>

              <select
                value={filters.category_id}
                onChange={(e) => handleFilterChange('category_id', e.target.value)}
                className="input w-auto min-w-[170px] bg-[#11191a] text-slate-100"
                aria-label="Filter by category"
              >
                <option value="" className="bg-[#11191a] text-slate-100">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id} className="bg-[#11191a] text-slate-100">{cat.display_name}</option>
                ))}
              </select>

              {isAdmin && (
                <select
                  value={filters.department_id}
                  onChange={(e) => handleFilterChange('department_id', e.target.value)}
                  className="input w-auto min-w-[175px] bg-[#11191a] text-slate-100"
                  aria-label="Filter by department"
                >
                  <option value="" className="bg-[#11191a] text-slate-100">All Departments</option>
                  <option value="unassigned" className="bg-[#11191a] text-warm-300 font-medium">Unassigned</option>
                  <option value="assigned" className="bg-[#11191a] text-emerald-300 font-medium">All Assigned</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id} className="bg-[#11191a] text-slate-100">{dept.display_name}</option>
                  ))}
                </select>
              )}

              <select
                value={filters.needs_human_review}
                onChange={(e) => handleFilterChange('needs_human_review', e.target.value)}
                className="input w-auto min-w-[160px] bg-[#11191a] text-slate-100"
                aria-label="Filter by review status"
              >
                <option value="" className="bg-[#11191a] text-slate-100">All Review Status</option>
                <option value="true" className="bg-[#11191a] text-slate-100">Needs Human Review</option>
                <option value="false" className="bg-[#11191a] text-slate-100">Clear / Verified</option>
              </select>

              <div className="flex items-center gap-1.5 bg-[#11191a] px-3 py-1.5 rounded-lg border border-border-strong text-slate-100">
                <ArrowUpDown className="h-3.5 w-3.5 text-primary-400" />
                <span className="text-xs text-text-muted font-medium">Sort:</span>
                <select
                  value={filters.sort_by}
                  onChange={(e) => handleFilterChange('sort_by', e.target.value)}
                  className="bg-[#11191a] text-slate-100 text-xs font-medium border-0 focus:ring-0 focus:outline-none cursor-pointer py-1 pr-2"
                  aria-label="Sort by"
                >
                  <option value="priority_score" className="bg-[#11191a] text-slate-100">Priority Score</option>
                  <option value="upvote_count" className="bg-[#11191a] text-slate-100">Upvotes</option>
                  <option value="created_at" className="bg-[#11191a] text-slate-100">Date Created</option>
                  <option value="status" className="bg-[#11191a] text-slate-100">Status</option>
                </select>
                <span className="text-border-strong">|</span>
                <select
                  value={filters.sort_order}
                  onChange={(e) => handleFilterChange('sort_order', e.target.value)}
                  className="bg-[#11191a] text-slate-100 text-xs font-medium border-0 focus:ring-0 focus:outline-none cursor-pointer py-1 pl-1"
                  aria-label="Sort order"
                >
                  <option value="desc" className="bg-[#11191a] text-slate-100">Descending</option>
                  <option value="asc" className="bg-[#11191a] text-slate-100">Ascending</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-border/40 text-xs">
                <span className="text-text-muted">Applied:</span>
                {filters.search && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
                    Search: "{filters.search}"
                    <button type="button" onClick={() => handleFilterChange('search', '')}><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filters.status && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
                    Status: {getStatusConfig(filters.status).label}
                    <button type="button" onClick={() => handleFilterChange('status', '')}><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filters.category_id && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
                    Category: {categories.find(c => String(c.id) === String(filters.category_id))?.display_name || filters.category_id}
                    <button type="button" onClick={() => handleFilterChange('category_id', '')}><X className="h-3 w-3" /></button>
                  </span>
                )}
                {isAdmin && filters.department_id && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
                    Dept: {
                      filters.department_id === 'unassigned'
                        ? 'Unassigned'
                        : filters.department_id === 'assigned'
                        ? 'All Assigned'
                        : departments.find(d => String(d.id) === String(filters.department_id))?.display_name || filters.department_id
                    }
                    <button type="button" onClick={() => handleFilterChange('department_id', '')}><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filters.needs_human_review && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/30">
                    Review: {filters.needs_human_review === 'true' ? 'Needs Review' : 'Verified'}
                    <button type="button" onClick={() => handleFilterChange('needs_human_review', '')}><X className="h-3 w-3" /></button>
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Complaints Table */}
      {error && (
        <Alert variant="danger" className="mb-6" dismissible onClose={() => setError('')}>
          {error}
          <Button variant="ghost" size="sm" onClick={fetchComplaints}>Retry</Button>
        </Alert>
      )}

      {loading && complaints.length === 0 ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton variant="circular" width="40" height="40" />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="text" width="60%" />
                </div>
                <Skeleton variant="text" width="80px" />
              </div>
            </Card>
          ))}
        </div>
      ) : complaints.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No complaints found"
          description="No complaints match your current filters. Try adjusting your search criteria."
          action={<Button variant="ghost" onClick={clearFilters}>Clear Filters</Button>}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface-card/50 backdrop-blur-sm">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-border text-left text-body-sm font-medium text-text-muted">
                  <th className="pb-3 pt-4 px-4">Complaint</th>
                  <th className="pb-3 pt-4 px-4 hidden md:table-cell">Category</th>
                  <th className="pb-3 pt-4 px-4 hidden lg:table-cell">Location</th>
                  <th className="pb-3 pt-4 px-4">Priority Score</th>
                  <th className="pb-3 pt-4 px-4">Upvotes</th>
                  <th className="pb-3 pt-4 px-4">Status</th>
                  <th className="pb-3 pt-4 px-4 hidden md:table-cell">Department</th>
                  <th className="pb-3 pt-4 px-4">Submitted / Assigned</th>
                  <th className="pb-3 pt-4 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {complaints.map((complaint) => (
                  <tr key={complaint.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-medium text-text-primary font-mono text-sm">#{complaint.id}</p>
                        <p className="text-body-sm text-text-secondary line-clamp-1 max-w-xs">
                          {truncate(complaint.description, 80)}
                        </p>
                        {complaint.applicant && (
                          <button
                            type="button"
                            onClick={() => handleOpenApplicantModal(complaint)}
                            className="mt-1 flex items-center gap-1 text-[11px] text-text-muted hover:text-primary-300 transition-colors"
                            title="View citizen details"
                          >
                            <UserCheck className="h-3 w-3 text-primary-400" />
                            <span className="truncate max-w-[170px]">
                              By: <span className="font-medium text-text-secondary hover:underline">{complaint.applicant.full_name}</span>
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 hidden md:table-cell">
                      <Badge variant="primary">{complaint.category?.display_name || 'General'}</Badge>
                    </td>
                    <td className="py-4 px-4 hidden lg:table-cell">
                      <p className="text-body-sm text-text-secondary max-w-xs truncate">
                        {complaint.location || '—'}
                      </p>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1.5 items-start min-w-[120px]">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base font-bold font-mono text-primary-300">
                            {complaint.priority_score != null ? Number(complaint.priority_score).toFixed(1) : '—'}
                          </span>
                          <span className="text-xs text-text-muted">/ 100</span>
                        </div>
                        <div className="w-24 h-1.5 bg-surface-hover/60 rounded-full overflow-hidden border border-border/40">
                          <div
                            className={classNames(
                              'h-full rounded-full transition-all',
                              (complaint.priority_score || 0) >= 80 ? 'bg-rose-500' :
                              (complaint.priority_score || 0) >= 60 ? 'bg-warm-500' :
                              (complaint.priority_score || 0) >= 35 ? 'bg-primary-500' : 'bg-slate-500'
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, complaint.priority_score || 0))}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {complaint.needs_human_review && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-warm-500/15 text-warm-400 border border-warm-500/30">
                              <AlertTriangle className="w-2.5 h-2.5" /> Review
                            </span>
                          )}
                          {complaint.is_safety_escalated && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <ShieldAlert className="w-2.5 h-2.5" /> Safety Hazard
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center text-warm-400 font-bold text-xs bg-warm-500/10 border border-warm-500/20 px-2.5 py-1 rounded-badge w-fit gap-1">
                         <ThumbsUp className="w-3.5 h-3.5" />
                         {complaint.upvote_count || 0}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <StatusBadge status={complaint.status || 'pending'} size="sm" />
                    </td>
                    <td className="py-4 px-4 hidden md:table-cell">
                      <span className="text-body-sm text-text-secondary">
                        {complaint.department?.display_name || departments.find(d => d.id === complaint.department_id)?.display_name || 'Unassigned'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1 min-w-[130px]">
                        <div className="flex items-center gap-1.5 text-body-sm text-text-secondary">
                          <Clock className="w-3.5 h-3.5 text-text-muted shrink-0" />
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-text-muted block leading-none">Submitted</span>
                            <span title={formatDateTime(complaint.created_at)} className="text-body-sm text-text-secondary">
                              {formatRelativeTime(complaint.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-body-sm pt-1 border-t border-border/40">
                          <CheckCircle2 className={classNames('w-3.5 h-3.5 shrink-0', (complaint.assigned_at || complaint.department) ? 'text-primary-400' : 'text-text-muted')} />
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-text-muted block leading-none">Assigned</span>
                            {complaint.assigned_at ? (
                              <span className="text-body-sm text-primary-400 font-medium" title={formatDateTime(complaint.assigned_at)}>
                                {formatRelativeTime(complaint.assigned_at)}
                              </span>
                            ) : complaint.department ? (
                              <span className="text-body-sm text-primary-400 font-medium" title={`Assigned with category: ${formatDateTime(complaint.created_at)}`}>
                                {formatRelativeTime(complaint.created_at)}
                              </span>
                            ) : (
                              <span className="text-caption text-text-muted italic">
                                Not assigned
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/complaints/${complaint.id}`)}>
                          View
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-text-secondary hover:text-text-primary"
                          onClick={() => handleOpenApplicantModal(complaint)}
                          title="View applicant details"
                        >
                          <UserCheck className="h-3.5 w-3.5 mr-1 text-primary-400" />
                          Citizen
                        </Button>
                        {isAdmin && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-primary-400 hover:text-primary-300"
                            onClick={() => handleOpenAssessmentModal(complaint)}
                            title="Triage & Assess"
                          >
                            <Sliders className="h-3.5 w-3.5 mr-1" />
                            Triage
                          </Button>
                        )}
                        {complaint.status !== 'completed' && (
                          <>
                            {isAdmin && (
                              <Button variant="secondary" size="sm" onClick={() => handleAssign(complaint)}>
                                {complaint.department_id ? 'Reassign' : 'Assign'}
                              </Button>
                            )}
                            {isDepartment && complaint.status === 'pending' && (
                              <Button variant="primary" size="sm" onClick={() => requestStatusUpdate(complaint.id, 'working')}>
                                Start Work
                              </Button>
                            )}
                            {isDepartment && complaint.status === 'working' && (
                              <Button variant="success" size="sm" onClick={() => requestStatusUpdate(complaint.id, 'completed')}>
                                Mark Completed
                              </Button>
                            )}
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          onClick={() => handleOpenDeleteModal(complaint)}
                          title="Delete Complaint"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > pageSize && (
            <div className="mt-6 flex items-center justify-between">
              <span className="text-body-sm text-text-muted">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} complaints
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 text-body-sm text-text-secondary">
                  Page {page} of {Math.ceil(total / pageSize)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(Math.ceil(total / pageSize), p + 1))}
                  disabled={page === Math.ceil(total / pageSize)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Assign Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => { setShowAssignModal(false); setSelectedComplaint(null); }}
        title={selectedComplaint?.department_id ? "Reassign Department" : "Assign Department"}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-body text-text-secondary">
            {selectedComplaint?.department_id ? 'Reassign' : 'Assign'} complaint <strong className="text-text-primary">#{selectedComplaint?.id}</strong> to a department:
          </p>
          <Select
            label="Department"
            options={departments.map(d => ({ value: d.id, label: d.display_name }))}
            placeholder="Select department"
            value={assignDeptId}
            onChange={(e) => setAssignDeptId(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => { setShowAssignModal(false); setSelectedComplaint(null); }}>
              Cancel
            </Button>
            <Button onClick={confirmAssign} disabled={!assignDeptId}>
              {selectedComplaint?.department_id ? 'Reassign' : 'Assign'}
            </Button>
          </div>
        </div>
      </Modal>

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

      {/* Priority Assessment Triage Modal */}
      {showAssessmentModal && assessmentTarget && (
        <Modal
          isOpen={showAssessmentModal}
          onClose={() => { setShowAssessmentModal(false); setAssessmentTarget(null); }}
          title="Triage & Prioritization Assessment"
          size="md"
        >
          <div className="space-y-5">
            {/* Header snippet */}
            <div className="p-3.5 rounded-xl bg-surface-elevated border border-border">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-mono text-sm font-bold text-text-primary">Complaint #{assessmentTarget.id}</span>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-500/10 border border-primary-500/20">
                  <Sparkles className="w-3.5 h-3.5 text-primary-400" />
                  <span className="text-xs font-mono font-bold text-primary-300">
                    Score: {assessmentTarget.priority_score != null ? Number(assessmentTarget.priority_score).toFixed(1) : '—'} / 100
                  </span>
                </div>
              </div>
              <p className="text-body-sm text-text-secondary line-clamp-2">{assessmentTarget.description || 'No description provided'}</p>
            </div>

            {/* AI Rationale & Missing Info if present */}
            {assessmentTarget.assessment_reason && (
              <div className="p-3 rounded-lg bg-surface-hover/40 border border-border/70 text-body-sm">
                <div className="flex items-center justify-between text-caption font-semibold uppercase tracking-wider text-text-muted mb-1">
                  <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-primary-400" /> AI Evaluation Rationale</span>
                  {assessmentTarget.assessment_confidence && (
                    <span className="capitalize text-text-secondary">Confidence: {assessmentTarget.assessment_confidence}</span>
                  )}
                </div>
                <p className="text-text-secondary leading-relaxed">{assessmentTarget.assessment_reason}</p>
                {assessmentTarget.missing_information && assessmentTarget.missing_information.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
                    <span className="text-caption text-text-muted mr-1">Missing details:</span>
                    {assessmentTarget.missing_information.map((item, i) => (
                      <span key={i} className="text-caption px-1.5 py-0.5 rounded bg-surface-card border border-border text-text-muted">
                        • {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Score Sliders */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-body-sm mb-1">
                  <span className="text-text-secondary font-medium">Severity Score (0–100) — Weight 40%</span>
                  <span className="font-mono text-primary-400 font-bold">{assessmentForm.severity_score}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={assessmentForm.severity_score}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, severity_score: parseInt(e.target.value) || 0 }))}
                  className="w-full accent-primary-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-body-sm mb-1">
                  <span className="text-text-secondary font-medium">Public Impact Score (0–100) — Weight 25%</span>
                  <span className="font-mono text-primary-400 font-bold">{assessmentForm.impact_score}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={assessmentForm.impact_score}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, impact_score: parseInt(e.target.value) || 0 }))}
                  className="w-full accent-primary-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-body-sm mb-1">
                  <span className="text-text-secondary font-medium">Urgency Score (0–100) — Weight 20%</span>
                  <span className="font-mono text-primary-400 font-bold">{assessmentForm.urgency_score}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={assessmentForm.urgency_score}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, urgency_score: parseInt(e.target.value) || 0 }))}
                  className="w-full accent-primary-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Checkbox Controls */}
            <div className="p-3 rounded-lg bg-surface-elevated border border-border space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer text-body-sm font-medium text-text-primary">
                <input
                  type="checkbox"
                  checked={assessmentForm.is_safety_escalated}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, is_safety_escalated: e.target.checked }))}
                  className="rounded border-border text-rose-500 focus:ring-rose-500/20"
                />
                <span>Immediate Safety Hazard Escalation (prioritizes safety response)</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-body-sm font-medium text-text-primary">
                <input
                  type="checkbox"
                  checked={assessmentForm.needs_human_review}
                  onChange={(e) => setAssessmentForm(prev => ({ ...prev, needs_human_review: e.target.checked }))}
                  className="rounded border-border text-warm-500 focus:ring-warm-500/20"
                />
                <span>Keep flagged for human review</span>
              </label>
            </div>

            {/* Admin Override Reason Notes */}
            <div>
              <label className="label">Admin Triage / Verification Notes</label>
              <textarea
                value={assessmentForm.admin_notes}
                onChange={(e) => setAssessmentForm(prev => ({ ...prev, admin_notes: e.target.value }))}
                placeholder="Notes on assessment adjustment, site inspection, or hazard confirmation..."
                rows={2}
                className="input resize-none"
              />
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleReassess(assessmentTarget.id)}
                disabled={reassessingId === assessmentTarget.id || savingAssessment}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                <RefreshCw className={classNames('h-3.5 w-3.5 mr-1', reassessingId === assessmentTarget.id ? 'animate-spin' : '')} />
                {reassessingId === assessmentTarget.id ? 'Re-evaluating...' : 'Re-run AI Assessment'}
              </Button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button variant="secondary" onClick={() => { setShowAssessmentModal(false); setAssessmentTarget(null); }} disabled={savingAssessment}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleSaveAssessment} loading={savingAssessment} disabled={savingAssessment}>
                  Save Assessment
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Applicant / Citizen Details Modal */}
      <Modal
        isOpen={showApplicantModal}
        onClose={() => setShowApplicantModal(false)}
        title="Applicant / Citizen Details"
        size="md"
      >
        {loadingApplicantModal && !selectedApplicant ? (
          <div className="py-10 text-center text-text-muted">
            <Loader className="h-6 w-6 animate-spin mx-auto mb-2 text-primary-400" />
            <p className="text-body-sm">Loading citizen details...</p>
          </div>
        ) : selectedApplicant ? (
          <div className="space-y-4">
            {/* Citizen Header */}
            <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-surface-elevated/70 border border-border">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base text-white shadow-sm flex-shrink-0"
                style={{ backgroundColor: generateAvatarColor(selectedApplicant.full_name || 'Citizen') }}
              >
                {getInitials(selectedApplicant.full_name || 'Citizen')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-text-primary text-base truncate">
                    {selectedApplicant.full_name || 'Anonymous Citizen'}
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="w-2.5 h-2.5" /> Verified
                  </span>
                </div>
                <p className="text-caption text-text-muted flex items-center gap-1.5 mt-0.5">
                  <span>Citizen ID: #{selectedApplicant.id}</span>
                  <span>•</span>
                  <span>User #{selectedApplicant.user_id}</span>
                  {selectedComplaintApplicant && (
                    <>
                      <span>•</span>
                      <span>Complaint #{selectedComplaintApplicant.id}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Contact Details */}
            <div className="space-y-2.5 text-body-sm">
              {/* Email */}
              <div className="p-3 rounded-xl bg-surface-elevated/40 border border-border/60 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Mail className="h-4 w-4 text-primary-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Email Address</span>
                    <a
                      href={`mailto:${selectedApplicant.email}?subject=JanSewa Complaint %23${selectedComplaintApplicant?.id || ''}: ${encodeURIComponent(selectedComplaintApplicant?.category?.display_name || 'Civic Issue')}`}
                      className="text-text-primary hover:text-primary-400 font-medium truncate block transition-colors"
                    >
                      {selectedApplicant.email}
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(selectedApplicant.email, 'email')}
                  className="p-1.5 text-text-muted hover:text-text-primary rounded-md hover:bg-surface-hover transition-colors"
                  title="Copy Email"
                >
                  {copiedField === 'email' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* Phone */}
              <div className="p-3 rounded-xl bg-surface-elevated/40 border border-border/60 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Phone className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Phone Number</span>
                    {selectedApplicant.phone ? (
                      <a
                        href={`tel:${selectedApplicant.phone}`}
                        className="text-text-primary hover:text-emerald-400 font-medium font-mono truncate block transition-colors"
                      >
                        {selectedApplicant.phone}
                      </a>
                    ) : (
                      <span className="text-text-muted italic">Not provided</span>
                    )}
                  </div>
                </div>
                {selectedApplicant.phone && (
                  <button
                    type="button"
                    onClick={() => handleCopy(selectedApplicant.phone, 'phone')}
                    className="p-1.5 text-text-muted hover:text-text-primary rounded-md hover:bg-surface-hover transition-colors"
                    title="Copy Phone"
                  >
                    {copiedField === 'phone' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>

              {/* Registered Address */}
              <div className="p-3 rounded-xl bg-surface-elevated/40 border border-border/60 flex items-start gap-2.5">
                <Home className="h-4 w-4 text-warm-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Saved Neighborhood Address</span>
                  <p className="text-text-secondary text-body-sm leading-relaxed">
                    {selectedApplicant.address || 'No saved neighborhood address on file'}
                  </p>
                  {selectedApplicant.latitude != null && selectedApplicant.longitude != null && (
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted font-mono">
                      <span>Coordinates: {selectedApplicant.latitude.toFixed(4)}, {selectedApplicant.longitude.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Relative Distance */}
              {selectedApplicant.latitude != null && selectedComplaintApplicant?.latitude != null && (() => {
                const dist = calculateDistanceKm(selectedApplicant.latitude, selectedApplicant.longitude, selectedComplaintApplicant.latitude, selectedComplaintApplicant.longitude)
                if (dist == null) return null
                return (
                  <div className="p-2.5 rounded-lg bg-primary-500/10 border border-primary-500/20 text-xs text-primary-300 flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-primary-400 shrink-0" />
                    <span>
                      Applicant resides <strong>{dist <= 0.1 ? '< 100m' : `${dist.toFixed(1)} km`}</strong> from this incident location
                      {dist <= 1.0 ? ' (Immediate Resident)' : ''}
                    </span>
                  </div>
                )
              })()}

              {/* Account Meta */}
              <div className="p-2.5 rounded-lg bg-surface-hover/30 border border-border flex flex-col gap-1 text-xs text-text-muted">
                {selectedApplicant.registered_at && (
                  <div className="flex justify-between items-center">
                    <span>Registered Account:</span>
                    <span className="font-medium text-text-secondary">{formatDate(selectedApplicant.registered_at)}</span>
                  </div>
                )}
                {selectedApplicant.preferred_notification_channels && (
                  <div className="flex justify-between items-center">
                    <span>Notification Channels:</span>
                    <span className="font-medium text-text-secondary capitalize">{selectedApplicant.preferred_notification_channels}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-border flex justify-between items-center gap-3">
              {selectedComplaintApplicant && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowApplicantModal(false)
                    navigate(`/admin/complaints/${selectedComplaintApplicant.id}`)
                  }}
                  className="text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  View Full Complaint
                </Button>
              )}
              <div className="flex items-center gap-2">
                <a
                  href={`mailto:${selectedApplicant.email}?subject=JanSewa Complaint %23${selectedComplaintApplicant?.id || ''}: ${encodeURIComponent(selectedComplaintApplicant?.category?.display_name || 'Civic Issue')}`}
                  className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email Citizen
                </a>
                <Button variant="secondary" size="sm" onClick={() => setShowApplicantModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-text-muted text-body-sm">
            No applicant details available for this incident.
          </div>
        )}
      </Modal>

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
                Complaint <strong>#{deleteTarget?.id}</strong> ({deleteTarget?.category?.display_name || 'Civic Issue'}) and all associated citizen votes, timeline records, and data will be permanently removed.
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
    </div>
  )
}

function StatCard({ title, value, icon: Icon, gradient, iconColor, borderGlow = '', highlightValue = false, trend, trendColor }) {
  return (
    <Card className={classNames('p-5 relative overflow-hidden', borderGlow)}>
      {/* Gradient background accent */}
      <div className={classNames('absolute inset-0 bg-gradient-to-br opacity-50', gradient)} />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-body-sm font-medium text-text-secondary">{title}</p>
            <p className={classNames('text-heading-lg font-bold mt-1 tracking-tight font-heading', highlightValue ? 'text-primary-400' : 'text-text-primary')}>
              {typeof value === 'number' ? formatNumber(value) : value}
            </p>
            {trend && (
              <p className={classNames('text-caption font-semibold mt-1.5', trendColor)}>{trend}</p>
            )}
          </div>
          <div className={classNames('w-11 h-11 rounded-xl flex items-center justify-center bg-surface-hover/50 border border-border')}>
            <Icon className={classNames('h-5 w-5', iconColor)} />
          </div>
        </div>
      </div>
    </Card>
  )
}

const CHART_COLORS = ['#65dece', '#dfb65c', '#75c9e7', '#29a99f', '#e8c879', '#4aadd5', '#ab7f31', '#20877f']

function Icon({ name, className }) {
  const icons = {
    refresh: RefreshIcon,
    FileText,
    AlertTriangle,
    CheckCircle2,
    Clock,
  }
  const Component = icons[name]
  return Component ? <Component className={className} /> : null
}

function RefreshIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
}

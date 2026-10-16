import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { complaintAPI } from '../services/api'
import { Button, Card, CardContent, StatusBadge, EmptyState, LoadingState, Skeleton } from '../components/UI'
import { Plus, FileText, Clock, MapPin, ChevronRight, RefreshCw, Filter, X, ThumbsUp, Loader, CheckCircle2, XCircle, AlertCircle, Sparkles } from 'lucide-react'
import { formatRelativeTime, getStatusConfig, classNames, truncate, formatErrorMessage } from '../utils/helpers'
import { LiveScanner } from '../components/LiveScanner'

const STATUS_ORDER = ['pending', 'working', 'completed']

export function CitizenDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ status: '' })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 10

  const fetchComplaints = async () => {
    try {
      setLoading(true)
      const cleanFilters = {}
      if (filters.status) cleanFilters.status_filter = filters.status
      const params = { page, page_size: pageSize, ...cleanFilters }
      const response = await complaintAPI.list(params)
      setComplaints(response.data.complaints || [])
      setTotal(response.data.total || 0)
      setError(null)
    } catch (err) {
      setError(formatErrorMessage(err, 'Failed to load complaints'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchComplaints()
  }, [page, filters])

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ status: '' })
    setPage(1)
  }

  const hasActiveFilters = filters.status

  if (loading && complaints.length === 0) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-heading-lg font-bold text-text-primary">My Complaints</h1>
            <p className="text-body text-text-secondary mt-1">Track the status of your civic complaints</p>
          </div>
          <Link to="/submit" className="btn-primary">
            <Plus className="h-4 w-4" />
            New Complaint
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" className="mt-2" />
              <Skeleton variant="rectangular" height="80px" className="mt-4" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-heading-lg font-bold text-text-primary flex items-center gap-3">
            <FileText className="h-7 w-7 text-primary-400" />
            My Complaints
          </h1>
          <p className="text-body text-text-secondary mt-1">Track the status of your civic complaints</p>
        </div>
        <Link to="/submit" className="btn-primary">
          <Plus className="h-4 w-4" />
          New Complaint
        </Link>
      </div>



      <LiveScanner existingComplaints={complaints} onComplaintFiled={fetchComplaints} />
      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary-400" />
              <span className="text-body-sm font-medium text-text-secondary">Filters:</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="input w-auto px-3 py-2 text-body-sm"
                aria-label="Filter by status"
              >
                <option value="">All Status</option>
                {STATUS_ORDER.map((status) => {
                  const config = getStatusConfig(status)
                  return (
                    <option key={status} value={status}>
                      {config.label}
                    </option>
                  )
                })}
              </select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Complaints List */}
      {error && (
        <Card className="mb-6 border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span>{typeof error === 'string' ? error : formatErrorMessage(error)}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchComplaints}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {complaints.length === 0 && !error && (
        <EmptyState
          icon={FileText}
          title="No complaints yet"
          description="You haven't submitted any complaints. Start by reporting a civic issue in your area."
          action={
            <Link to="/submit" className="btn-primary">
              <Plus className="h-4 w-4" />
              File Your First Complaint
            </Link>
          }
        />
      )}

      {complaints.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {complaints.map((complaint) => (
              <ComplaintCard key={complaint.id} complaint={complaint} />
            ))}
          </div>

          {/* Pagination */}
          {total > pageSize && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-body-sm text-text-secondary px-2">
                Page {page} of {Math.ceil(total / pageSize)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(Math.ceil(total / pageSize), p + 1))}
                disabled={page === Math.ceil(total / pageSize)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ComplaintCard({ complaint }) {
  const config = getStatusConfig(complaint.status || 'pending')
  const statusStep = STATUS_ORDER.indexOf(complaint.status || 'pending')
  const totalSteps = STATUS_ORDER.length
  const progress = ((statusStep + 1) / totalSteps) * 100

  const progressColors = {
    0: 'bg-warm-500',
    1: 'bg-accent-500',
    2: 'bg-emerald-500',
  }

  return (
    <Card className="overflow-hidden hover:shadow-card-hover hover:border-primary-500/20 transition-all duration-300 hover-lift">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-body font-semibold text-text-primary line-clamp-1">
              {complaint.category?.display_name || 'General Complaint'}
            </h3>
            <p className="text-body-sm text-text-secondary mt-0.5 line-clamp-2">
              {truncate(complaint.description, 120)}
            </p>
          </div>
          <div className="flex flex-col items-end">
            <span className="flex items-center text-warm-400 font-bold text-sm bg-warm-500/10 border border-warm-500/20 px-2.5 py-1 rounded-lg gap-1">
               <ThumbsUp className="w-4 h-4" />
               {complaint.upvote_count || 0}
            </span>
          </div>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-3 text-body-sm text-text-muted mb-3">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {truncate(complaint.location, 25) || 'Unknown location'}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatRelativeTime(complaint.created_at)}
          </span>
        </div>

        {/* Progress indicator */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-caption text-text-muted mb-1.5">
            <span>Progress</span>
            <span className="font-medium text-text-secondary">{config.label}</span>
          </div>
          <div className="h-1.5 bg-surface-hover/50 rounded-full overflow-hidden">
            <div
              className={classNames('h-full transition-all duration-500 rounded-full', progressColors[statusStep] || 'bg-primary-500')}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {STATUS_ORDER.map((step, idx) => (
              <div
                key={step}
                className={classNames(
                  'flex flex-col items-center gap-1',
                  idx <= statusStep ? 'text-primary-400' : 'text-text-muted'
                )}
              >
                <div
                  className={classNames(
                    'w-2.5 h-2.5 rounded-full border-2 transition-colors',
                    idx < statusStep ? 'bg-primary-500 border-primary-500' :
                    idx === statusStep ? 'bg-primary-500 border-primary-500 ring-2 ring-primary-500/30' :
                    'bg-surface border-border-strong'
                  )}
                />
                <span className="text-[10px] font-medium truncate w-20 text-center">
                  {getStatusConfig(step).label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Link
            to={`/complaint/${complaint.id}`}
            className="btn-ghost text-body-sm gap-1 text-primary-400 hover:text-primary-300"
          >
            View Details
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={complaint.status || 'pending'} size="sm" />
          </div>
        </div>
      </div>
    </Card>
  )
}

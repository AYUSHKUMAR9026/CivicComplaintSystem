import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { complaintAPI } from '../services/api'
import { Card, CardContent, StatusBadge, Badge, EmptyState, LoadingState, Skeleton, Button, Alert } from '../components/UI'
import { MapPin, Clock, ThumbsUp, ChevronRight, Filter, X, Eye, Share2, Heart, FileText, Flag, UserCheck, Loader, CheckCircle2, XCircle, Plus, Globe, Navigation } from 'lucide-react'
import { formatRelativeTime, getStatusConfig, classNames, truncate, formatErrorMessage, calculateDistanceKm } from '../utils/helpers'
import { LocationModal } from '../components/LocationModal'

const STATUS_ORDER = ['pending', 'working', 'completed']

export function PublicFeedPage() {
  const { user, isAuthenticated } = useAuth()
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ status: '', category_id: '' })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 12
  const [upvoting, setUpvoting] = useState({})
  
  // Location guard state for 25km radius
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [pendingUpvote, setPendingUpvote] = useState(null)
  const [upvoteMessage, setUpvoteMessage] = useState(null)

  const fetchComplaints = async () => {
    try {
      setLoading(true)
      const cleanFilters = {}
      if (filters.status) cleanFilters.status_filter = filters.status
      if (filters.category_id) cleanFilters.category_id = parseInt(filters.category_id)
      const params = { page, page_size: pageSize, ...cleanFilters }
      
      const response = await (complaintAPI.listPublic ? complaintAPI.listPublic(params) : complaintAPI.list(params))
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
  }, [page, filters, user?.latitude, user?.longitude])

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ status: '', category_id: '' })
    setPage(1)
  }

  const handleUpvote = async (complaint) => {
    const complaintId = complaint.id
    if (!isAuthenticated) {
      alert('Please sign in to upvote complaints')
      return
    }

    // Only pending complaints can be upvoted
    if (complaint.status && complaint.status !== 'pending') {
      setUpvoteMessage({
        type: 'warning',
        text: `Voting is only allowed when the incident status is pending (current status: ${complaint.status}).`
      })
      return
    }

    // Intercept if user has no saved location (Requirement 4)
    if (user?.latitude == null || user?.longitude == null) {
      setPendingUpvote(complaint)
      setShowLocationModal(true)
      return
    }

    if (upvoting[complaintId]) return
    
    setUpvoting((prev) => ({ ...prev, [complaintId]: true }))
    try {
      await complaintAPI.upvote(complaintId)
      setComplaints((prev) => prev.map((c) => 
        c.id === complaintId ? { ...c, upvote_count: (c.upvote_count || 0) + 1, user_voted: true } : c
      ))
      setUpvoteMessage({ type: 'success', text: `Upvoted complaint #${complaintId}!` })
    } catch (err) {
      setUpvoteMessage({ type: 'danger', text: formatErrorMessage(err, 'Failed to upvote complaint.') })
    } finally {
      setUpvoting((prev) => ({ ...prev, [complaintId]: false }))
    }
  }

  const handleLocationSaved = async (newLoc) => {
    fetchComplaints()

    // Resume pending upvote if user attempted to vote before saving location
    if (pendingUpvote) {
      const target = pendingUpvote
      setPendingUpvote(null)

      const dist = calculateDistanceKm(
        newLoc.latitude, newLoc.longitude, target.latitude, target.longitude
      )

      if (dist !== null && dist > 25.0) {
        setUpvoteMessage({
          type: 'danger',
          text: `Location saved. However, incident #${target.id} is ${dist.toFixed(1)} km away, which is outside your permitted 25 km community radius and cannot be upvoted.`
        })
        return
      }

      if (target.status && target.status !== 'pending') {
        setUpvoteMessage({
          type: 'warning',
          text: `Location saved. However, incident #${target.id} is ${target.status} and can no longer be upvoted.`
        })
        return
      }

      // Automatically proceed with original upvote action
      setUpvoting((prev) => ({ ...prev, [target.id]: true }))
      try {
        await complaintAPI.upvote(target.id)
        setComplaints((prev) => prev.map((c) => 
          c.id === target.id ? { ...c, upvote_count: (c.upvote_count || 0) + 1, user_voted: true } : c
        ))
        setUpvoteMessage({
          type: 'success',
          text: `Location saved! Complaint #${target.id} was automatically upvoted.`
        })
      } catch (err) {
        setUpvoteMessage({
          type: 'danger',
          text: formatErrorMessage(err, 'Failed to upvote after saving location.')
        })
      } finally {
        setUpvoting((prev) => ({ ...prev, [target.id]: false }))
      }
    } else {
      setUpvoteMessage({
        type: 'success',
        text: 'Community location updated successfully! Feed filtered to 25 km radius.'
      })
    }
  }

  const hasActiveFilters = filters.status || filters.category_id

  if (loading && complaints.length === 0) {
    return (
      <div className="page-container">
        <div className="mb-6">
          <h1 className="text-heading-lg font-bold text-text-primary">Public Complaint Feed</h1>
          <p className="text-body text-text-secondary mt-1">Browse and support civic complaints in your community</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-heading-lg font-bold text-text-primary flex items-center gap-3">
            <Globe className="h-7 w-7 text-emerald-400" />
            Public Incident Feed
          </h1>
          <p className="text-body text-text-secondary mt-1">Browse and support civic complaints within your 25 km community radius</p>
        </div>
        {isAuthenticated && (
          <Link to="/submit" className="btn-primary">
            <Plus className="h-4 w-4" />
            Report Issue
          </Link>
        )}
      </div>

      {/* Upvote & Action Feedback Message */}
      {upvoteMessage && (
        <Alert
          variant={upvoteMessage.type || 'info'}
          className="mb-6"
          dismissible
          onClose={() => setUpvoteMessage(null)}
        >
          {upvoteMessage.text}
        </Alert>
      )}

      {/* Community Location Banner */}
      {isAuthenticated && (
        user?.latitude == null || user?.longitude == null ? (
          <Card className="mb-6 border-warm-500/30 bg-warm-500/10">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-warm-500/20 text-warm-300 shrink-0">
                  <MapPin className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary text-body">Set Your Location to View & Support Incidents</h3>
                  <p className="text-body-sm text-text-secondary mt-0.5">
                    JanSewa displays incidents within a 25 km radius of your saved profile location. Please set your neighborhood on the map.
                  </p>
                </div>
              </div>
              <Button variant="primary" onClick={() => setShowLocationModal(true)} className="whitespace-nowrap shrink-0">
                <MapPin className="h-4 w-4" />
                Set Location Now
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mb-6 p-3.5 rounded-xl bg-surface-card border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-body-sm shadow-sm">
            <div className="flex items-center gap-2.5 text-text-secondary">
              <Navigation className="h-4 w-4 text-primary-400 shrink-0" />
              <span>
                Filtering incidents within <strong className="text-text-primary">25 km</strong> of{' '}
                <span className="text-primary-300 font-medium">{user.address || `${user.latitude.toFixed(2)}, ${user.longitude.toFixed(2)}`}</span>
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowLocationModal(true)} className="text-xs">
              <MapPin className="h-3.5 w-3.5 text-primary-400" />
              Change Location
            </Button>
          </div>
        )
      )}

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
                className="input w-auto"
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
                className="input w-auto"
                aria-label="Filter by category"
              >
                <option value="">All Categories</option>
                <option value="1">Pothole / Road Damage</option>
                <option value="2">Garbage / Waste</option>
                <option value="3">Water Leakage</option>
                <option value="4">Streetlight Issue</option>
                <option value="5">Sewage Overflow</option>
                <option value="6">Traffic Signal</option>
                <option value="7">Footpath / Sidewalk</option>
                <option value="8">Drainage / Waterlogging</option>
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

      {error && (
        <Alert variant="danger" className="mb-6" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {complaints.length === 0 && !error && (
        <EmptyState
          icon={user?.latitude == null ? MapPin : Eye}
          title={user?.latitude == null ? "Location required to view community incidents" : "No incidents found within 25 km"}
          description={
            user?.latitude == null
              ? "Please set your community location to discover incidents reported within 25 km of your area."
              : "There are currently no reported incidents within 25 km of your saved profile location matching your filters."
          }
          action={
            user?.latitude == null ? (
              <Button variant="primary" onClick={() => setShowLocationModal(true)}>
                <MapPin className="h-4 w-4" />
                Set My Community Location
              </Button>
            ) : (
              <Button variant="ghost" onClick={clearFilters}>Clear Filters</Button>
            )
          }
        />
      )}

      {complaints.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {complaints.map((complaint) => (
              <PublicComplaintCard
                key={complaint.id}
                complaint={complaint}
                user={user}
                onUpvote={() => handleUpvote(complaint)}
                upvoting={upvoting[complaint.id]}
                isAuthenticated={isAuthenticated}
              />
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

      {/* Location Modal for Setting Profile Location */}
      <LocationModal
        isOpen={showLocationModal}
        onClose={() => {
          setShowLocationModal(false)
          setPendingUpvote(null)
        }}
        onSuccess={handleLocationSaved}
        title={pendingUpvote ? "Location Required for Upvoting" : "Set Your Community Location"}
        explanation={
          pendingUpvote
            ? "Please add your location before upvoting. You can only view and support incidents within 25 km of your saved location."
            : "JanSewa connects you with your local community. Set your neighborhood location to view incidents within a 25 km radius."
        }
      />
    </div>
  )
}

function PublicComplaintCard({ complaint, user, onUpvote, upvoting, isAuthenticated }) {
  const config = getStatusConfig(complaint.status || 'pending')
  const statusStep = STATUS_ORDER.indexOf(complaint.status || 'pending')

  const progressColors = {
    0: 'bg-warm-500',
    1: 'bg-accent-500',
    2: 'bg-emerald-500',
  }

  // Calculate straight-line distance in km from user's saved location
  const distanceKm = user?.latitude != null && complaint.latitude != null
    ? calculateDistanceKm(user.latitude, user.longitude, complaint.latitude, complaint.longitude)
    : null

  return (
    <Card className="overflow-hidden hover:shadow-card-hover hover:border-primary-500/20 transition-all duration-300 hover-lift h-full flex flex-col">
      <div className="p-4 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-body font-semibold text-text-primary line-clamp-1">
              {complaint.category?.display_name || 'General Complaint'}
            </h3>
            <p className="text-body-sm text-text-secondary mt-0.5 line-clamp-2">
              {truncate(complaint.description, 120)}
            </p>
          </div>
        </div>

        {/* Meta & Distance */}
        <div className="flex flex-wrap items-center gap-2.5 text-body-sm text-text-muted mb-3">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-text-muted" />
            {truncate(complaint.location, 24) || 'Unknown location'}
          </span>
          {distanceKm != null && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-300 border border-primary-500/20">
              <Navigation className="h-3 w-3" />
              {distanceKm <= 0.1 ? '< 100m' : `${distanceKm.toFixed(1)} km`}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatRelativeTime(complaint.created_at)}
          </span>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-caption text-text-muted mb-1.5">
            <span>Status Progress</span>
            <StatusBadge status={complaint.status || 'pending'} size="sm" />
          </div>
          <div className="h-1.5 bg-surface-hover/50 rounded-full overflow-hidden">
            <div
              className={classNames('h-full transition-all duration-500 rounded-full', progressColors[statusStep] || 'bg-primary-500')}
              style={{ width: `${((statusStep + 1) / STATUS_ORDER.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Link
            to={`/complaint/${complaint.id}`}
            className="btn-ghost text-body-sm gap-1 text-primary-400 hover:text-primary-300"
          >
            <Eye className="h-3.5 w-3.5" />
            View Details
          </Link>
          <button
            onClick={onUpvote}
            disabled={upvoting || !isAuthenticated || complaint.user_voted || (complaint.status && complaint.status !== 'pending')}
            title={complaint.status && complaint.status !== 'pending' ? `Voting closed (${complaint.status})` : 'Upvote incident'}
            className={classNames(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-button text-body-sm font-medium transition-all duration-200',
              complaint.user_voted
                ? 'bg-primary-500/10 text-primary-400 border border-primary-500/20'
                : complaint.status && complaint.status !== 'pending'
                ? 'opacity-40 cursor-not-allowed bg-surface-hover/30 text-text-muted border border-border/50'
                : 'bg-surface-hover/50 text-text-secondary border border-border hover:bg-surface-hover hover:text-text-primary'
            )}
            aria-label="Upvote"
          >
            <ThumbsUp className={classNames('h-4 w-4', complaint.user_voted ? 'text-primary-400' : '')} />
            <span>{complaint.upvote_count || 0}</span>
          </button>
        </div>
      </div>
    </Card>
  )
}

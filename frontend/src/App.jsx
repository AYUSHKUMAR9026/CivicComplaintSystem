import React, { useEffect, Component } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Header } from './components/Layout'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#ffebee', color: '#c62828', minHeight: '100vh' }}>
          <h2>Something went wrong in the React App.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            <summary>Click for error details</summary>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children; 
  }
}

import { 
  LoginPage, 
  RegisterPage 
} from './pages/AuthPages'
import { CitizenDashboard } from './pages/CitizenDashboard'
import { SubmitComplaintPage } from './pages/SubmitComplaintPage'
import { ComplaintDetailPage } from './pages/ComplaintDetailPage'
import { PublicFeedPage } from './pages/PublicFeedPage'
import { AdminDashboard } from './pages/AdminDashboard'
import { DetectionDemoPage } from './pages/DetectionDemoPage'

// Layout wrapper with header
function MainLayout() {
  const { loading, isAuthenticated } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-elevated flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-elevated bg-mesh">
      <Header />
      <main className="pt-0">
        <Outlet />
      </main>
    </div>
  )
}

// Protected route for authenticated users
function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-elevated flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-3 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    if (user?.role === 'admin') return <Navigate to="/admin" replace />
    if (user?.role === 'department') return <Navigate to="/department" replace />
    return <Navigate to="/dashboard" replace />
  }
  
  return children
}

// Public route (redirects authenticated users to dashboard)
function PublicRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-elevated flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-3 border-primary-500 border-t-transparent rounded-full" />
      </div>
    )
  }
  
  if (isAuthenticated) {
    if (user?.role === 'admin') return <Navigate to="/admin" replace />
    if (user?.role === 'department') return <Navigate to="/department" replace />
    return <Navigate to="/dashboard" replace />
  }
  
  return children
}

function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role === 'admin') return <Navigate to="/admin" replace />
  if (user?.role === 'department') return <Navigate to="/department" replace />
  return <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        } />
        <Route path="/register" element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        } />
        
        {/* Protected routes with main layout */}
        <Route element={<MainLayout />}>
          {/* Citizen routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <CitizenDashboard />
            </ProtectedRoute>
          } />
          <Route path="/submit" element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <SubmitComplaintPage />
            </ProtectedRoute>
          } />
          <Route path="/feed" element={
            <ProtectedRoute allowedRoles={['citizen']}>
              <PublicFeedPage />
            </ProtectedRoute>
          } />
          <Route path="/detect" element={
            <ProtectedRoute>
              <DetectionDemoPage />
            </ProtectedRoute>
          } />
          <Route path="/complaint/:id" element={
            <ProtectedRoute>
              <ComplaintDetailPage />
            </ProtectedRoute>
          } />
          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/complaints/:id" element={
            <ProtectedRoute allowedRoles={['admin', 'department']}>
              <ComplaintDetailPage />
            </ProtectedRoute>
          } />
          <Route path="/admin/*" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          
          {/* Department routes */}
          <Route path="/department" element={
            <ProtectedRoute allowedRoles={['department', 'admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/department/*" element={
            <ProtectedRoute allowedRoles={['department', 'admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
        </Route>
        
        {/* Redirect root to dashboard or login */}
        <Route path="/" element={<RootRedirect />} />
        
        {/* 404 */}
        <Route path="*" element={
          <div className="min-h-screen flex items-center justify-center bg-surface-elevated bg-mesh">
            <div className="text-center">
              <h1 className="text-heading-lg font-bold text-text-primary">Page Not Found</h1>
              <p className="text-body text-text-secondary mt-2">The page you're looking for doesn't exist.</p>
              <button 
                onClick={() => window.history.back()}
                className="btn-primary mt-4"
              >
                Go Back
              </button>
            </div>
          </div>
        } />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
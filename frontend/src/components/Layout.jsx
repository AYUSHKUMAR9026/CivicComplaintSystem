import React from 'react'
import { Link, useLocation, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from './UI'
import {
  LayoutDashboard,
  FileText,
  LogOut,
  FolderKanban,
  MapPin,
  ChevronDown,
  Menu,
  X,
  Sparkles,
  ScanLine,
} from 'lucide-react'
import { classNames, truncate } from '../utils/helpers'
import { Logo } from './LogoMark'
import { LocationModal } from './LocationModal'

const NAV_ITEMS_CITIZEN = [
  { path: '/dashboard', label: 'My Complaints', icon: FileText },
  { path: '/submit', label: 'New Complaint', icon: MapPin },
  { path: '/feed', label: 'Public Feed', icon: FolderKanban },
  { path: '/detect', label: 'Detect Damage', icon: ScanLine },
]

const NAV_ITEMS_ADMIN = [
  { path: '/detect', label: 'Detect Damage', icon: ScanLine },
]

const NAV_ITEMS_DEPARTMENT = [
  { path: '/detect', label: 'Detect Damage', icon: ScanLine },
]

export function Header() {
  const { user, logout, isAuthenticated, isAdmin, isDepartment, isCitizen } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const [userMenuOpen, setUserMenuOpen] = React.useState(false)
  const [showLocationModal, setShowLocationModal] = React.useState(false)

  const navItems = isAdmin ? NAV_ITEMS_ADMIN : isDepartment ? NAV_ITEMS_DEPARTMENT : NAV_ITEMS_CITIZEN

  return (
    <>
      <header className="sticky top-0 z-40 bg-surface-elevated/90 backdrop-blur-xl border-b border-border shadow-[0_1px_0_rgba(255,255,255,0.02)]">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to={isAdmin || isDepartment ? '/admin' : '/dashboard'} className="flex items-center gap-2.5 group" aria-label="JanSewa Home">
            <Logo size="sm" showText={true} />
          </Link>

          {/* Desktop Navigation */}
          {navItems.length > 0 && (
            <div className="hidden md:flex md:items-center md:gap-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path || 
                  (item.path !== '/' && location.pathname.startsWith(item.path + '/'))
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => classNames(
                      'flex items-center gap-2 px-3.5 py-2 rounded-button text-body-sm font-medium transition-all duration-200 relative',
                      isActive
                        ? 'bg-surface-paper text-primary-300 border border-primary-400/20 shadow-inner-glow'
                        : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary border border-transparent'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-warm-400 rounded-full" />
                    )}
                  </NavLink>
                )
              })}
            </div>
          )}

          {/* Right side actions */}
          <div className="flex items-center gap-3">
            {/* Citizen Community Location Pill */}
            {isAuthenticated && isCitizen && (
              <button
                type="button"
                onClick={() => setShowLocationModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border-strong bg-surface-card hover:bg-surface-hover hover:border-primary-400/30 transition-all text-text-secondary hover:text-text-primary"
                title={user?.address ? `Community location: ${user.address}` : 'Set community location for 25 km feed'}
              >
                <MapPin className={classNames('h-3.5 w-3.5', user?.latitude != null ? 'text-primary-400' : 'text-warm-400 animate-pulse')} />
                <span className="max-w-[120px] truncate hidden sm:inline">
                  {user?.address ? truncate(user.address, 16) : 'Set Location'}
                </span>
                <span className="text-[10px] text-warm-300 font-mono bg-warm-400/10 px-1.5 py-0.5 rounded-full border border-warm-400/20">25 km</span>
              </button>
            )}

            {/* User Menu */}
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2.5 p-1.5 rounded-button hover:bg-surface-hover transition-all duration-200 group"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                >
                  <div className={classNames('w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-xs text-surface-elevated ring-2 ring-primary-400/20 group-hover:ring-primary-400/40 transition-all', generateAvatarColor())}>
                    {getInitials(user?.full_name || 'User')}
                  </div>
                  <span className="hidden sm:block text-body-sm font-medium text-text-primary">{user?.full_name}</span>
                  <ChevronDown className={classNames('h-4 w-4 text-text-muted transition-transform duration-200', userMenuOpen && 'rotate-180')} />
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 bg-surface-card rounded-card shadow-elevated border border-border-strong overflow-hidden z-50 animate-fade-in backdrop-blur-xl">
                      <div className="px-4 py-3 border-b border-border bg-surface-hover/30">
                        <p className="text-body-sm font-medium text-text-primary">{user?.full_name}</p>
                        <p className="text-caption text-text-muted truncate">{user?.email}</p>
                        <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 text-caption font-semibold rounded-full bg-primary-500/15 text-primary-400 capitalize">
                          <Sparkles className="h-3 w-3" />
                          {user?.role}
                        </span>
                      </div>
                      {isCitizen && (
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false)
                            setShowLocationModal(true)
                          }}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-body-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors text-left"
                        >
                          <MapPin className="h-4 w-4 text-primary-400" />
                          <div>
                            <span className="block font-medium">Community Location</span>
                            <span className="block text-caption text-text-muted truncate max-w-[190px]">
                              {user?.address ? truncate(user.address, 22) : 'Not configured (Click to set)'}
                            </span>
                          </div>
                        </button>
                      )}
                      <hr className="my-1 border-border" />
                      <button
                        onClick={logout}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-body-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="hidden sm:flex sm:items-center sm:gap-2">
                <Link to="/login" className="btn-ghost text-body-sm">Sign In</Link>
                <Link to="/register" className="btn-primary text-body-sm">Get Started</Link>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-button text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div id="mobile-menu" className="md:hidden py-4 border-t border-border animate-slide-up">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={classNames(
                      'flex items-center gap-3 px-3 py-2.5 rounded-button text-body font-medium transition-all',
                      isActive
                        ? 'bg-primary-500/10 text-primary-400'
                        : 'text-text-secondary hover:bg-surface-hover'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </NavLink>
                )
              })}
              {navItems.length > 0 && <hr className="my-2 border-border" />}
              {isAuthenticated ? (
                <>
                  {(isAdmin || isDepartment) && (
                    <NavLink
                      to="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className={classNames(
                        'flex items-center gap-3 px-3 py-2.5 rounded-button text-body font-medium transition-all',
                        location.pathname === '/admin' ? 'bg-primary-500/10 text-primary-400' : 'text-text-secondary hover:bg-surface-hover'
                      )}
                    >
                      <LayoutDashboard className="h-5 w-5" />
                      Dashboard
                    </NavLink>
                  )}
                  {isCitizen && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false)
                        setShowLocationModal(true)
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-button text-body font-medium text-text-secondary hover:bg-surface-hover w-full text-left transition-colors"
                    >
                      <MapPin className="h-5 w-5 text-primary-400" />
                      <span>Community Location</span>
                    </button>
                  )}
                  <hr className="my-2 border-border" />
                  <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 text-body font-medium text-red-400 hover:bg-red-500/10 rounded-button transition-colors">
                    <LogOut className="h-5 w-5" />
                    Sign Out
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2 pt-2">
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="btn-secondary w-full justify-center">Sign In</Link>
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="btn-primary w-full justify-center">Get Started</Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>

    {/* Community Location Modal */}
    <LocationModal
      isOpen={showLocationModal}
      onClose={() => setShowLocationModal(false)}
      title="My Community Location"
      explanation="Set your neighborhood center to automatically view and upvote incidents within 25 km of your location. Your home coordinates are never shared publicly."
    />
  </>
)
}

function generateAvatarColor() {
  return 'bg-gradient-to-br from-warm-300 to-warm-500'
}

function getInitials(name) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

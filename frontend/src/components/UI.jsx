import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { classNames, getPriorityConfig, getStatusConfig } from '../utils/helpers'
import { X } from 'lucide-react'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  onClick,
  type = 'button',
  ...props
}) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    success: 'btn-success',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-body-sm gap-1.5',
    md: 'px-4 py-2.5 text-body gap-2',
    lg: 'px-6 py-3 text-body-lg gap-2',
  }

  return (
    <button
      type={type}
      className={classNames(variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  )
}

export function Input({
  label,
  error,
  className = '',
  id,
  ...props
}) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${inputId}-error`
  
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={classNames('input', error && 'input-error', className)}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1.5 text-body-sm text-red-400 flex items-center gap-1" role="alert">
          <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </p>
      )}
    </div>
  )
}

export function Textarea({
  label,
  error,
  className = '',
  id,
  rows = 4,
  ...props
}) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${inputId}-error`
  
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        className={classNames('input resize-none', error && 'input-error', className)}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1.5 text-body-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function Select({
  label,
  error,
  options = [],
  placeholder,
  className = '',
  id,
  ...props
}) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${inputId}-error`
  
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={classNames('input appearance-none bg-no-repeat bg-right pr-10', error && 'input-error', className)}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="mt-1.5 text-body-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={classNames('card', hover && 'hover:shadow-card-hover hover:border-primary-500/20 cursor-pointer hover-lift', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', ...props }) {
  return (
    <div className={classNames('px-5 py-4 border-b border-border', className)} {...props}>
      {children}
    </div>
  )
}

export function CardContent({ children, className = '', ...props }) {
  return (
    <div className={classNames('p-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '', ...props }) {
  return (
    <div className={classNames('px-5 py-4 border-t border-border bg-surface-hover/20', className)} {...props}>
      {children}
    </div>
  )
}

export function Badge({ children, variant = 'default', className = '', icon, ...props }) {
  const variants = {
    default: 'bg-surface-hover/50 text-text-secondary border-border',
    primary: 'bg-primary-500/10 text-primary-400 border-primary-500/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-warm-500/10 text-warm-400 border-warm-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-accent-500/10 text-accent-300 border-accent-500/20',
    accent: 'bg-warm-500/10 text-warm-300 border-warm-500/20',
  }

  return (
    <span
      className={classNames('badge rounded-badge font-semibold tracking-wide', variants[variant], className)}
      {...props}
    >
      {icon && <span className="mr-1.5 flex items-center">{icon}</span>}
      {children}
    </span>
  )
}

export function PriorityBadge({ priority, showIcon = true, size = 'md' }) {
  const config = getPriorityConfig(priority)
  const sizes = {
    sm: 'px-2 py-0.5 text-caption gap-1',
    md: 'px-2.5 py-1 text-body-sm gap-1.5',
    lg: 'px-3 py-1 text-body gap-2',
  }

  const IconComponent = showIcon ? getIconComponent(config.icon) : null

  return (
    <span
      className={classNames(
        'inline-flex items-center font-bold rounded-badge border uppercase tracking-wider',
        config.bg,
        config.border,
        config.text,
        sizes[size]
      )}
      role="status"
      aria-label={`Priority: ${config.label}`}
    >
      {IconComponent && <IconComponent className={classNames(config.iconColor, size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} aria-hidden="true" />}
      <span>{config.label}</span>
    </span>
  )
}

export function StatusBadge({ status, size = 'md' }) {
  const config = getStatusConfig(status)
  const sizes = {
    sm: 'px-2 py-0.5 text-caption gap-1',
    md: 'px-2.5 py-1 text-body-sm gap-1.5',
    lg: 'px-3 py-1.5 text-body gap-2',
  }

  const IconComponent = getIconComponent(config.icon)

  return (
    <span
      className={classNames(
        'inline-flex items-center font-semibold rounded-badge border',
        config.bg,
        config.border,
        config.text,
        sizes[size]
      )}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      <IconComponent className={`h-3.5 w-3.5 ${config.text}`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  )
}

function getIconComponent(name) {
  const icons = {
    'alert-triangle': AlertTriangle,
    'alert-circle': AlertCircle,
    'info': Info,
    'file-text': FileText,
    'flag': Flag,
    'user-check': UserCheck,
    'loader': Loader,
    'check-circle-2': CheckCircle2,
    'x-circle': XCircle,
  }
  return icons[name] || Info
}

function AlertTriangle({ className, ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function AlertCircle({ className, ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function Info({ className, ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

function FileText({ className, ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  )
}

function Flag({ className, ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

function UserCheck({ className, ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="17 11 19 13 22 9" />
    </svg>
  )
}

function Loader({ className, ...props }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function CheckCircle2({ className, ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function XCircle({ className, ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

export function Modal({ isOpen, onClose, title, children, className = '', size = 'md' }) {
  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[9990] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
        {/* Full-screen backdrop */}
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Modal Dialog Card */}
        <div
          className={classNames(
            'relative w-full bg-surface-card rounded-card shadow-2xl border border-border-strong animate-fade-in backdrop-blur-xl my-6 text-left z-10',
            sizes[size],
            className
          )}
        >
          {title && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 id="modal-title" className="text-heading-sm font-semibold text-text-primary">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body)
  }
  return modalContent
}

export function Alert({ variant = 'info', title, children, className = '', onClose, dismissible = false }) {
  const variants = {
    info: 'bg-accent-500/10 border-accent-500/20 text-accent-300',
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    warning: 'bg-warm-500/10 border-warm-500/20 text-warm-300',
    danger: 'bg-red-500/10 border-red-500/20 text-red-300',
  }

  const icons = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: AlertCircle,
  }

  const Icon = icons[variant]

  // Safe renderer: prevents Minified React error #31 if an object or error array is passed as children
  const renderSafeContent = () => {
    if (children == null) return null
    if (typeof children === 'string' || typeof children === 'number' || typeof children === 'boolean') {
      return children
    }
    if (React.isValidElement(children)) {
      return children
    }
    if (Array.isArray(children)) {
      return children.map((item, idx) => {
        if (React.isValidElement(item) || typeof item === 'string' || typeof item === 'number') {
          return item
        }
        if (typeof item === 'object' && item !== null) {
          const field = item.loc ? item.loc[item.loc.length - 1] : ''
          const prefix = field && field !== 'body' && field !== 'query' ? `${field}: ` : ''
          return (
            <div key={idx} className="mt-0.5">
              {prefix}{item.msg || JSON.stringify(item)}
            </div>
          )
        }
        return String(item)
      })
    }
    if (typeof children === 'object') {
      const msg = children.msg || children.message || children.detail
      if (typeof msg === 'string') return msg
      return JSON.stringify(children)
    }
    return String(children)
  }

  return (
    <div
      className={classNames(
        'flex gap-3 p-4 rounded-card border backdrop-blur-sm',
        variants[variant],
        className
      )}
      role="alert"
    >
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1">
        {title && <h4 className="font-medium mb-1">{title}</h4>}
        <div className="text-body-sm opacity-90">{renderSafeContent()}</div>
      </div>
      {dismissible && onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded hover:bg-white/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function Skeleton({ className = '', variant = 'text', width, height, ...props }) {
  const variants = {
    text: 'h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  return (
    <div
      className={classNames(
        'skeleton',
        variants[variant],
        className
      )}
      style={{ width, height }}
      {...props}
    />
  )
}

export function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div className={classNames('flex flex-col items-center justify-center py-16 px-4 text-center', className)}>
      <div className="w-16 h-16 rounded-2xl bg-surface-hover/50 flex items-center justify-center mb-5 text-text-muted border border-border">
        {icon && <icon className="h-8 w-8" />}
      </div>
      <h3 className="text-heading-sm font-semibold text-text-primary mb-2">{title}</h3>
      <p className="text-body text-text-secondary max-w-sm mb-6">{description}</p>
      {action}
    </div>
  )
}

export function LoadingState({ className = '', variant = 'spinner', size = 'md' }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  if (variant === 'spinner') {
    return (
      <div className={classNames('flex items-center justify-center', className)}>
        <svg className={`animate-spin text-primary-500 ${sizes[size]}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.15" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  return (
    <div className={classNames('space-y-3', className)}>
      <Skeleton variant="rectangular" height="1rem" width="60%" />
      <Skeleton variant="rectangular" height="1rem" width="40%" />
      <Skeleton variant="rectangular" height="1rem" width="80%" />
    </div>
  )
}

export function Tooltip({ content, children, position = 'top' }) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative inline-block" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <div
          className={classNames(
            'absolute z-50 px-2.5 py-1.5 text-caption font-medium text-white bg-surface-card rounded-lg shadow-elevated border border-border-strong whitespace-nowrap backdrop-blur-xl',
            position === 'top' && 'bottom-full left-1/2 -translate-x-1/2 mb-2',
            position === 'bottom' && 'top-full left-1/2 -translate-x-1/2 mt-2',
            position === 'left' && 'right-full top-1/2 -translate-y-1/2 mr-2',
            position === 'right' && 'left-full top-1/2 -translate-y-1/2 ml-2'
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}

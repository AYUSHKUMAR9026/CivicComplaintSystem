import React from 'react'

/**
 * JanSewa Logo Mark — Modern Civic Tech Identity
 * 
 * A sleek, geometric logo combining a shield silhouette with a connected
 * network pulse, symbolizing civic infrastructure + smart technology.
 */

export function LogoMark({ className = 'h-5 w-5 text-white', ...props }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Gradient definitions */}
      <defs>
        <linearGradient id="logo-gradient" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="pulse-gradient" x1="8" y1="16" x2="24" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      
      {/* Shield outline — rounded modern shield */}
      <path
        d="M16 3L6 7.5V15C6 21.5 10.2 27.2 16 29C21.8 27.2 26 21.5 26 15V7.5L16 3Z"
        stroke="url(#logo-gradient)"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Pulse/wave line — civic heartbeat */}
      <polyline
        points="9,17 12,17 13.5,13 15,20 17,11 18.5,17 20,17 23,17"
        stroke="url(#pulse-gradient)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Core node at peak */}
      <circle
        cx="16"
        cy="8.5"
        r="1.8"
        fill="#dfb65c"
      />
    </svg>
  )
}

/**
 * Full logo component with text for branding areas
 */
export function Logo({ size = 'md', showText = true, className = '' }) {
  const sizes = {
    sm: { icon: 'w-7 h-7', iconInner: 'h-4 w-4', text: 'text-lg' },
    md: { icon: 'w-9 h-9', iconInner: 'h-5 w-5', text: 'text-xl' },
    lg: { icon: 'w-11 h-11', iconInner: 'h-6 w-6', text: 'text-2xl' },
    xl: { icon: 'w-14 h-14', iconInner: 'h-8 w-8', text: 'text-3xl' },
  }
  
  const s = sizes[size]
  
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`${s.icon} rounded-xl bg-gradient-to-br from-primary-300 to-primary-600 flex items-center justify-center shadow-glow-primary border border-primary-200/30`}>
        <LogoMark className={`${s.iconInner} text-surface-elevated`} />
      </div>
      {showText && (
        <div className="flex flex-col">
          <span className={`${s.text} font-bold text-text-primary tracking-tight font-heading leading-none`}>
            JanSewa
          </span>
          {size === 'lg' || size === 'xl' ? (
            <span className="text-xs text-text-muted tracking-widest uppercase mt-0.5">Civic Intelligence</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default LogoMark

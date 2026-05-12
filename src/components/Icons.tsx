type IconProps = { size?: number; className?: string }

function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M2 6.5L8 2l6 4.5V14H10v-3.5H6V14H2V6.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function ServerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2" width="13" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.5" y="9" width="13" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.5" cy="4.5" r="0.85" fill="currentColor" />
      <circle cx="4.5" cy="11.5" r="0.85" fill="currentColor" />
    </Svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function GitBranchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="4.5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M4.5 5v5M4.5 5C4.5 8 11.5 7 11.5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function LayersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 1.5L14 5l-6 3.5L2 5 8 1.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M2 8.5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 11.5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function BoxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 1.5L14 5v6l-6 3.5L2 11V5L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 1.5v13M2 5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function DatabaseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="8" cy="4" rx="5.5" ry="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.5 4v4c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V4"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2.5 8v4c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V8"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </Svg>
  )
}

export function GridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
    </Svg>
  )
}

export function FileCodeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M9 1.5H3.5A1 1 0 0 0 2.5 2.5v11a1 1 0 0 0 1 1H12.5a1 1 0 0 0 1-1v-8L9 1.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M9 1.5V5.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 9l-1.5 1.5L6 12M10 9l1.5 1.5L10 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M11.9 3.4l-.7.7M4.1 11.9l-.7.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M13.5 10A6 6 0 0 1 6 2.5 6 6 0 1 0 13.5 10z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 8.5L6 12 13.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function AppWindowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.5" cy="4.5" r="0.8" fill="currentColor" />
      <circle cx="7" cy="4.5" r="0.8" fill="currentColor" />

    </Svg>
  )
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3L3 8l7 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function GlobeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.7C8 1.7 5.5 4.5 5.5 8s2.5 6.3 2.5 6.3M8 1.7C8 1.7 10.5 4.5 10.5 8S8 14.3 8 14.3M1.7 8h12.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function TerminalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 6l2.5 2L4 10M8.5 10H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M11.75 3.4l-.85.85M4.25 11.75l-.85.85"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
      />
    </Svg>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 1.5L2 4v4.5C2 11.5 4.7 14 8 14.5c3.3-.5 6-3 6-6V4L8 1.5z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
      />
      <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function KeyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5.5" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.5 7h5.5M12 7v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6.5 9.5a3.5 3.5 0 0 0 4.95 0l1.5-1.5a3.5 3.5 0 0 0-4.95-4.95L7 4"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
      />
      <path
        d="M9.5 6.5a3.5 3.5 0 0 0-4.95 0L3 8a3.5 3.5 0 0 0 4.95 4.95L9 12"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
      />
    </Svg>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 2L1.5 13h13L8 2z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
      />
      <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.6" fill="currentColor" />
    </Svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 4.5l.75 8.5a1 1 0 0 0 1 .9h4.5a1 1 0 0 0 1-.9L12 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function RefreshCwIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 3.5A6.5 6.5 0 0 1 8 14.5a6.5 6.5 0 0 1-5.9-3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 1.5v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function StopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </Svg>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="5" width="8.5" height="9.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5V3.5A1 1 0 0 1 6 2.5h5.5l2 2v6a1 1 0 0 1-1 1H11" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </Svg>
  )
}

export function WebhookIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 4.5C4 6 2 8 2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 4.5C12 6 14 8 14 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 12h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 2H2.5A1 1 0 0 0 1.5 3v10.5a1 1 0 0 0 1 1H13a1 1 0 0 0 1-1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 1.5h5.5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 1.5L7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

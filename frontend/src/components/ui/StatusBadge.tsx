import { getStatusConfig, type statusConfig } from '../../lib/utils'
import { cn } from '../../lib/utils'

interface StatusBadgeProps {
  type: keyof typeof statusConfig
  status: string
  className?: string
}

export function StatusBadge({ type, status, className }: StatusBadgeProps) {
  const { color, label } = getStatusConfig(type, status)
  
  return (
    <span className={cn(
      'px-2 py-1 text-xs font-medium rounded-full inline-flex',
      color,
      className
    )}>
      {label}
    </span>
  )
}

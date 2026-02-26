import { cn } from '../../lib/utils'

interface ProgressBarProps {
  value: number
  max: number
  className?: string
  showLabel?: boolean
}

export function ProgressBar({ value, max, className, showLabel = false }: ProgressBarProps) {
  const percentage = max > 0 ? (value / max) * 100 : 0

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div 
          className="bg-primary-600 h-2 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-sm text-gray-500 min-w-[60px] text-right">
          {value} / {max}
        </span>
      )}
    </div>
  )
}

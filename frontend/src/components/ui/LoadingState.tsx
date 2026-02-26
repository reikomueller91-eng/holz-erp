import { Loader2 } from 'lucide-react'

interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message = 'Laden...' }: LoadingStateProps) {
  return (
    <div className="p-8 text-center text-gray-500 flex items-center justify-center gap-2">
      <Loader2 className="w-5 h-5 animate-spin" />
      {message}
    </div>
  )
}

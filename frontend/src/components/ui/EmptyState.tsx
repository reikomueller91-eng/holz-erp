interface EmptyStateProps {
  message: string
  searchActive?: boolean
}

export function EmptyState({ message, searchActive }: EmptyStateProps) {
  return (
    <div className="p-8 text-center text-gray-500">
      {searchActive ? 'Keine Ergebnisse gefunden' : message}
    </div>
  )
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Factory, Play, CheckCircle } from 'lucide-react'
import api from '../lib/api'
import type { ProductionJob } from '../types'

export default function Production() {
  const queryClient = useQueryClient()

  const { data: jobs } = useQuery({
    queryKey: ['production'],
    queryFn: async () => {
      const { data } = await api.get<ProductionJob[]>('/production')
      return data
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      api.patch(`/production/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['production'] }),
  })

  const queuedJobs = jobs?.filter(j => j.status === 'queued') || []
  const inProgressJobs = jobs?.filter(j => j.status === 'in_progress') || []
  const doneJobs = jobs?.filter(j => j.status === 'done') || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Produktion</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-gray-500">Wartend</p>
          <p className="text-2xl font-bold text-gray-900">{queuedJobs.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">In Arbeit</p>
          <p className="text-2xl font-bold text-blue-600">{inProgressJobs.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Fertig</p>
          <p className="text-2xl font-bold text-green-600">{doneJobs.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Gesamt</p>
          <p className="text-2xl font-bold text-gray-900">{jobs?.length || 0}</p>
        </div>
      </div>

      {/* Jobs by status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queued */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Factory className="w-4 h-4" />
              Wartend ({queuedJobs.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200 max-h-96 overflow-auto">
            {queuedJobs.map(job => (
              <JobCard 
                key={job.id} 
                job={job} 
                onStart={() => updateMutation.mutate({ id: job.id, data: { status: 'in_progress' } })}
              />
            ))}
            {queuedJobs.length === 0 && <div className="p-4 text-center text-gray-500 text-sm">Keine wartenden Jobs</div>}
          </div>
        </div>

        {/* In Progress */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 bg-blue-50">
            <h2 className="font-semibold text-blue-700 flex items-center gap-2">
              <Play className="w-4 h-4" />
              In Arbeit ({inProgressJobs.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200 max-h-96 overflow-auto">
            {inProgressJobs.map(job => (
              <JobCardProgress 
                key={job.id} 
                job={job}
                onComplete={() => updateMutation.mutate({ id: job.id, data: { status: 'done', producedQuantity: job.targetQuantity } })}
                onProgress={(qty) => updateMutation.mutate({ id: job.id, data: { producedQuantity: qty } })}
              />
            ))}
            {inProgressJobs.length === 0 && <div className="p-4 text-center text-gray-500 text-sm">Keine Jobs in Arbeit</div>}
          </div>
        </div>

        {/* Done */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 bg-green-50">
            <h2 className="font-semibold text-green-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Fertig ({doneJobs.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200 max-h-96 overflow-auto">
            {doneJobs.slice(0, 10).map(job => (
              <JobCard key={job.id} job={job} />
            ))}
            {doneJobs.length === 0 && <div className="p-4 text-center text-gray-500 text-sm">Keine fertigen Jobs</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function JobCard({ job, onStart }: { job: ProductionJob; onStart?: () => void }) {
  return (
    <div className="p-4 hover:bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-gray-900">{job.productName}</p>
        {onStart && (
          <button
            onClick={onStart}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Starten
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500">Ziel: {job.targetQuantity} Stück</p>
      {job.notes && <p className="text-xs text-gray-400 mt-1">{job.notes}</p>}
    </div>
  )
}

function JobCardProgress({ job, onComplete, onProgress }: { 
  job: ProductionJob; 
  onComplete: () => void;
  onProgress: (qty: number) => void;
}) {
  const progress = (job.producedQuantity / job.targetQuantity) * 100

  return (
    <div className="p-4 hover:bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-gray-900">{job.productName}</p>
        <button
          onClick={onComplete}
          className="text-sm text-green-600 hover:text-green-700 font-medium"
        >
          Abschließen
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-2">{job.producedQuantity} / {job.targetQuantity} Stück</p>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div 
          className="bg-primary-600 h-2 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={job.producedQuantity}
          onChange={(e) => onProgress(Number(e.target.value))}
          className="w-20 text-sm border rounded px-2 py-1"
          min={0}
          max={job.targetQuantity}
        />
        <span className="text-sm text-gray-500">Stück erfasst</span>
      </div>
    </div>
  )
}

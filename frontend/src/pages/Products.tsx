import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, WifiOff, AlertCircle, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { WOOD_TYPES, QUALITY_GRADES } from '../lib/utils'
import { PageHeader, SearchInput, LoadingState, EmptyState, Modal, ConfirmDialog } from '../components/ui'
import { toast } from '../stores/toastStore'
import type { Product } from '../types'

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { message?: string; error?: string } }; message?: string; code?: string }
    if (err.response?.data?.message) return err.response.data.message
    if (err.response?.data?.error) return err.response.data.error
    if (err.code === 'ERR_NETWORK') return 'Server nicht erreichbar'
    if (err.message?.includes('Network')) return 'Netzwerkfehler'
    if (err.message) return err.message
  }
  return 'Unbekannter Fehler'
}

export default function Products() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products')
      console.log('Products API response:', data)
      return data
    },
    retry: 1,
  })

  const products = Array.isArray(data) ? data : []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Produkt gelöscht')
      setDeleteTarget(null)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const filteredProducts = products.filter(p =>
    p?.name?.toLowerCase().includes(search.toLowerCase()) ||
    p?.woodType?.toLowerCase().includes(search.toLowerCase())
  )

  if (error && !isLoading) {
    const isNetwork = (error as { code?: string }).code === 'ERR_NETWORK'
    return (
      <div className="space-y-6">
        <PageHeader title="Produkte" />
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          {isNetwork ? <WifiOff className="w-12 h-12 text-red-500 mx-auto mb-3" /> : <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />}
          <h3 className="text-lg font-semibold text-red-800 mb-2">{isNetwork ? 'Server nicht erreichbar' : 'Fehler'}</h3>
          <p className="text-red-600 mb-4">{getErrorMessage(error)}</p>
          <button onClick={() => refetch()} className="btn-primary">Erneut versuchen</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produkte"
        action={
          <button onClick={() => { setEditingProduct(null); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Neues Produkt
          </button>
        }
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Produkte suchen..." />

      <div className="card overflow-hidden">
        {isLoading ? <LoadingState /> : filteredProducts.length === 0 ? (
          <EmptyState message="Noch keine Produkte" searchActive={!!search} />
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Holzart</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qualität</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/products/${product.id}`)}
                >
                  <td className="px-6 py-4 font-medium">{product.name}</td>
                  <td className="px-6 py-4">{product.woodType}</td>
                  <td className="px-6 py-4">{product.qualityGrade}</td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => navigate(`/products/${product.id}`)} className="p-2 text-gray-400 hover:text-primary-600" title="Details">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setEditingProduct(product); setShowModal(true); }} className="p-2 text-gray-400 hover:text-primary-600">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteTarget(product)} className="p-2 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <ProductModal product={editingProduct} onClose={() => setShowModal(false)} />}
      {deleteTarget && (
        <ConfirmDialog
          title="Produkt löschen"
          message={`"${deleteTarget.name}" löschen?`}
          confirmLabel="Löschen"
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  )
}

function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: product?.name || '',
    woodType: product?.woodType || 'Eiche',
    qualityGrade: product?.qualityGrade || 'A',
    heightMm: product?.heightMm || 20,
    widthMm: product?.widthMm || 100,
    calcMethod: product?.calcMethod || 'm2_sorted',
    volumeDivider: product?.volumeDivider || 1750,
    currentPricePerM2: product?.currentPricePerM2 || 0,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Name ist erforderlich')
      return
    }

    setIsSubmitting(true)
    try {
      if (product) {
        await api.put(`/products/${product.id}`, formData)
        toast.success('Produkt aktualisiert')
      } else {
        await api.post('/products', formData)
        toast.success('Produkt erstellt')
      }
      queryClient.invalidateQueries({ queryKey: ['products'] })
      onClose()
    } catch (error) {
      console.error('Save error:', error)
      toast.error(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      title={product ? 'Produkt bearbeiten' : 'Neues Produkt'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={isSubmitting}>Abbrechen</button>
          <button onClick={handleSubmit} disabled={!formData.name.trim() || isSubmitting} className="btn-primary">
            {isSubmitting ? 'Speichern...' : 'Speichern'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input" disabled={isSubmitting} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Holzart</label>
            <select value={formData.woodType} onChange={(e) => setFormData({ ...formData, woodType: e.target.value })} className="input" disabled={isSubmitting}>
              {WOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qualität</label>
            <select value={formData.qualityGrade} onChange={(e) => setFormData({ ...formData, qualityGrade: e.target.value })} className="input" disabled={isSubmitting}>
              {QUALITY_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Abrechnungsart</label>
            <select value={formData.calcMethod} onChange={(e) => setFormData({ ...formData, calcMethod: e.target.value as any })} className="input" disabled={isSubmitting}>
              <option value="m2_sorted">m² (Breite berücksichtigt)</option>
              <option value="m2_unsorted">m² (Unsortiert / Ohne Breite)</option>
              <option value="volume_divided">m³ -&gt; Lfm (über Teiler)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Höhe (mm)</label>
            <input type="number" value={formData.heightMm} onChange={(e) => setFormData({ ...formData, heightMm: Number(e.target.value) })} className="input" disabled={isSubmitting} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Breite (mm)</label>
            <input type="number" value={formData.widthMm} onChange={(e) => setFormData({ ...formData, widthMm: Number(e.target.value) })} className="input" disabled={isSubmitting || formData.calcMethod === 'm2_unsorted'} title={formData.calcMethod === 'm2_unsorted' ? 'Breite bei unsortierten Brettern irrelevant' : ''} />
          </div>
          {formData.calcMethod === 'volume_divided' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teiler (Volumen)</label>
              <input type="number" value={formData.volumeDivider} onChange={(e) => setFormData({ ...formData, volumeDivider: Number(e.target.value) })} className="input" disabled={isSubmitting} />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preis Brutto/m²</label>
              <input type="number" step="0.01" value={formData.currentPricePerM2} onChange={(e) => setFormData({ ...formData, currentPricePerM2: Number(e.target.value) })} className="input" disabled={isSubmitting} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
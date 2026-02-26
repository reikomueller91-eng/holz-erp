import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Euro, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { WOOD_TYPES, QUALITY_GRADES } from '../lib/utils'
import { PageHeader, SearchInput, LoadingState, EmptyState, Modal, ConfirmDialog } from '../components/ui'
import { toast } from '../stores/toastStore'
import type { Product } from '../types'

export default function Products() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products')
      return data
    },
  })

  // SICHERSTELLEN dass wir ein Array haben
  const products = Array.isArray(data) ? data : []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Produkt wurde gelöscht')
      setDeleteTarget(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Fehler beim Löschen')
    },
  })

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.woodType.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Produkte"
        action={
          <button 
            onClick={() => { setEditingProduct(null); setShowModal(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Neues Produkt
          </button>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div>
            <p className="font-medium text-red-800">Fehler beim Laden</p>
            <p className="text-sm text-red-600">
              {(error as any).response?.data?.message || 'Bitte entsperren Sie das System'}
            </p>
          </div>
        </div>
      )}

      <SearchInput 
        value={search}
        onChange={setSearch}
        placeholder="Produkte suchen..."
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : filteredProducts.length === 0 ? (
          <EmptyState message="Noch keine Produkte vorhanden" searchActive={!!search} />
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Holzart</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qualität</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Maße</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{product.name}</td>
                  <td className="px-6 py-4">{product.woodType}</td>
                  <td className="px-6 py-4">{product.qualityGrade}</td>
                  <td className="px-6 py-4">{product.heightMm}×{product.widthMm}</td>
                  <td className="px-6 py-4 text-right">
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
    heightMm: product?.heightMm || 0,
    widthMm: product?.widthMm || 0,
    currentPricePerM2: product?.currentPricePerM2 || 0,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (product) {
        await api.put(`/products/${product.id}`, formData)
      } else {
        await api.post('/products', formData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(product ? 'Produkt aktualisiert' : 'Produkt erstellt')
      onClose()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Fehler beim Speichern')
    },
  })

  return (
    <Modal
      title={product ? 'Produkt bearbeiten' : 'Neues Produkt'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={mutation.isPending}>Abbrechen</button>
          <button onClick={() => mutation.mutate()} disabled={!formData.name || mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Speichern...' : 'Speichern'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Holzart</label>
            <select value={formData.woodType} onChange={(e) => setFormData({ ...formData, woodType: e.target.value })} className="input">
              {WOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qualität</label>
            <select value={formData.qualityGrade} onChange={(e) => setFormData({ ...formData, qualityGrade: e.target.value })} className="input">
              {QUALITY_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Höhe (mm)</label>
            <input type="number" value={formData.heightMm} onChange={(e) => setFormData({ ...formData, heightMm: Number(e.target.value) })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Breite (mm)</label>
            <input type="number" value={formData.widthMm} onChange={(e) => setFormData({ ...formData, widthMm: Number(e.target.value) })} className="input" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Preis/m² (€)</label>
          <input type="number" step="0.01" value={formData.currentPricePerM2} onChange={(e) => setFormData({ ...formData, currentPricePerM2: Number(e.target.value) })} className="input" />
        </div>
      </div>
    </Modal>
  )
}
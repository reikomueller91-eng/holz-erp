import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Euro } from 'lucide-react'
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

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products')
      return data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Produkt wurde gelöscht')
      setDeleteTarget(null)
    },
    onError: () => {
      toast.error('Fehler beim Löschen des Produkts')
    },
  })

  const filteredProducts = products?.filter(p => 
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

      <SearchInput 
        value={search}
        onChange={setSearch}
        placeholder="Produkte suchen..."
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : filteredProducts?.length === 0 ? (
          <EmptyState 
            message="Noch keine Produkte vorhanden"
            searchActive={!!search}
          />
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Holzart</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qualität</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Maße (mm)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preis/m²</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts?.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link to={`/products/${product.id}`} className="font-medium text-gray-900 hover:text-primary-600">
                      {product.name}
                    </Link>
                    {product.description && (
                      <p className="text-sm text-gray-500">{product.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{product.woodType}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-wood-100 text-wood-800 rounded-full">
                      {product.qualityGrade}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {product.heightMm} × {product.widthMm}
                    {product.lengthMm && ` × ${product.lengthMm}`}
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1 font-medium text-gray-900">
                      <Euro className="w-4 h-4" />
                      {product.currentPricePerM2.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingProduct(product); setShowModal(true); }}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(product)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ProductModal 
          product={editingProduct}
          onClose={() => setShowModal(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Produkt löschen"
          message={`Möchten Sie das Produkt "${deleteTarget.name}" wirklich löschen?`}
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
    lengthMm: product?.lengthMm || undefined as number | undefined,
    description: product?.description || '',
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
      toast.success(product ? 'Produkt wurde aktualisiert' : 'Produkt wurde erstellt')
      onClose()
    },
    onError: () => {
      toast.error('Fehler beim Speichern')
    },
  })

  return (
    <Modal
      title={product ? 'Produkt bearbeiten' : 'Neues Produkt'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Abbrechen</button>
          <button 
            onClick={() => mutation.mutate()}
            disabled={!formData.name || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? 'Speichern...' : 'Speichern'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="input"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Holzart</label>
            <select
              value={formData.woodType}
              onChange={(e) => setFormData({ ...formData, woodType: e.target.value })}
              className="input"
            >
              {WOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qualität</label>
            <select
              value={formData.qualityGrade}
              onChange={(e) => setFormData({ ...formData, qualityGrade: e.target.value })}
              className="input"
            >
              {QUALITY_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Höhe (mm)</label>
            <input
              type="number"
              value={formData.heightMm}
              onChange={(e) => setFormData({ ...formData, heightMm: Number(e.target.value) })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Breite (mm)</label>
            <input
              type="number"
              value={formData.widthMm}
              onChange={(e) => setFormData({ ...formData, widthMm: Number(e.target.value) })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Länge (mm)</label>
            <input
              type="number"
              value={formData.lengthMm || ''}
              onChange={(e) => setFormData({ ...formData, lengthMm: e.target.value ? Number(e.target.value) : undefined })}
              className="input"
              placeholder="Optional"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Preis pro m² (€)</label>
          <input
            type="number"
            step="0.01"
            value={formData.currentPricePerM2}
            onChange={(e) => setFormData({ ...formData, currentPricePerM2: Number(e.target.value) })}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="input"
            rows={2}
          />
        </div>
      </div>
    </Modal>
  )
}

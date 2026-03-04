import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import api from '../lib/api'
import type { Product } from '../types'

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()

  const { data: product } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data } = await api.get<Product>(`/products/${id}`)
      return data
    },
  })

  const { data: priceHistory } = useQuery({
    queryKey: ['product-price-history', id],
    queryFn: async () => {
      const { data } = await api.get(`/products/${id}/price-history`)
      return data
    },
  })

  if (!product) return <div className="p-8 text-center">Laden...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/products" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Produktdetails</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Holzart</p>
                <p className="font-medium text-gray-900">{product.woodType}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Qualität</p>
                <p className="font-medium text-gray-900">{product.qualityGrade}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Maße</p>
              <p className="font-medium text-gray-900">
                {product.heightMm} mm × {product.widthMm} mm
                {product.lengthMm && ` × ${(product.lengthMm / 1000).toFixed(3)} m`}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Abrechnungsart</p>
              <p className="font-medium text-gray-900">
                {product.calcMethod === 'm2_sorted' ? 'm² (Breite berücksichtigt)' :
                  product.calcMethod === 'm2_unsorted' ? 'm² (Unsortiert / Ohne Breite)' :
                    'm³ -> Lfm (über Teiler)'}
              </p>
            </div>
            {product.calcMethod === 'volume_divided' ? (
              <div>
                <p className="text-sm text-gray-500">Teiler (Volumen)</p>
                <p className="font-medium text-gray-900">{product.volumeDivider}</p>
                <p className="text-sm text-gray-500 mt-2">Berechneter Laufmeterpreis</p>
                <p className="text-2xl font-bold text-primary-600">
                  €{((product.heightMm * product.widthMm) / (product.volumeDivider || 1)).toFixed(2)} <span className="text-sm text-gray-500">/ Lfm</span>
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">Aktueller Bruttopreis</p>
                <p className="text-2xl font-bold text-primary-600">
                  €{product.currentPricePerM2.toFixed(2)} <span className="text-sm text-gray-500">/ m²</span>
                </p>
              </div>
            )}
            {product.description && (
              <div>
                <p className="text-sm text-gray-500">Beschreibung</p>
                <p className="text-gray-700">{product.description}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="p-6 border-b border-gray-200 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold">Preishistorie</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {priceHistory?.length === 0 ? (
              <div className="p-6 text-center text-gray-500">Keine Preishistorie vorhanden</div>
            ) : (
              priceHistory?.map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-gray-900">
                      {new Date(entry.effectiveFrom).toLocaleDateString('de-DE')}
                    </p>
                    {entry.reason && (
                      <p className="text-sm text-gray-500">{entry.reason}</p>
                    )}
                  </div>
                  <p className="font-medium text-gray-900">
                    €{entry.pricePerM2.toFixed(2)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
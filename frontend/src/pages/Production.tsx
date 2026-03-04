import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Factory, Maximize2, Minimize2, HelpCircle, X, ArrowLeft } from 'lucide-react'
import api from '../lib/api'
import type { ProductionCluster } from '../types'

// ─── Production Page ─────────────────────────────────────────────
export default function Production() {
  const [selectedCluster, setSelectedCluster] = useState<ProductionCluster | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { data: clusters, isLoading } = useQuery({
    queryKey: ['production'],
    queryFn: async () => {
      const { data } = await api.get<{ production: ProductionCluster[] }>('/orders/production')
      return data.production ?? []
    },
    refetchInterval: 10000,
  })

  const enterProductionMode = (cluster: ProductionCluster) => {
    setSelectedCluster(cluster)
    setIsFullscreen(true)
  }

  const exitProductionMode = () => {
    setSelectedCluster(null)
    setIsFullscreen(false)
  }

  // Global ESC handler to exit fullscreen
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        exitProductionMode()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFullscreen])

  if (isFullscreen && selectedCluster) {
    return (
      <ProductionMode
        cluster={selectedCluster}
        onExit={exitProductionMode}
        clusters={clusters ?? []}
        onSwitchCluster={setSelectedCluster}
      />
    )
  }

  // ─── Overview Mode ──────────────────────────────────────────────
  const totalItems = clusters?.reduce((sum, c) => sum + c.totalQuantity, 0) ?? 0
  const totalProduced = clusters?.reduce((sum, c) => sum + c.totalProduced, 0) ?? 0
  const overallProgress = totalItems > 0 ? Math.round((totalProduced / totalItems) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Produktion</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-gray-500">Offene Positionen</p>
          <p className="text-2xl font-bold text-gray-900">{clusters?.length ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Gesamt Stück</p>
          <p className="text-2xl font-bold text-gray-900">{totalItems}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Produziert</p>
          <p className="text-2xl font-bold text-green-600">{totalProduced}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Fortschritt</p>
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-primary-600">{overallProgress}%</p>
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Clustered Positions */}
      {isLoading ? (
        <div className="card p-8 text-center text-gray-500">Laden...</div>
      ) : !clusters || clusters.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          <Factory className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">Keine offenen Positionen</p>
          <p className="text-sm mt-1">Alle Aufträge sind abgeschlossen oder es existieren noch keine.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {clusters.map((cluster, idx) => (
            <ClusterCard
              key={`${cluster.productId}-${idx}`}
              cluster={cluster}
              onStartProduction={() => enterProductionMode(cluster)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Cluster Overview Card ────────────────────────────────────────
function ClusterCard({ cluster, onStartProduction }: {
  cluster: ProductionCluster
  onStartProduction: () => void
}) {
  const progress = cluster.totalQuantity > 0
    ? Math.round((cluster.totalProduced / cluster.totalQuantity) * 100)
    : 0
  const remaining = cluster.totalQuantity - cluster.totalProduced

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{cluster.productName}</h3>
          <p className="text-sm text-gray-500">
            {cluster.heightMm} × {cluster.widthMm} × {cluster.lengthMm} mm · Qualität {cluster.quality}
          </p>
        </div>
        <button
          onClick={onStartProduction}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Maximize2 className="w-4 h-4" />
          Produktionsmodus
        </button>
      </div>

      <div className="p-4">
        {/* Progress bar */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {cluster.totalProduced} / {cluster.totalQuantity} Stück
          </span>
          <span className="text-sm text-gray-500">{remaining} offen</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
          <div
            className={`h-3 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : progress > 50 ? 'bg-primary-600' : 'bg-amber-500'
              }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Order list */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase">Aufträge ({cluster.orders.length})</p>
          {cluster.orders.map((ref) => (
            <div key={ref.itemId} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
              <div>
                <span className="font-medium text-gray-900">{ref.orderNumber}</span>
                <span className="text-gray-500 ml-2">{ref.customerName}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ref.status === 'new' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                  {ref.status === 'new' ? 'Neu' : 'In Produktion'}
                </span>
                <span className="text-gray-600">{ref.produced}/{ref.quantity}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Fullscreen Production Mode ───────────────────────────────────
function ProductionMode({ cluster, onExit, clusters, onSwitchCluster }: {
  cluster: ProductionCluster
  onExit: () => void
  clusters: ProductionCluster[]
  onSwitchCluster: (c: ProductionCluster) => void
}) {
  const queryClient = useQueryClient()
  const [selectedOrderIdx, setSelectedOrderIdx] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null)

  const selectedOrder = cluster.orders[selectedOrderIdx]

  const updateMutation = useMutation({
    mutationFn: async ({ orderId, itemId, quantity }: { orderId: string; itemId: string; quantity: number }) => {
      await api.post(`/orders/${orderId}/production`, {
        itemId,
        quantityProduced: quantity,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production'] })
      setFeedback('success')
      setInputValue('')
      setTimeout(() => setFeedback(null), 1500)
    },
    onError: () => {
      setFeedback('error')
      setTimeout(() => setFeedback(null), 2000)
    },
  })

  const handleNumpadPress = useCallback((key: string) => {
    if (key === 'clear') {
      setInputValue('')
    } else if (key === 'backspace') {
      setInputValue(prev => prev.slice(0, -1))
    } else if (key === 'enter') {
      if (selectedOrder && inputValue) {
        const qty = parseInt(inputValue)
        if (!isNaN(qty) && qty >= 0) {
          updateMutation.mutate({
            orderId: selectedOrder.orderId,
            itemId: selectedOrder.itemId,
            quantity: qty,
          })
        }
      }
    } else if (key === 'max') {
      if (selectedOrder) {
        updateMutation.mutate({
          orderId: selectedOrder.orderId,
          itemId: selectedOrder.itemId,
          quantity: selectedOrder.quantity,
        })
      }
    } else {
      setInputValue(prev => prev + key)
    }
  }, [inputValue, selectedOrder, updateMutation])

  // Keyboard handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showHelp) {
        if (e.key === 'Escape') setShowHelp(false)
        return
      }

      if (e.key >= '0' && e.key <= '9') {
        handleNumpadPress(e.key)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleNumpadPress('enter')
      } else if (e.key === 'Backspace') {
        handleNumpadPress('backspace')
      } else if (e.key === 'Delete') {
        handleNumpadPress('clear')
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedOrderIdx(prev => Math.max(0, prev - 1))
        setInputValue('')
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedOrderIdx(prev => Math.min(cluster.orders.length - 1, prev + 1))
        setInputValue('')
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const currentIdx = clusters.findIndex(c => c.productId === cluster.productId && c.quality === cluster.quality && c.heightMm === cluster.heightMm)
        if (currentIdx > 0) {
          onSwitchCluster(clusters[currentIdx - 1])
          setSelectedOrderIdx(0)
          setInputValue('')
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const currentIdx = clusters.findIndex(c => c.productId === cluster.productId && c.quality === cluster.quality && c.heightMm === cluster.heightMm)
        if (currentIdx < clusters.length - 1) {
          onSwitchCluster(clusters[currentIdx + 1])
          setSelectedOrderIdx(0)
          setInputValue('')
        }
      } else if (e.key === 'F1') {
        e.preventDefault()
        setShowHelp(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleNumpadPress, showHelp, cluster, clusters, onSwitchCluster])

  const progress = cluster.totalQuantity > 0
    ? Math.round((cluster.totalProduced / cluster.totalQuantity) * 100)
    : 0

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{cluster.productName}</h1>
            <p className="text-gray-400 text-sm">
              {cluster.heightMm} × {cluster.widthMm} × {cluster.lengthMm} mm · Qualität {cluster.quality}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHelp(true)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            title="Hilfe (F1)"
          >
            <HelpCircle className="w-6 h-6" />
          </button>
          <button
            onClick={onExit}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            title="Beenden (ESC)"
          >
            <Minimize2 className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="px-6 py-3 bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-medium">
            Gesamt: {cluster.totalProduced} / {cluster.totalQuantity} Stück
          </span>
          <span className="text-lg font-bold" style={{ color: progress === 100 ? '#22c55e' : '#60a5fa' }}>
            {progress}%
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-4">
          <div
            className="h-4 rounded-full transition-all"
            style={{
              width: `${progress}%`,
              backgroundColor: progress === 100 ? '#22c55e' : '#3b82f6'
            }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Order List */}
        <div className="w-1/2 border-r border-gray-700 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-medium text-gray-400 uppercase mb-3">
              Aufträge ({cluster.orders.length})  —  ↑ ↓ zum Wechseln
            </h2>
            <div className="space-y-2">
              {cluster.orders.map((ref, idx) => (
                <button
                  key={ref.itemId}
                  onClick={() => { setSelectedOrderIdx(idx); setInputValue('') }}
                  className={`w-full text-left rounded-xl p-4 transition-all ${idx === selectedOrderIdx
                    ? 'bg-primary-600 ring-2 ring-primary-400'
                    : 'bg-gray-800 hover:bg-gray-750'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold">{ref.orderNumber}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${ref.status === 'new' ? 'bg-yellow-600 text-yellow-100' : 'bg-blue-600 text-blue-100'
                      }`}>
                      {ref.status === 'new' ? 'Neu' : 'In Produktion'}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{ref.customerName}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">
                      {ref.produced} / {ref.quantity} Stück
                    </span>
                    <div className="w-24 bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${ref.quantity > 0 ? (ref.produced / ref.quantity) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Keypad + Input */}
        <div className="w-1/2 flex flex-col items-center justify-center p-8">
          {selectedOrder ? (
            <>
              {/* Selected order info */}
              <div className="text-center mb-6">
                <p className="text-gray-400 text-sm">Auftrag</p>
                <p className="text-2xl font-bold">{selectedOrder.orderNumber}</p>
                <p className="text-gray-400">{selectedOrder.customerName}</p>
                <p className="text-lg text-gray-300 mt-2">
                  Aktuell: <span className="text-white font-bold">{selectedOrder.produced}</span> / {selectedOrder.quantity} Stück
                </p>
              </div>

              {/* Input Display */}
              <div className={`bg-gray-800 rounded-2xl px-8 py-4 mb-6 min-w-[280px] text-center border-2 transition-colors ${feedback === 'success' ? 'border-green-500' : feedback === 'error' ? 'border-red-500' : 'border-gray-600'
                }`}>
                <p className="text-sm text-gray-400 mb-1">Neue Stückzahl</p>
                <p className="text-5xl font-mono font-bold tracking-wider">
                  {inputValue || '—'}
                </p>
                {feedback === 'success' && (
                  <p className="text-green-400 text-sm mt-2 animate-pulse">✓ Gespeichert!</p>
                )}
                {feedback === 'error' && (
                  <p className="text-red-400 text-sm mt-2">✗ Fehler!</p>
                )}
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-3 max-w-[320px]">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(key => (
                  <button
                    key={key}
                    onClick={() => handleNumpadPress(key)}
                    className="w-24 h-16 bg-gray-700 hover:bg-gray-600 rounded-xl text-2xl font-bold transition-colors active:scale-95"
                  >
                    {key}
                  </button>
                ))}
                <button
                  onClick={() => handleNumpadPress('clear')}
                  className="w-24 h-16 bg-red-800 hover:bg-red-700 rounded-xl text-sm font-bold transition-colors active:scale-95"
                >
                  Löschen
                </button>
                <button
                  onClick={() => handleNumpadPress('0')}
                  className="w-24 h-16 bg-gray-700 hover:bg-gray-600 rounded-xl text-2xl font-bold transition-colors active:scale-95"
                >
                  0
                </button>
                <button
                  onClick={() => handleNumpadPress('backspace')}
                  className="w-24 h-16 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm font-bold transition-colors active:scale-95"
                >
                  ←
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-4 w-full max-w-[320px]">
                <button
                  onClick={() => handleNumpadPress('max')}
                  className="flex-1 h-14 bg-amber-700 hover:bg-amber-600 rounded-xl text-sm font-bold transition-colors active:scale-95"
                >
                  ALLES ({selectedOrder.quantity})
                </button>
                <button
                  onClick={() => handleNumpadPress('enter')}
                  disabled={!inputValue || updateMutation.isPending}
                  className="flex-1 h-14 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl text-lg font-bold transition-colors active:scale-95"
                >
                  {updateMutation.isPending ? '...' : 'ENTER ↵'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-lg">Keinen Auftrag ausgewählt</p>
          )}
        </div>
      </div>

      {/* Help Overlay */}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  )
}

// ─── Help Overlay ────────────────────────────────────────────────
function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] bg-black bg-opacity-70 flex items-center justify-center p-8">
      <div className="bg-gray-800 rounded-2xl max-w-lg w-full p-6 text-white relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 hover:bg-gray-700 rounded-lg">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-primary-400" />
          Bedienungsanleitung
        </h2>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold text-primary-400 mb-1">Stückzahl eingeben</h3>
            <p className="text-gray-300">
              Verwenden Sie die <b>Numpad-Tasten (0-9)</b> oder klicken Sie die Ziffern auf dem Bildschirm,
              um die produzierte Stückzahl einzugeben. Drücken Sie <b>Enter</b> zum Speichern.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-primary-400 mb-1">Tastenkürzel</h3>
            <table className="w-full text-gray-300">
              <tbody>
                <tr className="border-b border-gray-700">
                  <td className="py-1.5 font-mono text-xs bg-gray-700 px-2 rounded">0-9</td>
                  <td className="py-1.5 pl-3">Ziffern eingeben</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-1.5 font-mono text-xs bg-gray-700 px-2 rounded">Enter</td>
                  <td className="py-1.5 pl-3">Stückzahl speichern</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-1.5 font-mono text-xs bg-gray-700 px-2 rounded">Backspace</td>
                  <td className="py-1.5 pl-3">Letzte Ziffer löschen</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-1.5 font-mono text-xs bg-gray-700 px-2 rounded">Entf</td>
                  <td className="py-1.5 pl-3">Eingabe zurücksetzen</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-1.5 font-mono text-xs bg-gray-700 px-2 rounded">↑ ↓</td>
                  <td className="py-1.5 pl-3">Auftrag wechseln</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-1.5 font-mono text-xs bg-gray-700 px-2 rounded">← →</td>
                  <td className="py-1.5 pl-3">Produkt-Cluster wechseln</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-1.5 font-mono text-xs bg-gray-700 px-2 rounded">F1</td>
                  <td className="py-1.5 pl-3">Hilfe ein-/ausblenden</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-mono text-xs bg-gray-700 px-2 rounded">ESC</td>
                  <td className="py-1.5 pl-3">Produktionsmodus beenden</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="font-semibold text-primary-400 mb-1">Workflow</h3>
            <ol className="text-gray-300 list-decimal list-inside space-y-1">
              <li>Wählen Sie einen Auftrag aus der Liste links</li>
              <li>Geben Sie die produzierte Stückzahl über Numpad ein</li>
              <li>Bestätigen Sie mit Enter — die Menge wird gespeichert</li>
              <li>Wechseln Sie mit Pfeiltasten zum nächsten Auftrag</li>
              <li>Drücken Sie ESC, um zur Übersicht zurückzukehren</li>
            </ol>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-6 w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-xl font-medium transition-colors"
        >
          Verstanden
        </button>
      </div>
    </div>
  )
}

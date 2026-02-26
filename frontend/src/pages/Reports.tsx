import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, Euro, Package, Users } from 'lucide-react'
import api from '../lib/api'

const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6']

export default function Reports() {
  const { data: stats } = useQuery({
    queryKey: ['reports-stats'],
    queryFn: async () => {
      const { data } = await api.get('/reports/stats')
      return data
    },
  })

  const { data: revenueData } = useQuery({
    queryKey: ['reports-revenue'],
    queryFn: async () => {
      const { data } = await api.get('/reports/revenue-monthly')
      return data || []
    },
  })

  const { data: productData } = useQuery({
    queryKey: ['reports-products'],
    queryFn: async () => {
      const { data } = await api.get('/reports/top-products')
      return data || []
    },
  })

  const { data: customerData } = useQuery({
    queryKey: ['reports-customers'],
    queryFn: async () => {
      const { data } = await api.get('/reports/top-customers')
      return data || []
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Berichte & Analysen</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard 
          icon={Euro} 
          label="Umsatz (MTD)" 
          value={`€${(stats?.monthlyRevenue || 0).toFixed(2)}`}
          color="text-green-600"
        />
        <SummaryCard 
          icon={Package} 
          label="Produziert (MTD)" 
          value={`${stats?.monthlyProduced || 0} Stk`}
          color="text-blue-600"
        />
        <SummaryCard 
          icon={Users} 
          label="Neue Kunden (MTD)" 
          value={`${stats?.newCustomers || 0}`}
          color="text-purple-600"
        />
        <SummaryCard 
          icon={TrendingUp} 
          label="Offene Aufträge" 
          value={`${stats?.pendingOrders || 0}`}
          color="text-orange-600"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Umsatz nach Monat</h2>
          <div className="h-64">
            {revenueData?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `€${value.toFixed(2)}`} />
                  <Bar dataKey="revenue" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                Keine Daten verfügbar
              </div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Top Produkte</h2>
          <div className="h-64">
            {productData?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={productData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {productData.map((_: unknown, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                Keine Daten verfügbar
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Customers Table */}
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Top Kunden</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Umsatz</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aufträge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {customerData?.length > 0 ? (
              customerData.map((customer: any, index: number) => (
                <tr key={index}>
                  <td className="px-6 py-4 font-medium text-gray-900">{customer.name}</td>
                  <td className="px-6 py-4 text-right">€{customer.revenue.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right">{customer.orderCount}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-6 py-4 text-center text-gray-500">Keine Daten verfügbar</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: { 
  icon: any; 
  label: string; 
  value: string;
  color: string;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 bg-gray-100 rounded-lg ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  )
}

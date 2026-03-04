import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, FileText,
  ClipboardList, Receipt, Factory, BarChart3, Settings,
  Lock, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import api from '../lib/api'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/customers', icon: Users, label: 'Kunden' },
  { path: '/products', icon: Package, label: 'Produkte' },
  { path: '/offers', icon: FileText, label: 'Angebote' },
  { path: '/orders', icon: ClipboardList, label: 'Aufträge' },
  { path: '/production', icon: Factory, label: 'Produktion' },
  { path: '/invoices', icon: Receipt, label: 'Rechnungen' },
  { path: '/reports', icon: BarChart3, label: 'Berichte' },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { lock } = useAuthStore()
  const navigate = useNavigate()

  const handleLock = async () => {
    try {
      await api.post('/auth/lock')
      lock()
      navigate('/login')
    } catch (error) {
      console.error('Lock failed:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 lg:static lg:inset-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-6 bg-gray-800">
          <span className="text-xl font-bold">HolzERP</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="mt-6 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }
              `}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          <NavLink
            to="/settings"
            className={({ isActive }) => `
              flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isActive
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }
            `}
          >
            <Settings className="w-5 h-5 mr-3" />
            Einstellungen
          </NavLink>
          <button
            onClick={handleLock}
            className="w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <Lock className="w-5 h-5 mr-3" />
            Sperren
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100"
          >
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">{new Date().toLocaleDateString('de-DE')}</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { ToastContainer } from './components/ui/ToastContainer'
import { ErrorBoundary } from './components/ErrorBoundary'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import Offers from './pages/Offers'
import OfferDetail from './pages/OfferDetail'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Invoices from './pages/Invoices'
import InvoiceDetail from './pages/InvoiceDetail'
import Production from './pages/Production'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import OfferResponse from './pages/OfferResponse'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isUnlocked } = useAuthStore()
  return isUnlocked ? <>{children}</> : <Navigate to="/login" />
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/public/offer/:token" element={<OfferResponse />} />
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="customers" element={<ErrorBoundary><Customers /></ErrorBoundary>} />
          <Route path="customers/:id" element={<ErrorBoundary><CustomerDetail /></ErrorBoundary>} />
          <Route path="products" element={<ErrorBoundary><Products /></ErrorBoundary>} />
          <Route path="products/:id" element={<ErrorBoundary><ProductDetail /></ErrorBoundary>} />
          <Route path="offers" element={<ErrorBoundary><Offers /></ErrorBoundary>} />
          <Route path="offers/:id" element={<ErrorBoundary><OfferDetail /></ErrorBoundary>} />
          <Route path="orders" element={<ErrorBoundary><Orders /></ErrorBoundary>} />
          <Route path="orders/:id" element={<ErrorBoundary><OrderDetail /></ErrorBoundary>} />
          <Route path="invoices" element={<ErrorBoundary><Invoices /></ErrorBoundary>} />
          <Route path="invoices/:id" element={<ErrorBoundary><InvoiceDetail /></ErrorBoundary>} />
          <Route path="production" element={<ErrorBoundary><Production /></ErrorBoundary>} />
          <Route path="reports" element={<ErrorBoundary><Reports /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
        </Route>
      </Routes>
      <ToastContainer />
    </ErrorBoundary>
  )
}

export default App
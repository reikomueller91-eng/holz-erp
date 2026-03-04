import type { FastifyPluginAsync } from 'fastify';
import type { OrderStatus, OfferStatus } from '../../shared/types';
import { requireUnlocked } from '../middleware/auth';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
    const {
        customerRepository,
        productRepository,
        offerRepository,
        orderRepository,
        invoiceRepository
    } = fastify;

    fastify.get('/dashboard/stats', { preHandler: requireUnlocked }, async () => {
        // 1. Total Customers (PaginatedResult)
        const customersResult = customerRepository.findAll();
        const totalCustomers = customersResult.total;

        // 2. Total Products (Promise<Product[]>)
        const products = await productRepository.findAll();
        const totalProducts = products.length;

        // 3. Open Offers
        const offers = await offerRepository.findAll({ status: 'open' as OfferStatus });

        // 4. Pending Orders (in_production)
        const orders = await orderRepository.findAll();
        const pendingOrders = orders.filter(o => o.status === 'in_production');

        // 5. Unpaid Invoices (sent)
        const invoices = await invoiceRepository.findAll();
        const unpaidInvoices = invoices.filter(i => i.status === 'sent');

        // 6. Monthly Revenue (Paid invoices this month)
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const paidInvoicesThisMonth = invoices.filter(i => {
            if (i.status !== 'paid' || !i.paidAt) return false;
            const paidDate = new Date(i.paidAt);
            return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
        });

        const monthlyRevenue = paidInvoicesThisMonth.reduce((sum, invoice) => sum + invoice.totalGross, 0);

        // 7. Recent Orders (last 5)
        // Resolve customer names for recent orders
        const recentOrders = orders.slice(0, 5);
        const recentOrdersWithNames = await Promise.all(
            recentOrders.map(async (o) => {
                let customerName = 'Unbekannt';
                try {
                    const customer = await customerRepository.findById(o.customerId);
                    if (customer) customerName = customer.name;
                } catch { /* ignore */ }
                return { ...o, customerName };
            })
        );

        // 8. Production Queue (Items from in_production orders)
        // We mock this slightly based on the existing orders since we don't have a dedicated "ProductionQueue" table
        const productionQueue = [];
        for (const order of pendingOrders) {
            for (const item of order.items) {
                let productName = 'Unbekannt';
                try {
                    const product = await productRepository.findById(item.productId);
                    if (product) productName = product.name;
                } catch { /* ignore */ }

                productionQueue.push({
                    id: item.id,
                    orderId: order.id,
                    productId: item.productId,
                    productName,
                    targetQuantity: item.quantity,
                    producedQuantity: item.quantityProduced,
                    status: item.quantityProduced >= item.quantity ? 'done' : (item.quantityProduced > 0 ? 'in_progress' : 'queued')
                });
            }
        }

        // Sort production queue so in_progress is first, then queued
        productionQueue.sort((a, b) => {
            if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
            if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
            return 0;
        });

        return {
            totalCustomers,
            totalProducts,
            openOffers: offers.length,
            pendingOrders: pendingOrders.length,
            unpaidInvoices: unpaidInvoices.length,
            monthlyRevenue,
            recentOrders: recentOrdersWithNames,
            productionQueue: productionQueue.slice(0, 5) // top 5
        };
    });
};

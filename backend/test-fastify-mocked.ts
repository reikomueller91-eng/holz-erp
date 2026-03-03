import fastify from 'fastify';
import { productRoutes } from './src/api/routes/products';
import { ProductService } from './src/application/services/ProductService';
import { ProductRepository } from './src/infrastructure/repositories/ProductRepository';

// Mock DB
const mockDb = {
    run: () => ({ lastInsertRowid: 1, changes: 1 }),
    query: () => [{
        id: "uuid-1",
        product_id: "uuid-1",
        price_per_m2: 50,
        effective_from: "2023-01-01",
        effective_to: null,
        reason: null,
        created_at: "2023-01-01"
    }],
    queryOne: () => null,
    transaction: (fn: any) => () => fn(),
    pragma: () => { },
    close: () => { }
} as any;

const dummyCrypto = {
    encryptJson: () => ({}),
    decryptJson: () => ({}),
    serializeField: () => "mocked",
    deserializeField: () => ({}),
    parseField: () => ({} as any),
    encrypt: () => ({} as any),
    decrypt: () => '' as any,
};

async function main() {
    const repo = new ProductRepository(mockDb, dummyCrypto);
    const productService = new ProductService(repo);

    const app = fastify();
    app.decorate('productService', productService);

    await app.register(productRoutes, { prefix: '/api' });

    await app.listen({ port: 3001 });
    console.log('Server running on port 3001');

    try {
        const res = await fetch('http://localhost:3001/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "New item",
                woodType: "Eiche",
                qualityGrade: "A",
                heightMm: 20,
                widthMm: 100,
                currentPricePerM2: 50
            })
        });
        console.log('Status:', res.status);
        console.log('Body:', await res.text());
    } catch (err) {
        console.error('Fetch error:', err);
    } finally {
        app.close();
    }
}

main().catch(console.error);

import fastify from 'fastify';
import { randomUUID } from 'crypto';

import { productRoutes } from './src/api/routes/products';
import { ProductService } from './src/application/services/ProductService';
import { ProductRepository } from './src/infrastructure/repositories/ProductRepository';
import { createDatabase } from './src/infrastructure/db/sqlite/SqliteDatabase';
import { runMigrations } from './src/infrastructure/db/migrate';

const dummyCrypto = {
    encryptJson: (payload: any) => ({
        algorithm: 'aes-256-gcm' as const,
        keyId: 'test-key',
        iv: 'dummy-iv',
        tag: 'dummy-tag',
        ciphertext: Buffer.from(JSON.stringify(payload)).toString('base64'),
    }),
    decryptJson: () => ({}),
    serializeField: (field: any) => JSON.stringify(field),
    deserializeField: (stored: string) => JSON.parse(stored),
    parseField: () => ({ algorithm: 'aes-256-gcm', keyId: 'test', iv: '', tag: '', ciphertext: '' } as any),
    encrypt: () => ({} as any),
    decrypt: () => '' as any,
};

async function main() {
    const db = createDatabase(':memory:');
    await runMigrations(db);
    const repo = new ProductRepository(db, dummyCrypto);
    const productService = new ProductService(repo);

    const app = fastify();
    app.decorate('productService', productService);

    await app.register(productRoutes, { prefix: '/api' });

    await app.listen({ port: 3000 });
    console.log('Server running on port 3000');

    console.log('Triggering POST /api/products...');
    const response = await fetch('http://localhost:3000/api/products', {
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

    const text = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${text}`);
    app.close();
}

main().catch(console.error);

import { createDatabase } from './src/infrastructure/db/sqlite/SqliteDatabase';
import { ProductRepository } from './src/infrastructure/repositories/ProductRepository';
import { runMigrations } from './src/infrastructure/db/migrate';
import { randomUUID } from 'crypto';

// Dummy crypto service
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
    decrypt: () => Buffer.from(''),
};

async function main() {
    console.log('Starting...');
    const db = createDatabase(':memory:');
    await runMigrations(db);
    const repo = new ProductRepository(db, dummyCrypto);

    console.log('Seeding product...');
    await repo.save({
        id: randomUUID(),
        name: 'Test',
        woodType: 'Eiche',
        qualityGrade: 'A',
        dimensions: { heightMm: 10, widthMm: 10 },
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    } as any);

    console.log('Querying products...');
    const products = await repo.findAll();
    console.log('Found:', products.length);

    const history = await repo.getPriceHistory(products[0].id);
    console.log('History:', history.length);

    console.log('Done.');
}

main().catch(console.error);

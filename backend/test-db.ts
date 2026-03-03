import { createDatabase } from './src/infrastructure/db/sqlite/SqliteDatabase';
import { CustomerRepository } from './src/infrastructure/repositories/CustomerRepository';
import { createCustomer } from './src/domain/customer/Customer';
import { runMigrations } from './src/infrastructure/db/migrate';
import { randomUUID } from 'crypto';

// Dummy crypto service
const dummyCrypto = {
    encryptJson: (payload: any) => ({
        algorithm: 'aes-256-gcm' as const,
        keyId: 'test-key',
        iv: 'dummy-iv',
        tag: 'dummy-tag',
        ciphertext: JSON.stringify(payload),
    }),
    decryptJson: () => ({}),
    serializeField: (field: any) => JSON.stringify(field),
    parseField: () => ({ algorithm: 'aes-256-gcm', keyId: 'test', iv: '', tag: '', ciphertext: '' } as any),
    encrypt: () => ({} as any),
    decrypt: () => Buffer.from(''),
};

async function main() {
    const db = createDatabase(':memory:');
    await runMigrations(db);
    const repo = new CustomerRepository(db, dummyCrypto);

    const customer = createCustomer({
        id: randomUUID(),
        name: 'Test Customer',
        contactInfo: { email: 'test@example.com' },
        notes: '',
        source: 'website',
    });

    try {
        repo.create(customer);
        console.log('Success!');
    } catch (err: any) {
        console.error('Error message:', err.message);
        if (err.cause) {
            console.error('Error cause:', err.cause);
        }
    }
}

main().catch(console.error);

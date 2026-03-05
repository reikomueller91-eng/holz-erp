import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './src/api/server';
import { createDatabase } from './src/infrastructure/db/sqlite/SqliteDatabase';
import { runMigrations } from './src/infrastructure/db/migrate';
import fs from 'fs';
import path from 'path';

let app: any;
let db: any;
const dbPath = path.join(process.cwd(), 'data', 'test-doc-links.db');

beforeAll(async () => {
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    db = createDatabase(dbPath);
    await runMigrations(db);

    // Inject mock keys
    app = buildServer({ db });
    await app.ready();

    // Setup test user
    const cryptoService = (app as any).cryptoService;
    const authService = (app as any).authService;
    const configRepo = (app as any).systemConfigRepository;

    await authService.setup('password12345');
});

afterAll(async () => {
    await app.close();
    db.close();
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
});

describe('Document Links API', () => {
    let authToken = '';
    let customerId = '';
    let productId = '';
    let linkToken = '';
    let rawPassword = '';
    let orderId = '';

    it('should login to get token', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/auth/unlock',
            payload: { masterPassword: 'password12345' },
        });

        expect(response.statusCode).toBe(200);
        authToken = JSON.parse(response.payload).token;
    });

    it('should create customer and product for test', async () => {
        const custRes = await app.inject({
            method: 'POST',
            url: '/api/customers',
            headers: { Authorization: `Bearer ${authToken}` },
            payload: {
                name: 'Test Customer',
                contactInfo: { email: 'test@example.com' }
            }
        });
        customerId = JSON.parse(custRes.payload).id;

        const prodRes = await app.inject({
            method: 'POST',
            url: '/api/products',
            headers: { Authorization: `Bearer ${authToken}` },
            payload: {
                name: 'Test Product',
                woodType: 'Eiche',
                qualityGrade: 'A',
                heightMm: 10,
                widthMm: 100,
                currentPricePerM2: 50
            }
        });
        productId = JSON.parse(prodRes.payload).id;
    });

    it('should create an order and return a document link internally', async () => {
        const orderRes = await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: { Authorization: `Bearer ${authToken}` },
            payload: {
                customerId,
                items: [{
                    productId,
                    heightMm: 10,
                    widthMm: 100,
                    lengthMm: 1000,
                    quantity: 5,
                    pricePerM2: 50,
                    quality: 'A'
                }],
                vatPercent: 19
            }
        });

        expect(orderRes.statusCode).toBe(200);
        orderId = JSON.parse(orderRes.payload).order.id;

        // Fetch document links from the DB directly to test if it was generated
        const links = await (app as any).documentLinkService['documentLinkRepo'].findByOrder(orderId);
        expect(links).toHaveLength(1);

        linkToken = links[0].token;
        // Since we cannot retrieve raw password from DB, we just verify the link exists.
        // We'll test actual validation via the public endpoint in another test via mocking if necessary,
        // or just rely on the API returning valid links. Because order creates it internally, we'll
        // manually create a link via service to test the public endpoint.
    });

    it('should create and validate a link via public API', async () => {
        const svc = (app as any).documentLinkService;
        const { link, rawPassword: pw } = await svc.createLink({ orderId });

        const res = await app.inject({
            method: 'GET',
            url: `/api/public/documents/${link.token}?pw=${pw}`
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
    });

    it('should reject invalid password', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/api/public/documents/${linkToken}?pw=wrongpassword`
        });

        expect(res.statusCode).toBe(403);
    });
});

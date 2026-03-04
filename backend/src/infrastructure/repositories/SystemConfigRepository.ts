import type { IDatabase } from '../../application/ports/IDatabase';

export interface ISystemConfigRepository {
    getValue(key: string): Promise<string | null>;
    setValue(key: string, value: string): Promise<void>;
    getAll(): Promise<Record<string, string>>;
}

export class SystemConfigRepository implements ISystemConfigRepository {
    constructor(private db: IDatabase) { }

    async getValue(key: string): Promise<string | null> {
        const row = this.db.queryOne<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [key]);
        return row ? row.value : null;
    }

    async setValue(key: string, value: string): Promise<void> {
        const existing = await this.getValue(key);
        if (existing !== null) {
            this.db.run('UPDATE system_config SET value = ? WHERE key = ?', [value, key]);
        } else {
            this.db.run('INSERT INTO system_config (key, value) VALUES (?, ?)', [key, value]);
        }
    }

    async getAll(): Promise<Record<string, string>> {
        const rows = this.db.query<{ key: string; value: string }>('SELECT key, value FROM system_config');
        const config: Record<string, string> = {};
        rows.forEach(row => {
            config[row.key] = row.value;
        });
        return config;
    }
}

/**
 * Port: IKeyStore
 * In-memory storage for the derived MasterKey.
 * The key MUST be zeroed on lock.
 */
export interface IKeyStore {
  /** Store the derived master key in memory */
  setKey(key: Buffer): void;

  /** Retrieve the key (throws LockedError if not set) */
  getKey(): Buffer;

  /** Check if the system is currently unlocked */
  isUnlocked(): boolean;

  /** Zero the key buffer and remove it from memory */
  lock(): void;
}

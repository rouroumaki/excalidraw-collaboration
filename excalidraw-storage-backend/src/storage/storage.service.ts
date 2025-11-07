import { Injectable, Logger } from '@nestjs/common';
import * as Keyv from 'keyv';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  storagesMap = new Map<string, Keyv>();

  constructor() {
    const uri = process.env[`STORAGE_URI`];
    if (!uri) {
      this.logger.warn(
        `STORAGE_URI is undefined, will use non persistant in memory storage`,
      );
    }

    // 串行初始化 Keyv 实例，避免 PostgreSQL 类型创建冲突
    Object.keys(StorageNamespace).forEach((namespace) => {
      const keyv = new Keyv({
        uri,
        namespace,
      });
      keyv.on('error', (err) => {
        // 忽略 PostgreSQL 类型重复创建错误（不影响功能）
        if (err.message && err.message.includes('duplicate key value violates unique constraint')) {
          this.logger.debug(`Type already exists for namespace ${namespace}, continuing...`);
          return;
        }
        this.logger.error(`Connection Error for namespace ${namespace}`, err);
      });
      this.storagesMap.set(namespace, keyv);
    });
  }
  get(key: string, namespace: StorageNamespace): Promise<Buffer> {
    return this.storagesMap.get(namespace).get(key);
  }
  async has(key: string, namespace: StorageNamespace): Promise<boolean> {
    return !!(await this.storagesMap.get(namespace).get(key));
  }
  set(key: string, value: Buffer, namespace: StorageNamespace): Promise<true> {
    return this.storagesMap.get(namespace).set(key, value);
  }

  /**
   * Get roomKey for a roomId
   * @param roomId The room ID
   * @returns The roomKey string or null if not found
   */
  async getRoomKey(roomId: string): Promise<string | null> {
    const key = `${roomId}:key`;
    const value = await this.storagesMap
      .get(StorageNamespace.ROOMS)
      .get(key);
    if (!value) {
      return null;
    }
    // roomKey is stored as a string, convert from Buffer if needed
    if (Buffer.isBuffer(value)) {
      return value.toString('utf-8');
    }
    return value as string;
  }

  /**
   * Set roomKey for a roomId
   * @param roomId The room ID
   * @param roomKey The roomKey string to store
   */
  async setRoomKey(roomId: string, roomKey: string): Promise<true> {
    const key = `${roomId}:key`;
    // Convert string to Buffer for consistency with other storage
    const buffer = Buffer.from(roomKey, 'utf-8');
    return this.storagesMap.get(StorageNamespace.ROOMS).set(key, buffer);
  }
}

export enum StorageNamespace {
  SCENES = 'SCENES',
  ROOMS = 'ROOMS',
  FILES = 'FILES',
}

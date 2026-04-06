import { logger } from './logger';

/**
 * Memory management utilities to help prevent OutOfMemoryError
 * These utilities help manage JavaScript heap usage and optimize garbage collection
 */
export class MemoryManager {
  private static instance: MemoryManager;
  private lastCleanup: number = 0;
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private memoryWarningThreshold = 200 * 1024 * 1024; // 200MB warning threshold

  private constructor() {}

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * Memory-efficient clearing of large objects
   */
  public clearObjects(...objects: any[]): void {
    objects.forEach(obj => {
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj)) {
          obj.length = 0;
        } else {
          // Setting properties to null is generally more efficient than 'delete'
          // as it maintains the object's hidden class in V8/Hermes
          Object.keys(obj).forEach(key => {
            try {
              (obj as any)[key] = null;
            } catch (error) {}
          });
        }
      }
    });
  }

  /**
   * Optimized array processing to prevent memory accumulation
   * Processes arrays in batches to allow garbage collection between batches
   */
  public async processArrayInBatches<T, R>(
    array: T[],
    processor: (item: T, index: number) => Promise<R> | R,
    batchSize: number = 10,
    delayMs: number = 0
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < array.length; i += batchSize) {
      const batch = array.slice(i, i + batchSize);
      
      // Process batch
      const batchResults = await Promise.all(
        batch.map((item, batchIndex) => processor(item, i + batchIndex))
      );
      
      results.push(...batchResults);
      
      // Cleanup between batches for large datasets
      if (i > 0 && i % (batchSize * 5) === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
      
      // Optional delay to prevent blocking
      if (delayMs > 0 && i + batchSize < array.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return results;
  }

  /**
   * Monitor memory usage and trigger cleanup if needed
   */
  public checkMemoryPressure(): boolean {
    const now = Date.now();
    const timeSinceLastCleanup = now - this.lastCleanup;
    
    // Perform cleanup if enough time has passed
    if (timeSinceLastCleanup >= this.CLEANUP_INTERVAL) {
      this.performMemoryCleanup();
      this.lastCleanup = now;
      return true;
    }
    
    return false;
  }

  /**
   * Perform memory cleanup operations
   */
  private performMemoryCleanup(): void {
    try {
      logger.log('[MemoryManager] Performing memory cleanup');
      this.clearGlobalCaches();
    } catch (error) {
      logger.error('[MemoryManager] Error during memory cleanup:', error);
    }
  }

  /**
   * Clear global caches to free memory
   */
  private clearGlobalCaches(): void {
    try {
      // Clear any image caches (React Native specific)
      if (global && (global as any).__IMAGE_CACHE__) {
        (global as any).__IMAGE_CACHE__ = {};
      }
      
      // Clear any other global caches your app might have
      if (global && (global as any).__APP_CACHE__) {
        (global as any).__APP_CACHE__ = {};
      }
    } catch (error) {
      logger.warn('[MemoryManager] Could not clear global caches:', error);
    }
  }

  /**
   * Create a memory-efficient filter for large arrays
   * Processes items one by one and yields to the event loop periodically
   */
  public async filterLargeArray<T>(
    array: T[],
    predicate: (item: T, index: number) => boolean,
    yieldEvery: number = 100
  ): Promise<T[]> {
    const result: T[] = [];
    
    for (let i = 0; i < array.length; i++) {
      if (predicate(array[i], i)) {
        result.push(array[i]);
      }
      
      // Yield to event loop periodically to prevent blocking
      if (i > 0 && i % yieldEvery === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    return result;
  }

  /**
   * Create a memory-efficient map for large arrays
   * Processes items in batches and manages memory between batches
   */
  public async mapLargeArray<T, R>(
    array: T[],
    mapper: (item: T, index: number) => R,
    batchSize: number = 50
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < array.length; i += batchSize) {
      const batch = array.slice(i, i + batchSize);
      const batchResults = batch.map((item, batchIndex) => mapper(item, i + batchIndex));
      
      results.push(...batchResults);
      
      // Cleanup between large batches
      if (i > 0 && i % (batchSize * 10) === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    return results;
  }

  /**
   * Limit array size to prevent memory overflow
   */
  public limitArraySize<T>(array: T[], maxSize: number): T[] {
    if (array.length <= maxSize) {
      return array;
    }
    
    logger.warn(`[MemoryManager] Array size (${array.length}) exceeds limit (${maxSize}), truncating`);
    return array.slice(0, maxSize);
  }

  /**
   * Deep clone with memory optimization
   * Only clones necessary properties to reduce memory footprint
   */
  public optimizedClone<T>(obj: T, maxDepth: number = 3, currentDepth: number = 0): T {
    if (currentDepth >= maxDepth || obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => 
        this.optimizedClone(item, maxDepth, currentDepth + 1)
      ) as unknown as T;
    }
    
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.optimizedClone(obj[key], maxDepth, currentDepth + 1);
      }
    }
    
    return cloned;
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();

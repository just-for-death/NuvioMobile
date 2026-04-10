import type {
  CatalogFilter,
  Manifest,
  Meta,
  MetaDetails,
  Stream,
} from './types';

export interface StremioServiceContext {
  installedAddons: Map<string, Manifest>;
  addonOrder: string[];
  STORAGE_KEY: string;
  ADDON_ORDER_KEY: string;
  DEFAULT_PAGE_SIZE: number;
  initialized: boolean;
  initializationPromise: Promise<void> | null;
  catalogHasMore: Map<string, boolean>;
  ensureInitialized(): Promise<void>;
  retryRequest<T>(request: () => Promise<T>, retries?: number, delay?: number): Promise<T>;
  saveInstalledAddons(): Promise<void>;
  saveAddonOrder(): Promise<void>;
  generateInstallationId(addonId: string): string;
  addonProvidesStreams(manifest: Manifest): boolean;
  formatId(id: string): string;
  getInstalledAddons(): Manifest[];
  getAddonBaseURL(url: string): { baseUrl: string; queryParams?: string };
  processStreams(streams: any[], addon: Manifest): Stream[];
  isValidContentId(type: string, id: string | null | undefined): Promise<boolean>;
  getCatalog(
    manifest: Manifest,
    type: string,
    id: string,
    page?: number,
    filters?: CatalogFilter[]
  ): Promise<Meta[]>;
  getMetaDetails(type: string, id: string, preferredAddonId?: string): Promise<MetaDetails | null>;
  hasUserRemovedAddon(addonId: string): Promise<boolean>;
  unmarkAddonAsRemovedByUser(addonId: string): Promise<void>;
}

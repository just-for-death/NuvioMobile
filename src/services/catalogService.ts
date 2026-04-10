import {
  getBasicContentDetails,
  getContentDetails,
  getDataSourcePreference,
  getEnhancedContentDetails,
  getStremioId,
  setDataSourcePreference,
} from './catalog/content-details';
import {
  discoverContent,
  discoverContentFromCatalog,
  fetchHomeCatalog,
  getAllStreamingAddons,
  getCatalogByType,
  getDiscoverFilters,
  getHomeCatalogs,
  resolveHomeCatalogsToFetch,
} from './catalog/discovery';
import {
  addToLibrary,
  ensureCatalogInitialized,
  getLibraryItems,
  getRecentContent,
  initializeCatalogState,
  onLibraryAdd,
  onLibraryRemove,
  removeFromLibrary,
  subscribeToLibraryUpdates,
} from './catalog/library';
import {
  searchContent,
  searchContentCinemeta,
  startLiveSearch,
} from './catalog/search';
import type { CatalogLibraryState } from './catalog/library';
import type {
  AddonSearchResults,
  CatalogContent,
  DataSource,
  GroupedSearchResults,
  StreamingAddon,
  StreamingCatalog,
  StreamingContent,
} from './catalog/types';

export { DataSource } from './catalog/types';
export type {
  AddonSearchResults,
  CatalogContent,
  GroupedSearchResults,
  StreamingAddon,
  StreamingContent,
} from './catalog/types';

class CatalogService implements CatalogLibraryState {
  private static instance: CatalogService;

  readonly LEGACY_LIBRARY_KEY = 'stremio-library';
  readonly RECENT_CONTENT_KEY = 'stremio-recent-content';
  readonly MAX_RECENT_ITEMS = 20;

  library: Record<string, StreamingContent> = {};
  recentContent: StreamingContent[] = [];
  librarySubscribers: Array<(items: StreamingContent[]) => void> = [];
  libraryAddListeners: Array<(item: StreamingContent) => void> = [];
  libraryRemoveListeners: Array<(type: string, id: string) => void> = [];
  initPromise: Promise<void>;
  isInitialized = false;

  private constructor() {
    this.initPromise = initializeCatalogState(this);
  }

  static getInstance(): CatalogService {
    if (!CatalogService.instance) {
      CatalogService.instance = new CatalogService();
    }

    return CatalogService.instance;
  }

  private async ensureInitialized(): Promise<void> {
    await ensureCatalogInitialized(this);
  }

  async getAllAddons(): Promise<StreamingAddon[]> {
    return getAllStreamingAddons();
  }

  async resolveHomeCatalogsToFetch(limitIds?: string[]) {
    return resolveHomeCatalogsToFetch(limitIds);
  }

  async fetchHomeCatalog(addon: StreamingAddon, catalog: StreamingCatalog): Promise<CatalogContent | null> {
    return fetchHomeCatalog(this.library, addon, catalog);
  }

  async getHomeCatalogs(limitIds?: string[]): Promise<CatalogContent[]> {
    return getHomeCatalogs(this.library, limitIds);
  }

  async getCatalogByType(type: string, genreFilter?: string): Promise<CatalogContent[]> {
    const dataSourcePreference = await getDataSourcePreference();
    return getCatalogByType(this.library, dataSourcePreference, type, genreFilter);
  }

  async getDataSourcePreference(): Promise<DataSource> {
    return getDataSourcePreference();
  }

  async setDataSourcePreference(dataSource: DataSource): Promise<void> {
    await setDataSourcePreference(dataSource);
  }

  async getContentDetails(type: string, id: string, preferredAddonId?: string): Promise<StreamingContent | null> {
    return getContentDetails(this, type, id, preferredAddonId);
  }

  async getEnhancedContentDetails(
    type: string,
    id: string,
    preferredAddonId?: string
  ): Promise<StreamingContent | null> {
    return getEnhancedContentDetails(this, type, id, preferredAddonId);
  }

  async getBasicContentDetails(
    type: string,
    id: string,
    preferredAddonId?: string
  ): Promise<StreamingContent | null> {
    return getBasicContentDetails(this, type, id, preferredAddonId);
  }

  onLibraryAdd(listener: (item: StreamingContent) => void): () => void {
    return onLibraryAdd(this, listener);
  }

  onLibraryRemove(listener: (type: string, id: string) => void): () => void {
    return onLibraryRemove(this, listener);
  }

  async getLibraryItems(): Promise<StreamingContent[]> {
    return getLibraryItems(this);
  }

  subscribeToLibraryUpdates(callback: (items: StreamingContent[]) => void): () => void {
    return subscribeToLibraryUpdates(this, callback);
  }

  async addToLibrary(content: StreamingContent): Promise<void> {
    await addToLibrary(this, content);
  }

  async removeFromLibrary(type: string, id: string): Promise<void> {
    await removeFromLibrary(this, type, id);
  }

  getRecentContent(): StreamingContent[] {
    return getRecentContent(this);
  }

  async getDiscoverFilters() {
    return getDiscoverFilters();
  }

  async discoverContent(type: string, genre?: string, limit = 20) {
    return discoverContent(this.library, type, genre, limit);
  }

  async discoverContentFromCatalog(
    addonId: string,
    catalogId: string,
    type: string,
    genre?: string,
    page = 1
  ): Promise<StreamingContent[]> {
    return discoverContentFromCatalog(this.library, addonId, catalogId, type, genre, page);
  }

  async searchContent(query: string): Promise<StreamingContent[]> {
    return searchContent(this.library, query);
  }

  async searchContentCinemeta(query: string): Promise<GroupedSearchResults> {
    return searchContentCinemeta(this.library, query);
  }

  startLiveSearch(
    query: string,
    onAddonResults: (section: AddonSearchResults) => void
  ): { cancel: () => void; done: Promise<void> } {
    return startLiveSearch(this.library, query, onAddonResults);
  }

  async getStremioId(type: string, tmdbId: string): Promise<string | null> {
    return getStremioId(type, tmdbId);
  }
}

export const catalogService = CatalogService.getInstance();
export default catalogService;

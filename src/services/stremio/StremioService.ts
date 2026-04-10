import { mmkvStorage } from '../mmkvStorage';
import { logger } from '../../utils/logger';

import type { StremioServiceContext } from './context';
import {
  getAllSupportedIdPrefixes as getAllSupportedIdPrefixesImpl,
  getAllSupportedTypes as getAllSupportedTypesImpl,
  getInstalledAddons as getInstalledAddonsImpl,
  getInstalledAddonsAsync as getInstalledAddonsAsyncImpl,
  getManifest as getManifestImpl,
  hasUserRemovedAddon as hasUserRemovedAddonImpl,
  initializeAddons,
  installAddon as installAddonImpl,
  isCollectionContent as isCollectionContentImpl,
  isPreInstalledAddon as isPreInstalledAddonImpl,
  removeAddon as removeAddonImpl,
  unmarkAddonAsRemovedByUser as unmarkAddonAsRemovedByUserImpl,
} from './addon-management';
import {
  applyAddonOrderFromManifestUrls as applyAddonOrderFromManifestUrlsImpl,
  moveAddonDown as moveAddonDownImpl,
  moveAddonUp as moveAddonUpImpl,
} from './addon-order';
import {
  getAddonCapabilities as getAddonCapabilitiesImpl,
  getAddonCatalogs as getAddonCatalogsImpl,
  getAllCatalogs as getAllCatalogsImpl,
  getCatalog as getCatalogImpl,
  getCatalogHasMore as getCatalogHasMoreImpl,
  getCatalogPreview as getCatalogPreviewImpl,
  getMetaDetails as getMetaDetailsImpl,
  getUpcomingEpisodes as getUpcomingEpisodesImpl,
  isValidContentId as isValidContentIdImpl,
} from './catalog-operations';
import { getStreams as getStreamsImpl, hasStreamProviders as hasStreamProvidersImpl } from './stream-operations';
import { getSubtitles as getSubtitlesImpl } from './subtitle-operations';
import type {
  AddonCapabilities,
  AddonCatalogItem,
  CatalogExtra,
  CatalogFilter,
  Manifest,
  Meta,
  MetaDetails,
  MetaLink,
  ResourceObject,
  SourceObject,
  Stream,
  StreamCallback,
  StreamResponse,
  Subtitle,
  SubtitleResponse,
} from './types';

class StremioService implements StremioServiceContext {
  private static instance: StremioService;

  installedAddons: Map<string, Manifest> = new Map();
  addonOrder: string[] = [];
  readonly STORAGE_KEY = 'stremio-addons';
  readonly ADDON_ORDER_KEY = 'stremio-addon-order';
  readonly DEFAULT_PAGE_SIZE = 100;
  initialized = false;
  initializationPromise: Promise<void> | null = null;
  catalogHasMore: Map<string, boolean> = new Map();

  private constructor() {
    this.initializationPromise = this.initialize();
  }

  static getInstance(): StremioService {
    if (!StremioService.instance) {
      StremioService.instance = new StremioService();
    }

    return StremioService.instance;
  }

  private async initialize(): Promise<void> {
    await initializeAddons(this);
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  async retryRequest<T>(request: () => Promise<T>, retries = 1, delay = 1000): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < retries + 1; attempt += 1) {
      try {
        return await request();
      } catch (error: any) {
        lastError = error;

        if (error.response?.status === 404) {
          throw error;
        }

        if (error.response?.status !== 404) {
          logger.warn(`Request failed (attempt ${attempt + 1}/${retries + 1}):`, {
            message: error.message,
            code: error.code,
            isAxiosError: error.isAxiosError,
            status: error.response?.status,
          });
        }

        if (attempt < retries) {
          const backoffDelay = delay * Math.pow(2, attempt);
          logger.log(`Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }

    throw lastError;
  }

  async saveInstalledAddons(): Promise<void> {
    try {
      const addonsArray = Array.from(this.installedAddons.values());
      const scope = (await mmkvStorage.getItem('@user:current')) || 'local';
      await Promise.all([
        mmkvStorage.setItem(`@user:${scope}:${this.STORAGE_KEY}`, JSON.stringify(addonsArray)),
        mmkvStorage.setItem(this.STORAGE_KEY, JSON.stringify(addonsArray)),
      ]);
    } catch {
      // Storage writes are best-effort.
    }
  }

  async saveAddonOrder(): Promise<void> {
    try {
      const scope = (await mmkvStorage.getItem('@user:current')) || 'local';
      await Promise.all([
        mmkvStorage.setItem(`@user:${scope}:${this.ADDON_ORDER_KEY}`, JSON.stringify(this.addonOrder)),
        mmkvStorage.setItem(this.ADDON_ORDER_KEY, JSON.stringify(this.addonOrder)),
      ]);
    } catch {
      // Storage writes are best-effort.
    }
  }

  generateInstallationId(addonId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${addonId}-${timestamp}-${random}`;
  }

  addonProvidesStreams(manifest: Manifest): boolean {
    return (manifest.resources || []).some(resource => {
      if (typeof resource === 'string') {
        return resource === 'stream';
      }

      return resource !== null && typeof resource === 'object' && 'name' in resource
        ? (resource as ResourceObject).name === 'stream'
        : false;
    });
  }

  formatId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  getAddonBaseURL(url: string): { baseUrl: string; queryParams?: string } {
    const [baseUrl, queryString] = url.split('?');
    let cleanBaseUrl = baseUrl.replace(/manifest\.json$/, '').replace(/\/$/, '');

    if (!cleanBaseUrl.startsWith('http')) {
      cleanBaseUrl = `https://${cleanBaseUrl}`;
    }

    return { baseUrl: cleanBaseUrl, queryParams: queryString };
  }

  private isDirectStreamingUrl(url?: string): boolean {
    return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
  }

  private getStreamUrl(stream: any): string {
    if (typeof stream?.url === 'string') {
      return stream.url;
    }

    if (stream?.url && typeof stream.url === 'object' && typeof stream.url.url === 'string') {
      return stream.url.url;
    }

    if (stream.ytId) {
      return `https://www.youtube.com/watch?v=${stream.ytId}`;
    }

    if (stream.infoHash) {
      const trackers = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://9.rarbg.com:2810/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://open.stealth.si:80/announce',
        'udp://tracker.leechers-paradise.org:6969/announce',
        'udp://tracker.coppersurfer.tk:6969/announce',
        'udp://tracker.internetwarriors.net:1337/announce',
      ];
      const additionalTrackers = (stream.sources || [])
        .filter((source: string) => source.startsWith('tracker:'))
        .map((source: string) => source.replace('tracker:', ''));
      const trackersString = [...trackers, ...additionalTrackers]
        .map(tracker => `&tr=${encodeURIComponent(tracker)}`)
        .join('');
      const encodedTitle = encodeURIComponent(stream.title || stream.name || 'Unknown');
      return `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodedTitle}${trackersString}`;
    }

    return '';
  }

  processStreams(streams: any[], addon: Manifest): Stream[] {
    return streams
      .filter(stream => {
        const hasPlayableLink = Boolean(
          stream.url ||
            stream.infoHash ||
            stream.ytId ||
            stream.externalUrl ||
            stream.nzbUrl ||
            stream.rarUrls?.length ||
            stream.zipUrls?.length ||
            stream['7zipUrls']?.length ||
            stream.tgzUrls?.length ||
            stream.tarUrls?.length
        );
        const hasIdentifier = Boolean(stream.title || stream.name);
        return stream && hasPlayableLink && hasIdentifier;
      })
      .map(stream => {
        const streamUrl = this.getStreamUrl(stream);
        const isDirectStreamingUrl = this.isDirectStreamingUrl(streamUrl);
        const isMagnetStream = streamUrl.startsWith('magnet:');
        const isExternalUrl = Boolean(stream.externalUrl);

        let displayTitle = stream.title || stream.name || 'Unnamed Stream';
        if (
          stream.description &&
          stream.description.includes('\n') &&
          stream.description.length > (stream.title?.length || 0)
        ) {
          displayTitle = stream.description;
        }

        const sizeInBytes = stream.behaviorHints?.videoSize || stream.size || undefined;
        const behaviorHints: Stream['behaviorHints'] = {
          notWebReady: !isDirectStreamingUrl || isExternalUrl,
          cached: stream.behaviorHints?.cached || undefined,
          bingeGroup: stream.behaviorHints?.bingeGroup || undefined,
          countryWhitelist: stream.behaviorHints?.countryWhitelist || undefined,
          proxyHeaders: stream.behaviorHints?.proxyHeaders || undefined,
          videoHash: stream.behaviorHints?.videoHash || undefined,
          videoSize: stream.behaviorHints?.videoSize || undefined,
          filename: stream.behaviorHints?.filename || undefined,
          ...(isMagnetStream
            ? {
                infoHash: stream.infoHash || streamUrl.match(/btih:([a-zA-Z0-9]+)/)?.[1],
                fileIdx: stream.fileIdx,
                type: 'torrent',
              }
            : {}),
        };

        return {
          url: streamUrl || undefined,
          name: stream.name || stream.title || 'Unnamed Stream',
          title: displayTitle,
          addonName: addon.name,
          addonId: addon.id,
          description: stream.description,
          ytId: stream.ytId || undefined,
          externalUrl: stream.externalUrl || undefined,
          nzbUrl: stream.nzbUrl || undefined,
          rarUrls: stream.rarUrls || undefined,
          zipUrls: stream.zipUrls || undefined,
          '7zipUrls': stream['7zipUrls'] || undefined,
          tgzUrls: stream.tgzUrls || undefined,
          tarUrls: stream.tarUrls || undefined,
          servers: stream.servers || undefined,
          infoHash: stream.infoHash || undefined,
          fileIdx: stream.fileIdx,
          fileMustInclude: stream.fileMustInclude || undefined,
          size: sizeInBytes,
          isFree: stream.isFree,
          isDebrid: Boolean(stream.behaviorHints?.cached),
          subtitles:
            stream.subtitles?.map((subtitle: any, index: number) => ({
              id: subtitle.id || `${addon.id}-${subtitle.lang || 'unknown'}-${index}`,
              ...subtitle,
            })) || undefined,
          sources: stream.sources || undefined,
          behaviorHints,
        };
      });
  }

  getAllSupportedTypes(): string[] {
    return getAllSupportedTypesImpl(this);
  }

  getAllSupportedIdPrefixes(type: string): string[] {
    return getAllSupportedIdPrefixesImpl(this, type);
  }

  isCollectionContent(id: string): { isCollection: boolean; addon?: Manifest } {
    return isCollectionContentImpl(this, id);
  }

  async isValidContentId(type: string, id: string | null | undefined): Promise<boolean> {
    return isValidContentIdImpl(
      this,
      type,
      id,
      () => this.getAllSupportedTypes(),
      value => this.getAllSupportedIdPrefixes(value)
    );
  }

  async getManifest(url: string): Promise<Manifest> {
    return getManifestImpl(this, url);
  }

  async installAddon(url: string): Promise<void> {
    await installAddonImpl(this, url);
  }

  async removeAddon(installationId: string): Promise<void> {
    await removeAddonImpl(this, installationId);
  }

  getInstalledAddons(): Manifest[] {
    return getInstalledAddonsImpl(this);
  }

  async getInstalledAddonsAsync(): Promise<Manifest[]> {
    return getInstalledAddonsAsyncImpl(this);
  }

  isPreInstalledAddon(id: string): boolean {
    void id;
    return isPreInstalledAddonImpl();
  }

  async hasUserRemovedAddon(addonId: string): Promise<boolean> {
    return hasUserRemovedAddonImpl(addonId);
  }

  async unmarkAddonAsRemovedByUser(addonId: string): Promise<void> {
    await unmarkAddonAsRemovedByUserImpl(addonId);
  }

  async getAllCatalogs(): Promise<Record<string, Meta[]>> {
    return getAllCatalogsImpl(this);
  }

  async getCatalog(
    manifest: Manifest,
    type: string,
    id: string,
    page = 1,
    filters: CatalogFilter[] = []
  ): Promise<Meta[]> {
    return getCatalogImpl(this, manifest, type, id, page, filters);
  }

  getCatalogHasMore(manifestId: string, type: string, id: string): boolean | undefined {
    return getCatalogHasMoreImpl(this, manifestId, type, id);
  }

  async getMetaDetails(type: string, id: string, preferredAddonId?: string): Promise<MetaDetails | null> {
    return getMetaDetailsImpl(this, type, id, preferredAddonId);
  }

  async getUpcomingEpisodes(
    type: string,
    id: string,
    options: {
      daysBack?: number;
      daysAhead?: number;
      maxEpisodes?: number;
      preferredAddonId?: string;
    } = {}
  ): Promise<{ seriesName: string; poster: string; episodes: any[] } | null> {
    return getUpcomingEpisodesImpl(this, type, id, options);
  }

  async getStreams(type: string, id: string, callback?: StreamCallback): Promise<void> {
    await getStreamsImpl(this, type, id, callback);
  }

  getAddonCapabilities(): AddonCapabilities[] {
    return getAddonCapabilitiesImpl(this);
  }

  async getCatalogPreview(
    addonId: string,
    type: string,
    id: string,
    limit = 5
  ): Promise<{ addon: string; type: string; id: string; items: Meta[] }> {
    return getCatalogPreviewImpl(this, addonId, type, id, limit);
  }

  async getSubtitles(type: string, id: string, videoId?: string): Promise<Subtitle[]> {
    return getSubtitlesImpl(this, type, id, videoId);
  }

  moveAddonUp(installationId: string): boolean {
    return moveAddonUpImpl(this, installationId);
  }

  moveAddonDown(installationId: string): boolean {
    return moveAddonDownImpl(this, installationId);
  }

  async applyAddonOrderFromManifestUrls(manifestUrls: string[]): Promise<boolean> {
    return applyAddonOrderFromManifestUrlsImpl(this, manifestUrls);
  }

  async hasStreamProviders(type?: string): Promise<boolean> {
    return hasStreamProvidersImpl(this, type);
  }

  async getAddonCatalogs(type: string, id: string): Promise<AddonCatalogItem[]> {
    return getAddonCatalogsImpl(this, type, id);
  }
}

export const stremioService = StremioService.getInstance();

export type {
  AddonCapabilities,
  AddonCatalogItem,
  CatalogExtra,
  Manifest,
  Meta,
  MetaDetails,
  MetaLink,
  SourceObject,
  Stream,
  StreamResponse,
  Subtitle,
  SubtitleResponse,
};

export { StremioService };
export default stremioService;

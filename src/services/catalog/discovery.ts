import { stremioService } from '../stremioService';
import { TMDBService } from '../tmdbService';
import { logger } from '../../utils/logger';
import { getCatalogDisplayName } from '../../utils/catalogNameUtils';

import {
  canBrowseCatalog,
  convertManifestToStreamingAddon,
  getAllAddons,
  isVisibleOnHome,
} from './catalog-utils';
import { convertMetaToStreamingContent, convertTMDBToStreamingContent } from './content-mappers';
import type { CatalogContent, DataSource, StreamingAddon, StreamingCatalog, StreamingContent } from './types';

export async function getAllStreamingAddons(): Promise<StreamingAddon[]> {
  return getAllAddons(() => stremioService.getInstalledAddonsAsync());
}

export async function resolveHomeCatalogsToFetch(
  limitIds?: string[]
): Promise<Array<{ addon: StreamingAddon; catalog: StreamingCatalog }>> {
  const addons = await getAllStreamingAddons();
  const potentialCatalogs: Array<{ addon: StreamingAddon; catalog: StreamingCatalog }> = [];

  for (const addon of addons) {
    for (const catalog of addon.catalogs || []) {
      if (isVisibleOnHome(catalog, addon.catalogs)) {
        potentialCatalogs.push({ addon, catalog });
      }
    }
  }

  if (limitIds && limitIds.length > 0) {
    return potentialCatalogs.filter(item => {
      const catalogId = `${item.addon.id}:${item.catalog.type}:${item.catalog.id}`;
      return limitIds.includes(catalogId);
    });
  }

  return potentialCatalogs.sort(() => 0.5 - Math.random()).slice(0, 5);
}

export async function fetchHomeCatalog(
  library: Record<string, StreamingContent>,
  addon: StreamingAddon,
  catalog: StreamingCatalog
): Promise<CatalogContent | null> {
  try {
    const addonManifests = await stremioService.getInstalledAddonsAsync();
    const manifest = addonManifests.find(currentAddon => currentAddon.id === addon.id);
    if (!manifest) {
      return null;
    }

    const metas = await stremioService.getCatalog(manifest, catalog.type, catalog.id, 1);
    if (!metas || metas.length === 0) {
      return null;
    }

    const items = metas.slice(0, 12).map(meta => convertMetaToStreamingContent(meta, library));
    const originalName = catalog.name || catalog.id;
    let displayName = await getCatalogDisplayName(addon.id, catalog.type, catalog.id, originalName);
    const isCustom = displayName !== originalName;

    if (!isCustom) {
      const uniqueWords: string[] = [];
      const seenWords = new Set<string>();

      for (const word of displayName.split(' ')) {
        const normalizedWord = word.toLowerCase();
        if (!seenWords.has(normalizedWord)) {
          uniqueWords.push(word);
          seenWords.add(normalizedWord);
        }
      }

      displayName = uniqueWords.join(' ');

      const contentType = catalog.type === 'movie' ? 'Movies' : 'TV Shows';
      if (!displayName.toLowerCase().includes(contentType.toLowerCase())) {
        displayName = `${displayName} ${contentType}`;
      }
    }

    return {
      addon: addon.id,
      type: catalog.type,
      id: catalog.id,
      name: displayName,
      items,
    };
  } catch (error) {
    logger.error(`Failed to load ${catalog.name} from ${addon.name}:`, error);
    return null;
  }
}

export async function getHomeCatalogs(
  library: Record<string, StreamingContent>,
  limitIds?: string[]
): Promise<CatalogContent[]> {
  const catalogsToFetch = await resolveHomeCatalogsToFetch(limitIds);
  const catalogResults = await Promise.all(
    catalogsToFetch.map(({ addon, catalog }) => fetchHomeCatalog(library, addon, catalog))
  );

  return catalogResults.filter((catalog): catalog is CatalogContent => catalog !== null);
}

export async function getCatalogByType(
  library: Record<string, StreamingContent>,
  dataSourcePreference: DataSource,
  type: string,
  genreFilter?: string
): Promise<CatalogContent[]> {
  if (dataSourcePreference === 'tmdb') {
    return getCatalogByTypeFromTMDB(library, type, genreFilter);
  }

  const addons = await getAllStreamingAddons();
  const typeAddons = addons.filter(addon => addon.catalogs.some(catalog => catalog.type === type));
  const manifests = await stremioService.getInstalledAddonsAsync();
  const manifestMap = new Map(manifests.map(manifest => [manifest.id, manifest]));
  const catalogPromises: Array<Promise<CatalogContent | null>> = [];

  for (const addon of typeAddons) {
    const typeCatalogs = addon.catalogs.filter(
      catalog => catalog.type === type && isVisibleOnHome(catalog, addon.catalogs)
    );

    for (const catalog of typeCatalogs) {
      catalogPromises.push(
        (async () => {
          try {
            const manifest = manifestMap.get(addon.id);
            if (!manifest) {
              return null;
            }

            const filters = genreFilter ? [{ title: 'genre', value: genreFilter }] : [];
            const metas = await stremioService.getCatalog(manifest, type, catalog.id, 1, filters);

            if (!metas || metas.length === 0) {
              return null;
            }

            return {
              addon: addon.id,
              type,
              id: catalog.id,
              name: await getCatalogDisplayName(addon.id, catalog.type, catalog.id, catalog.name),
              genre: genreFilter,
              items: metas.map(meta => convertMetaToStreamingContent(meta, library)),
            };
          } catch (error) {
            logger.error(`Failed to get catalog ${catalog.id} for addon ${addon.id}:`, error);
            return null;
          }
        })()
      );
    }
  }

  const catalogResults = await Promise.all(catalogPromises);
  return catalogResults.filter((catalog): catalog is CatalogContent => catalog !== null);
}

async function getCatalogByTypeFromTMDB(
  library: Record<string, StreamingContent>,
  type: string,
  genreFilter?: string
): Promise<CatalogContent[]> {
  const tmdbService = TMDBService.getInstance();
  const tmdbType = type === 'movie' ? 'movie' : 'tv';

  try {
    if (!genreFilter || genreFilter === 'All') {
      return Promise.all([
        (async () => ({
          addon: 'tmdb',
          type,
          id: 'trending',
          name: `Trending ${type === 'movie' ? 'Movies' : 'TV Shows'}`,
          items: await Promise.all(
            (await tmdbService.getTrending(tmdbType, 'week')).map(item =>
              convertTMDBToStreamingContent(item, tmdbType, library)
            )
          ),
        }))(),
        (async () => ({
          addon: 'tmdb',
          type,
          id: 'popular',
          name: `Popular ${type === 'movie' ? 'Movies' : 'TV Shows'}`,
          items: await Promise.all(
            (await tmdbService.getPopular(tmdbType, 1)).map(item =>
              convertTMDBToStreamingContent(item, tmdbType, library)
            )
          ),
        }))(),
        (async () => ({
          addon: 'tmdb',
          type,
          id: 'upcoming',
          name: type === 'movie' ? 'Upcoming Movies' : 'On Air TV Shows',
          items: await Promise.all(
            (await tmdbService.getUpcoming(tmdbType, 1)).map(item =>
              convertTMDBToStreamingContent(item, tmdbType, library)
            )
          ),
        }))(),
      ]);
    }

    return [{
      addon: 'tmdb',
      type,
      id: 'discover',
      name: `${genreFilter} ${type === 'movie' ? 'Movies' : 'TV Shows'}`,
      genre: genreFilter,
      items: await Promise.all(
        (await tmdbService.discoverByGenre(tmdbType, genreFilter)).map(item =>
          convertTMDBToStreamingContent(item, tmdbType, library)
        )
      ),
    }];
  } catch (error) {
    logger.error(`Failed to get catalog from TMDB for type ${type}, genre ${genreFilter}:`, error);
    return [];
  }
}

export async function getDiscoverFilters(): Promise<{
  genres: string[];
  types: string[];
  catalogsByType: Record<
    string,
    Array<{ addonId: string; addonName: string; catalogId: string; catalogName: string; genres: string[] }>
  >;
}> {
  const addons = await getAllStreamingAddons();
  const allGenres = new Set<string>();
  const allTypes = new Set<string>();
  const catalogsByType: Record<
    string,
    Array<{ addonId: string; addonName: string; catalogId: string; catalogName: string; genres: string[] }>
  > = {};

  for (const addon of addons) {
    for (const catalog of addon.catalogs || []) {
      if (!canBrowseCatalog(catalog)) {
        continue;
      }

      if (catalog.type) {
        allTypes.add(catalog.type);
      }

      const catalogGenres: string[] = [];
      for (const extra of catalog.extra || []) {
        if (extra.name === 'genre' && Array.isArray(extra.options)) {
          for (const genre of extra.options) {
            allGenres.add(genre);
            catalogGenres.push(genre);
          }
        }
      }

      if (catalog.type) {
        catalogsByType[catalog.type] ||= [];
        catalogsByType[catalog.type].push({
          addonId: addon.id,
          addonName: addon.name,
          catalogId: catalog.id,
          catalogName: catalog.name || catalog.id,
          genres: catalogGenres,
        });
      }
    }
  }

  return {
    genres: Array.from(allGenres).sort((left, right) => left.localeCompare(right)),
    types: Array.from(allTypes),
    catalogsByType,
  };
}

export async function discoverContent(
  library: Record<string, StreamingContent>,
  type: string,
  genre?: string,
  limit = 20
): Promise<Array<{ addonName: string; items: StreamingContent[] }>> {
  const addons = await getAllStreamingAddons();
  const manifests = await stremioService.getInstalledAddonsAsync();
  const manifestMap = new Map(manifests.map(manifest => [manifest.id, manifest]));
  const catalogPromises: Array<Promise<{ addonName: string; items: StreamingContent[] } | null>> = [];

  for (const addon of addons) {
    const matchingCatalogs = addon.catalogs.filter(
      catalog => catalog.type === type && canBrowseCatalog(catalog)
    );

    for (const catalog of matchingCatalogs) {
      const supportsGenre = catalog.extra?.some(extra => extra.name === 'genre') ||
        catalog.extraSupported?.includes('genre');

      if (genre && !supportsGenre) {
        continue;
      }

      const manifest = manifestMap.get(addon.id);
      if (!manifest) {
        continue;
      }

      catalogPromises.push(
        (async () => {
          try {
            const filters = genre ? [{ title: 'genre', value: genre }] : [];
            const metas = await stremioService.getCatalog(manifest, type, catalog.id, 1, filters);

            if (!metas || metas.length === 0) {
              return null;
            }

            return {
              addonName: addon.name,
              items: metas.slice(0, limit).map(meta => ({
                ...convertMetaToStreamingContent(meta, library),
                addonId: addon.id,
              })),
            };
          } catch (error) {
            logger.error(`Discover failed for ${catalog.id} in addon ${addon.id}:`, error);
            return null;
          }
        })()
      );
    }
  }

  const addonMap = new Map<string, StreamingContent[]>();
  for (const result of await Promise.all(catalogPromises)) {
    if (!result || result.items.length === 0) {
      continue;
    }

    const existingItems = addonMap.get(result.addonName) || [];
    const existingIds = new Set(existingItems.map(item => `${item.type}:${item.id}`));
    const newItems = result.items.filter(item => !existingIds.has(`${item.type}:${item.id}`));
    addonMap.set(result.addonName, [...existingItems, ...newItems]);
  }

  return Array.from(addonMap.entries()).map(([addonName, items]) => ({
    addonName,
    items: items.slice(0, limit),
  }));
}

export async function discoverContentFromCatalog(
  library: Record<string, StreamingContent>,
  addonId: string,
  catalogId: string,
  type: string,
  genre?: string,
  page = 1
): Promise<StreamingContent[]> {
  try {
    const manifests = await stremioService.getInstalledAddonsAsync();
    const manifest = manifests.find(currentManifest => currentManifest.id === addonId);

    if (!manifest) {
      logger.error(`Addon ${addonId} not found`);
      return [];
    }

    const catalog = (manifest.catalogs || []).find(item => item.type === type && item.id === catalogId);
    if (!catalog || !canBrowseCatalog(convertManifestToStreamingAddon(manifest).catalogs.find(
      item => item.type === type && item.id === catalogId
    ) || { ...catalog, extraSupported: catalog.extraSupported || [], extra: catalog.extra || [] })) {
      logger.warn(`Catalog ${catalogId} in addon ${addonId} is not browseable`);
      return [];
    }

    const filters = genre ? [{ title: 'genre', value: genre }] : [];
    const metas = await stremioService.getCatalog(manifest, type, catalogId, page, filters);

    return (metas || []).map(meta => ({
      ...convertMetaToStreamingContent(meta, library),
      addonId,
    }));
  } catch (error) {
    logger.error(`Discover from catalog failed for ${addonId}/${catalogId}:`, error);
    return [];
  }
}

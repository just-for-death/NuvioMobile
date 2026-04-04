import { MutableRefObject } from 'react';

import { StreamingContent, catalogService } from '../../../services/catalogService';
import { storageService } from '../../../services/storageService';
import { stremioService } from '../../../services/stremioService';
import { TraktContentData } from '../../../services/traktService';

import { CACHE_DURATION } from './constants';
import {
  CachedMetadataEntry,
  GetCachedMetadata,
  LocalProgressEntry,
} from './dataTypes';
import { ContinueWatchingItem } from './types';
import {
  compareContinueWatchingItems,
  getContinueWatchingItemKey,
  getContinueWatchingRemoveId,
  getIdVariants,
  isEpisodeReleased,
  shouldPreferContinueWatchingCandidate,
  toYearNumber,
} from './utils';

export function createGetCachedMetadata(
  metadataCache: MutableRefObject<Record<string, CachedMetadataEntry>>
): GetCachedMetadata {
  return async (type: string, id: string, addonId?: string) => {
    const cacheKey = `${type}:${id}:${addonId || 'default'}`;
    const cached = metadataCache.current[cacheKey];
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_DURATION) {
      return cached;
    }

    try {
      const shouldFetchMeta = await stremioService.isValidContentId(type, id);
      const [metadata, basicContent, addonSpecificMeta] = await Promise.all([
        shouldFetchMeta ? stremioService.getMetaDetails(type, id) : Promise.resolve(null),
        catalogService.getBasicContentDetails(type, id),
        addonId
          ? stremioService.getMetaDetails(type, id, addonId).catch(() => null)
          : Promise.resolve(null),
      ]);

      const preferredAddonMeta = addonSpecificMeta || metadata;

      const finalContent = basicContent
        ? {
            ...basicContent,
            ...(preferredAddonMeta?.name && { name: preferredAddonMeta.name }),
            ...(preferredAddonMeta?.poster && { poster: preferredAddonMeta.poster }),
            ...(preferredAddonMeta?.description && {
              description: preferredAddonMeta.description,
            }),
          }
        : null;

      if (!finalContent) {
        return null;
      }

      const result: CachedMetadataEntry = {
        metadata,
        basicContent: finalContent as StreamingContent,
        addonContent: preferredAddonMeta,
        timestamp: now,
      };

      metadataCache.current[cacheKey] = result;
      return result;
    } catch {
      return null;
    }
  };
}

export async function filterRemovedItems(
  items: ContinueWatchingItem[],
  recentlyRemoved: Set<string>
): Promise<ContinueWatchingItem[]> {
  const filtered: ContinueWatchingItem[] = [];

  for (const item of items) {
    if (recentlyRemoved.has(getContinueWatchingItemKey(item))) {
      continue;
    }

    const isRemoved = await storageService.isContinueWatchingRemoved(
      getContinueWatchingRemoveId(item),
      item.type
    );

    if (!isRemoved) {
      filtered.push(item);
    }
  }

  return filtered;
}

export function dedupeLocalItems(items: ContinueWatchingItem[]): ContinueWatchingItem[] {
  const map = new Map<string, ContinueWatchingItem>();

  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      continue;
    }

    if (shouldPreferContinueWatchingCandidate(item, existing)) {
      const mergedLastUpdated = Math.max(item.lastUpdated ?? 0, existing.lastUpdated ?? 0);
      map.set(
        key,
        mergedLastUpdated !== (item.lastUpdated ?? 0)
          ? { ...item, lastUpdated: mergedLastUpdated }
          : item
      );
    }
  }

  return Array.from(map.values()).sort(compareContinueWatchingItems);
}

export function findNextEpisode(
  currentSeason: number,
  currentEpisode: number,
  videos: any[],
  watchedSet?: Set<string>,
  showId?: string,
  localWatchedMap?: Map<string, number>,
  baseTimestamp: number = 0
): { video: any; lastWatched: number } | null {
  if (!videos || !Array.isArray(videos)) return null;

  const sortedVideos = [...videos].sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });

  let latestWatchedTimestamp = baseTimestamp;

  if (localWatchedMap && showId) {
    const cleanShowId = showId.startsWith('tt') ? showId : `tt${showId}`;
    for (const video of sortedVideos) {
      const sig1 = `${cleanShowId}:${video.season}:${video.episode}`;
      const sig2 = `${showId}:${video.season}:${video.episode}`;
      latestWatchedTimestamp = Math.max(
        latestWatchedTimestamp,
        localWatchedMap.get(sig1) || 0,
        localWatchedMap.get(sig2) || 0
      );
    }
  }

  const isAlreadyWatched = (season: number, episode: number): boolean => {
    if (!showId) return false;

    const cleanShowId = showId.startsWith('tt') ? showId : `tt${showId}`;
    const sig1 = `${cleanShowId}:${season}:${episode}`;
    const sig2 = `${showId}:${season}:${episode}`;

    if (watchedSet && (watchedSet.has(sig1) || watchedSet.has(sig2))) return true;
    if (localWatchedMap && (localWatchedMap.has(sig1) || localWatchedMap.has(sig2))) return true;

    return false;
  };

  for (const video of sortedVideos) {
    if (video.season < currentSeason) continue;
    if (video.season === currentSeason && video.episode <= currentEpisode) continue;
    if (isAlreadyWatched(video.season, video.episode)) continue;

    if (isEpisodeReleased(video)) {
      return { video, lastWatched: latestWatchedTimestamp };
    }
  }

  return null;
}

export function buildTraktContentData(
  item: ContinueWatchingItem
): TraktContentData | null {
  if (item.type === 'movie') {
    return {
      type: 'movie',
      imdbId: item.id,
      title: item.name,
      year: toYearNumber((item as any).year),
    };
  }

  if (item.type === 'series' && item.season && item.episode) {
    return {
      type: 'episode',
      imdbId: item.id,
      title: item.episodeTitle || `S${item.season}E${item.episode}`,
      season: item.season,
      episode: item.episode,
      showTitle: item.name,
      showYear: toYearNumber((item as any).year),
      showImdbId: item.id,
    };
  }

  return null;
}

export function getLocalMatches(
  item: ContinueWatchingItem,
  localProgressIndex: Map<string, LocalProgressEntry[]> | null
): LocalProgressEntry[] {
  if (!localProgressIndex) return [];

  const matches: LocalProgressEntry[] = [];

  for (const idVariant of getIdVariants(item.id)) {
    const entries = localProgressIndex.get(`${item.type}:${idVariant}`);
    if (!entries?.length) continue;

    if (item.type === 'movie') {
      matches.push(...entries);
      continue;
    }

    if (item.season === undefined || item.episode === undefined) continue;

    for (const entry of entries) {
      if (entry.season === item.season && entry.episode === item.episode) {
        matches.push(entry);
      }
    }
  }

  return matches;
}

export function getMostRecentLocalMatch(
  matches: LocalProgressEntry[]
): LocalProgressEntry | null {
  return matches.reduce<LocalProgressEntry | null>((acc, cur) => {
    if (!acc) return cur;
    return (cur.lastUpdated ?? 0) > (acc.lastUpdated ?? 0) ? cur : acc;
  }, null);
}

export function getHighestLocalMatch(
  matches: LocalProgressEntry[]
): LocalProgressEntry | null {
  return matches.reduce<LocalProgressEntry | null>((acc, cur) => {
    if (!acc) return cur;
    return (cur.progressPercent ?? 0) > (acc.progressPercent ?? 0) ? cur : acc;
  }, null);
}

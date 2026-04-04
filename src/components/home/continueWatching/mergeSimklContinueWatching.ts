import { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { SimklService } from '../../../services/simklService';
import { logger } from '../../../utils/logger';

import { SIMKL_SYNC_COOLDOWN } from './constants';
import { GetCachedMetadata, LocalProgressEntry } from './dataTypes';
import {
  filterRemovedItems,
  findNextEpisode,
  getLocalMatches,
  getMostRecentLocalMatch,
} from './dataShared';
import { ContinueWatchingItem } from './types';
import { compareContinueWatchingItems } from './utils';

interface MergeSimklContinueWatchingParams {
  simklService: SimklService;
  getCachedMetadata: GetCachedMetadata;
  localProgressIndex: Map<string, LocalProgressEntry[]> | null;
  traktShowsSetPromise: Promise<Set<string>>;
  localWatchedShowsMapPromise: Promise<Map<string, number>>;
  recentlyRemoved: Set<string>;
  lastSimklSyncRef: MutableRefObject<number>;
  setContinueWatchingItems: Dispatch<SetStateAction<ContinueWatchingItem[]>>;
}

export async function mergeSimklContinueWatching({
  simklService,
  getCachedMetadata,
  localProgressIndex,
  traktShowsSetPromise,
  localWatchedShowsMapPromise,
  recentlyRemoved,
  lastSimklSyncRef,
  setContinueWatchingItems,
}: MergeSimklContinueWatchingParams): Promise<void> {
  const now = Date.now();
  if (
    SIMKL_SYNC_COOLDOWN > 0 &&
    now - lastSimklSyncRef.current < SIMKL_SYNC_COOLDOWN
  ) {
    return;
  }
  lastSimklSyncRef.current = now;

  const playbackItems = await simklService.getPlaybackStatus();
  const simklBatch: ContinueWatchingItem[] = [];
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

  const sortedPlaybackItems = [...playbackItems]
    .sort((a, b) => new Date(b.paused_at).getTime() - new Date(a.paused_at).getTime())
    .slice(0, 30);

  for (const item of sortedPlaybackItems) {
    try {
      if ((item.progress ?? 0) < 2) continue;

      const pausedAt = new Date(item.paused_at).getTime();
      if (pausedAt < thirtyDaysAgo) continue;

      if (item.type === 'movie' && item.movie?.ids?.imdb) {
        if (item.progress >= 85) continue;

        const imdbId = item.movie.ids.imdb.startsWith('tt')
          ? item.movie.ids.imdb
          : `tt${item.movie.ids.imdb}`;

        if (recentlyRemoved.has(`movie:${imdbId}`)) continue;

        const cachedData = await getCachedMetadata('movie', imdbId);
        if (!cachedData?.basicContent) continue;

        simklBatch.push({
          ...cachedData.basicContent,
          id: imdbId,
          type: 'movie',
          progress: item.progress,
          lastUpdated: pausedAt,
          addonId: undefined,
        } as ContinueWatchingItem);
      } else if (item.type === 'episode' && item.show?.ids?.imdb && item.episode) {
        const showImdb = item.show.ids.imdb.startsWith('tt')
          ? item.show.ids.imdb
          : `tt${item.show.ids.imdb}`;
        const episodeNum = item.episode.episode ?? item.episode.number;

        if (episodeNum === undefined || episodeNum === null) {
          continue;
        }

        if (recentlyRemoved.has(`series:${showImdb}`)) continue;

        const cachedData = await getCachedMetadata('series', showImdb);
        if (!cachedData?.basicContent) continue;

        if (item.progress >= 85) {
          if (cachedData.metadata?.videos) {
            const watchedEpisodesSet = await traktShowsSetPromise;
            const localWatchedMap = await localWatchedShowsMapPromise;
            const nextEpisodeResult = findNextEpisode(
              item.episode.season,
              episodeNum,
              cachedData.metadata.videos,
              watchedEpisodesSet,
              showImdb,
              localWatchedMap,
              pausedAt
            );

            if (nextEpisodeResult) {
              const nextEpisode = nextEpisodeResult.video;
              simklBatch.push({
                ...cachedData.basicContent,
                id: showImdb,
                type: 'series',
                progress: 0,
                lastUpdated: nextEpisodeResult.lastWatched,
                season: nextEpisode.season,
                episode: nextEpisode.episode,
                episodeTitle: nextEpisode.title || `Episode ${nextEpisode.episode}`,
                addonId: undefined,
              } as ContinueWatchingItem);
            }
          }

          continue;
        }

        simklBatch.push({
          ...cachedData.basicContent,
          id: showImdb,
          type: 'series',
          progress: item.progress,
          lastUpdated: pausedAt,
          season: item.episode.season,
          episode: episodeNum,
          episodeTitle: item.episode.title || `Episode ${episodeNum}`,
          addonId: undefined,
        } as ContinueWatchingItem);
      }
    } catch {
      // Keep processing remaining playback items.
    }
  }

  if (simklBatch.length === 0) {
    setContinueWatchingItems([]);
    return;
  }

  const deduped = new Map<string, ContinueWatchingItem>();
  for (const item of simklBatch) {
    const key = `${item.type}:${item.id}`;
    const existing = deduped.get(key);
    if (!existing || (item.lastUpdated ?? 0) > (existing.lastUpdated ?? 0)) {
      deduped.set(key, item);
    }
  }

  const filteredItems = await filterRemovedItems(Array.from(deduped.values()), recentlyRemoved);

  const adjustedItems = filteredItems.map((item) => {
    const matches = getLocalMatches(item, localProgressIndex);
    if (matches.length === 0) return item;

    const mostRecentLocal = getMostRecentLocalMatch(matches);
    if (!mostRecentLocal) return item;

    const localProgress = mostRecentLocal.progressPercent;
    const simklProgress = item.progress ?? 0;
    const localTs = mostRecentLocal.lastUpdated ?? 0;
    const simklTs = item.lastUpdated ?? 0;

    const isAhead = isFinite(localProgress) && localProgress > simklProgress + 0.5;
    const isLocalNewer = localTs > simklTs + 5000;

    if (isAhead || isLocalNewer) {
      return {
        ...item,
        progress: localProgress,
        lastUpdated: localTs > 0 ? localTs : item.lastUpdated,
      } as ContinueWatchingItem;
    }

    if (localTs > 0 && localTs > simklTs) {
      return {
        ...item,
        lastUpdated: localTs,
      } as ContinueWatchingItem;
    }

    return item;
  });

  adjustedItems.sort(compareContinueWatchingItems);
  setContinueWatchingItems(adjustedItems);
}

import { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { storageService } from '../../../services/storageService';
import {
  TraktService,
  TraktWatchedItem,
} from '../../../services/traktService';
import { logger } from '../../../utils/logger';

import { TRAKT_RECONCILE_COOLDOWN, TRAKT_SYNC_COOLDOWN } from './constants';
import { GetCachedMetadata, LocalProgressEntry } from './dataTypes';
import {
  buildTraktContentData,
  filterRemovedItems,
  findNextEpisode,
  getHighestLocalMatch,
  getLocalMatches,
  getMostRecentLocalMatch,
} from './dataShared';
import { ContinueWatchingItem } from './types';
import { compareContinueWatchingItems } from './utils';

interface MergeTraktContinueWatchingParams {
  traktService: TraktService;
  getCachedMetadata: GetCachedMetadata;
  localProgressIndex: Map<string, LocalProgressEntry[]> | null;
  localWatchedShowsMapPromise: Promise<Map<string, number>>;
  recentlyRemoved: Set<string>;
  lastTraktSyncRef: MutableRefObject<number>;
  lastTraktReconcileRef: MutableRefObject<Map<string, number>>;
  setContinueWatchingItems: Dispatch<SetStateAction<ContinueWatchingItem[]>>;
}

export async function mergeTraktContinueWatching({
  traktService,
  getCachedMetadata,
  localProgressIndex,
  localWatchedShowsMapPromise,
  recentlyRemoved,
  lastTraktSyncRef,
  lastTraktReconcileRef,
  setContinueWatchingItems,
}: MergeTraktContinueWatchingParams): Promise<void> {
  const now = Date.now();
  if (
    TRAKT_SYNC_COOLDOWN > 0 &&
    now - lastTraktSyncRef.current < TRAKT_SYNC_COOLDOWN
  ) {
    logger.log(
      `[TraktSync] Skipping Trakt sync - cooldown active (${Math.round((TRAKT_SYNC_COOLDOWN - (now - lastTraktSyncRef.current)) / 1000)}s remaining)`
    );
    return;
  }

  lastTraktSyncRef.current = now;
  const playbackItems = await traktService.getPlaybackProgress();
  const traktBatch: ContinueWatchingItem[] = [];

  let watchedShowsData: TraktWatchedItem[] = [];
  const watchedEpisodeSetByShow = new Map<string, Set<string>>();

  try {
    watchedShowsData = await traktService.getWatchedShows();
    for (const watchedShow of watchedShowsData) {
      if (!watchedShow.show?.ids?.imdb) continue;

      const imdb = watchedShow.show.ids.imdb.startsWith('tt')
        ? watchedShow.show.ids.imdb
        : `tt${watchedShow.show.ids.imdb}`;
      const resetAt = watchedShow.reset_at ? new Date(watchedShow.reset_at).getTime() : 0;
      const episodeSet = new Set<string>();

      if (watchedShow.seasons) {
        for (const season of watchedShow.seasons) {
          for (const episode of season.episodes) {
            if (resetAt > 0) {
              const watchedAt = new Date(episode.last_watched_at).getTime();
              if (watchedAt < resetAt) continue;
            }

            episodeSet.add(`${imdb}:${season.number}:${episode.number}`);
          }
        }
      }

      watchedEpisodeSetByShow.set(imdb, episodeSet);
    }
  } catch {
    // Continue without watched-show acceleration.
  }

  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const sortedPlaybackItems = [...playbackItems]
    .sort((a, b) => new Date(b.paused_at).getTime() - new Date(a.paused_at).getTime())
    .slice(0, 30);

  for (const item of sortedPlaybackItems) {
    try {
      if (item.progress < 2) continue;

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

        traktBatch.push({
          ...cachedData.basicContent,
          id: imdbId,
          type: 'movie',
          progress: item.progress,
          lastUpdated: pausedAt,
          addonId: undefined,
          traktPlaybackId: item.id,
        } as ContinueWatchingItem);
      } else if (item.type === 'episode' && item.show?.ids?.imdb && item.episode) {
        const showImdb = item.show.ids.imdb.startsWith('tt')
          ? item.show.ids.imdb
          : `tt${item.show.ids.imdb}`;

        if (recentlyRemoved.has(`series:${showImdb}`)) continue;

        const cachedData = await getCachedMetadata('series', showImdb);
        if (!cachedData?.basicContent) continue;

        if (item.progress >= 85) {
          if (cachedData.metadata?.videos) {
            const watchedSetForShow = watchedEpisodeSetByShow.get(showImdb);
            const localWatchedMap = await localWatchedShowsMapPromise;
            const nextEpisodeResult = findNextEpisode(
              item.episode.season,
              item.episode.number,
              cachedData.metadata.videos,
              watchedSetForShow,
              showImdb,
              localWatchedMap,
              pausedAt
            );

            if (nextEpisodeResult) {
              const nextEpisode = nextEpisodeResult.video;
              traktBatch.push({
                ...cachedData.basicContent,
                id: showImdb,
                type: 'series',
                progress: 0,
                lastUpdated: nextEpisodeResult.lastWatched,
                season: nextEpisode.season,
                episode: nextEpisode.episode,
                episodeTitle: nextEpisode.title || `Episode ${nextEpisode.episode}`,
                addonId: undefined,
                traktPlaybackId: item.id,
              } as ContinueWatchingItem);
            }
          }

          continue;
        }

        traktBatch.push({
          ...cachedData.basicContent,
          id: showImdb,
          type: 'series',
          progress: item.progress,
          lastUpdated: pausedAt,
          season: item.episode.season,
          episode: item.episode.number,
          episodeTitle: item.episode.title || `Episode ${item.episode.number}`,
          addonId: undefined,
          traktPlaybackId: item.id,
        } as ContinueWatchingItem);
      }
    } catch {
      // Continue with remaining playback items.
    }
  }

  try {
    const thirtyDaysAgoForShows = Date.now() - (30 * 24 * 60 * 60 * 1000);

    for (const watchedShow of watchedShowsData) {
      try {
        if (!watchedShow.show?.ids?.imdb) continue;

        const lastWatchedAt = new Date(watchedShow.last_watched_at).getTime();
        if (lastWatchedAt < thirtyDaysAgoForShows) continue;

        const showImdb = watchedShow.show.ids.imdb.startsWith('tt')
          ? watchedShow.show.ids.imdb
          : `tt${watchedShow.show.ids.imdb}`;

        if (recentlyRemoved.has(`series:${showImdb}`)) continue;

        const resetAt = watchedShow.reset_at ? new Date(watchedShow.reset_at).getTime() : 0;
        let lastWatchedSeason = 0;
        let lastWatchedEpisode = 0;
        let latestEpisodeTimestamp = 0;

        if (watchedShow.seasons) {
          for (const season of watchedShow.seasons) {
            for (const episode of season.episodes) {
              const episodeTimestamp = new Date(episode.last_watched_at).getTime();
              if (resetAt > 0 && episodeTimestamp < resetAt) continue;

              if (episodeTimestamp > latestEpisodeTimestamp) {
                latestEpisodeTimestamp = episodeTimestamp;
                lastWatchedSeason = season.number;
                lastWatchedEpisode = episode.number;
              }
            }
          }
        }

        if (lastWatchedSeason === 0 && lastWatchedEpisode === 0) continue;

        const cachedData = await getCachedMetadata('series', showImdb);
        if (!cachedData?.basicContent || !cachedData.metadata?.videos) continue;

        const watchedEpisodeSet = watchedEpisodeSetByShow.get(showImdb) ?? new Set<string>();
        const localWatchedMap = await localWatchedShowsMapPromise;
        const nextEpisodeResult = findNextEpisode(
          lastWatchedSeason,
          lastWatchedEpisode,
          cachedData.metadata.videos,
          watchedEpisodeSet,
          showImdb,
          localWatchedMap,
          latestEpisodeTimestamp
        );

        if (nextEpisodeResult) {
          const nextEpisode = nextEpisodeResult.video;
          traktBatch.push({
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
      } catch {
        // Continue with remaining watched shows.
      }
    }
  } catch (err) {
    logger.warn('[TraktSync] Error fetching watched shows for Up Next:', err);
  }

  if (traktBatch.length === 0) {
    return;
  }

  const deduped = new Map<string, ContinueWatchingItem>();
  for (const item of traktBatch) {
    const key = `${item.type}:${item.id}`;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, item);
      continue;
    }

    const existingHasProgress = (existing.progress ?? 0) > 0;
    const candidateHasProgress = (item.progress ?? 0) > 0;

    if (candidateHasProgress && !existingHasProgress) {
      const mergedTs = Math.max(item.lastUpdated ?? 0, existing.lastUpdated ?? 0);
      deduped.set(
        key,
        mergedTs !== (item.lastUpdated ?? 0)
          ? { ...item, lastUpdated: mergedTs }
          : item
      );
    } else if (!candidateHasProgress && existingHasProgress) {
      if ((item.lastUpdated ?? 0) > (existing.lastUpdated ?? 0)) {
        deduped.set(key, { ...existing, lastUpdated: item.lastUpdated });
      }
    } else if ((item.lastUpdated ?? 0) > (existing.lastUpdated ?? 0)) {
      deduped.set(key, item);
    }
  }

  const filteredItems = await filterRemovedItems(Array.from(deduped.values()), recentlyRemoved);
  const reconcilePromises: Promise<any>[] = [];
  const reconcileLocalPromises: Promise<any>[] = [];

  const adjustedItems = filteredItems
    .map((item) => {
      const matches = getLocalMatches(item, localProgressIndex);
      if (matches.length === 0) return item;

      const mostRecentLocal = getMostRecentLocalMatch(matches);
      const highestLocal = getHighestLocalMatch(matches);

      if (!mostRecentLocal || !highestLocal) {
        return item;
      }

      const mergedLastUpdated = Math.max(
        mostRecentLocal.lastUpdated ?? 0,
        item.lastUpdated ?? 0
      );
      const localProgress = mostRecentLocal.progressPercent;
      const traktProgress = item.progress ?? 0;
      const traktTs = item.lastUpdated ?? 0;
      const localTs = mostRecentLocal.lastUpdated ?? 0;

      const isAhead = isFinite(localProgress) && localProgress > traktProgress + 0.5;
      const isLocalNewer = localTs > traktTs + 5000;
      const isLocalRecent = localTs > 0 && Date.now() - localTs < 5 * 60 * 1000;
      const isDifferent = Math.abs((localProgress || 0) - (traktProgress || 0)) > 0.5;
      const isTraktAhead = isFinite(traktProgress) && traktProgress > localProgress + 0.5;

      if (isTraktAhead && !isLocalRecent && mostRecentLocal.duration > 0) {
        const reconcileKey = `local:${item.type}:${item.id}:${item.season ?? ''}:${item.episode ?? ''}`;
        const last = lastTraktReconcileRef.current.get(reconcileKey) ?? 0;
        const now = Date.now();

        if (now - last >= TRAKT_RECONCILE_COOLDOWN) {
          lastTraktReconcileRef.current.set(reconcileKey, now);

          const targetEpisodeId =
            item.type === 'series'
              ? mostRecentLocal.episodeId ||
                (item.season && item.episode
                  ? `${item.id}:${item.season}:${item.episode}`
                  : undefined)
              : undefined;

          const newCurrentTime = (traktProgress / 100) * mostRecentLocal.duration;

          reconcileLocalPromises.push(
            (async () => {
              try {
                const existing = await storageService.getWatchProgress(
                  item.id,
                  item.type,
                  targetEpisodeId
                );

                if (!existing || !existing.duration || existing.duration <= 0) {
                  return;
                }

                await storageService.setWatchProgress(
                  item.id,
                  item.type,
                  {
                    ...existing,
                    currentTime: Math.max(existing.currentTime ?? 0, newCurrentTime),
                    duration: existing.duration,
                    traktSynced: true,
                    traktLastSynced: Date.now(),
                    traktProgress: Math.max(existing.traktProgress ?? 0, traktProgress),
                    lastUpdated: existing.lastUpdated,
                  } as any,
                  targetEpisodeId,
                  { preserveTimestamp: true, forceWrite: true }
                );
              } catch {
                // Ignore background sync failures.
              }
            })()
          );
        }
      }

      if ((isAhead || ((isLocalNewer || isLocalRecent) && isDifferent)) && localProgress >= 2) {
        const reconcileKey = `${item.type}:${item.id}:${item.season ?? ''}:${item.episode ?? ''}`;
        const last = lastTraktReconcileRef.current.get(reconcileKey) ?? 0;
        const now = Date.now();

        if (now - last >= TRAKT_RECONCILE_COOLDOWN) {
          lastTraktReconcileRef.current.set(reconcileKey, now);

          const contentData = buildTraktContentData(item);
          if (contentData) {
            const progressToSend =
              localProgress >= 85
                ? Math.min(localProgress, 100)
                : Math.min(localProgress, 79.9);

            reconcilePromises.push(
              traktService.pauseWatching(contentData, progressToSend).catch(() => null)
            );
          }
        }
      }

      if (((isLocalNewer || isLocalRecent) && isDifferent) || isAhead) {
        return {
          ...item,
          progress: localProgress,
          lastUpdated: mergedLastUpdated,
        };
      }

      return {
        ...item,
        lastUpdated: mergedLastUpdated,
      };
    })
    .filter((item) => (item.progress ?? 0) < 85);

  adjustedItems.sort(compareContinueWatchingItems);
  setContinueWatchingItems(adjustedItems);

  if (reconcilePromises.length > 0) {
    Promise.allSettled(reconcilePromises).catch(() => null);
  }

  if (reconcileLocalPromises.length > 0) {
    Promise.allSettled(reconcileLocalPromises).catch(() => null);
  }
}

import { useCallback } from 'react';
import { Platform } from 'react-native';
import { NavigationProp } from '@react-navigation/native';

import { AppSettings } from '../../../hooks/useSettings';
import { RootStackParamList } from '../../../navigation/AppNavigator';
import { streamCacheService } from '../../../services/streamCacheService';
import { logger } from '../../../utils/logger';

import { ContinueWatchingItem } from './types';
import { buildEpisodeId } from './utils';

interface ContinueWatchingNavigationParams {
  navigation: NavigationProp<RootStackParamList>;
  settings: Pick<AppSettings, 'useCachedStreams' | 'openMetadataScreenWhenCacheDisabled'>;
}

export function useContinueWatchingNavigation({
  navigation,
  settings,
}: ContinueWatchingNavigationParams) {
  const navigateToMetadata = useCallback((item: ContinueWatchingItem) => {
    const episodeId = buildEpisodeId(item);

    navigation.navigate('Metadata', {
      id: item.id,
      type: item.type,
      episodeId,
      addonId: item.addonId,
    });
  }, [navigation]);

  const navigateToStreams = useCallback((item: ContinueWatchingItem) => {
    const episodeId = buildEpisodeId(item);

    navigation.navigate('Streams', {
      id: item.id,
      type: item.type,
      episodeId,
      addonId: item.addonId,
    });
  }, [navigation]);

  const handleContentPress = useCallback(async (item: ContinueWatchingItem) => {
    try {
      logger.log(`🎬 [ContinueWatching] User clicked on: ${item.name} (${item.type}:${item.id})`);

      if (!settings.useCachedStreams) {
        logger.log(
          `📺 [ContinueWatching] Cached streams disabled, navigating to ${settings.openMetadataScreenWhenCacheDisabled ? 'MetadataScreen' : 'StreamsScreen'} for ${item.name}`
        );

        if (settings.openMetadataScreenWhenCacheDisabled) {
          navigateToMetadata(item);
        } else {
          navigateToStreams(item);
        }
        return;
      }

      const episodeId = buildEpisodeId(item);
      logger.log(`🔍 [ContinueWatching] Looking for cached stream with episodeId: ${episodeId || 'none'}`);

      const cachedStream = await streamCacheService.getCachedStream(item.id, item.type, episodeId);

      if (!cachedStream) {
        logger.log(`📺 [ContinueWatching] No cached stream, navigating to StreamsScreen for ${item.name}`);
        navigateToStreams(item);
        return;
      }

      logger.log(`🚀 [ContinueWatching] Using cached stream for ${item.name}`);
      const playerRoute = Platform.OS === 'ios' ? 'PlayerIOS' : 'PlayerAndroid';

      navigation.navigate(playerRoute as any, {
        uri: cachedStream.stream.url,
        title: cachedStream.metadata?.name || item.name,
        episodeTitle:
          cachedStream.episodeTitle ||
          (item.type === 'series' ? `Episode ${item.episode}` : undefined),
        season: cachedStream.season || item.season,
        episode: cachedStream.episode || item.episode,
        quality: (cachedStream.stream.title?.match(/(\d+)p/) || [])[1] || undefined,
        year: cachedStream.metadata?.year || item.year,
        streamProvider:
          cachedStream.stream.addonId ||
          cachedStream.stream.addonName ||
          cachedStream.stream.name,
        streamName: cachedStream.stream.name || cachedStream.stream.title || 'Unnamed Stream',
        headers: cachedStream.stream.headers || undefined,
        id: item.id,
        type: item.type,
        episodeId,
        imdbId: cachedStream.imdbId || cachedStream.metadata?.imdbId || item.imdb_id,
        backdrop: cachedStream.metadata?.backdrop || item.banner,
        videoType: undefined,
      } as any);
    } catch (error) {
      logger.warn('[ContinueWatching] Error handling content press:', error);
      navigateToStreams(item);
    }
  }, [navigateToMetadata, navigateToStreams, navigation, settings.openMetadataScreenWhenCacheDisabled, settings.useCachedStreams]);

  return {
    handleContentPress,
    navigateToMetadata,
  };
}

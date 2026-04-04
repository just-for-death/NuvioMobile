import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { TFunction } from 'i18next';

import { Theme } from '../../../contexts/ThemeContext';

import { styles } from './styles';
import { ContinueWatchingItem } from './types';

interface ContinueWatchingWideCardProps {
  item: ContinueWatchingItem;
  currentTheme: Theme;
  deletingItemId: string | null;
  computedItemWidth: number;
  computedItemHeight: number;
  isTV: boolean;
  isLargeTablet: boolean;
  isTablet: boolean;
  posterBorderRadius: number;
  onPress: (item: ContinueWatchingItem) => void;
  onLongPress: (item: ContinueWatchingItem) => void;
  t: TFunction;
}

export const ContinueWatchingWideCard = React.memo(({
  item,
  currentTheme,
  deletingItemId,
  computedItemWidth,
  computedItemHeight,
  isTV,
  isLargeTablet,
  isTablet,
  posterBorderRadius,
  onPress,
  onLongPress,
  t,
}: ContinueWatchingWideCardProps) => {
  const isUpNext = item.type === 'series' && item.progress === 0;

  return (
    <TouchableOpacity
      style={[
        styles.wideContentItem,
        {
          backgroundColor: currentTheme.colors.elevation1,
          borderColor: currentTheme.colors.border,
          shadowColor: currentTheme.colors.black,
          width: computedItemWidth,
          height: computedItemHeight,
          borderRadius: posterBorderRadius,
        },
      ]}
      activeOpacity={0.8}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={800}
    >
      <View
        style={[
          styles.posterContainer,
          {
            width: isTV ? 100 : isLargeTablet ? 90 : isTablet ? 85 : 80,
          },
        ]}
      >
        <FastImage
          source={{
            uri: item.poster || 'https://via.placeholder.com/300x450',
            priority: FastImage.priority.high,
            cache: FastImage.cacheControl.immutable,
          }}
          style={[
            styles.continueWatchingPoster,
            {
              borderTopLeftRadius: posterBorderRadius,
              borderBottomLeftRadius: posterBorderRadius,
            },
          ]}
          resizeMode={FastImage.resizeMode.cover}
        />

        {deletingItemId === item.id ? (
          <View style={styles.deletingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.contentDetails,
          {
            padding: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12,
          },
        ]}
      >
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.contentTitle,
              {
                color: currentTheme.colors.highEmphasis,
                fontSize: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 17 : 16,
              },
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>

          {isUpNext ? (
            <View
              style={[
                styles.progressBadge,
                {
                  backgroundColor: currentTheme.colors.primary,
                  paddingHorizontal: isTV ? 12 : isLargeTablet ? 10 : isTablet ? 8 : 8,
                  paddingVertical: isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 3,
                },
              ]}
            >
              <Text
                style={[
                  styles.progressText,
                  { fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 12 },
                ]}
              >
                {t('home.up_next')}
              </Text>
            </View>
          ) : null}
        </View>

        {item.type === 'series' && item.season && item.episode ? (
          <View style={styles.episodeRow}>
            <Text
              style={[
                styles.episodeText,
                {
                  color: currentTheme.colors.mediumEmphasis,
                  fontSize: isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 13,
                },
              ]}
            >
              {t('home.season', { season: item.season })}
            </Text>
            {item.episodeTitle ? (
              <Text
                style={[
                  styles.episodeTitle,
                  {
                    color: currentTheme.colors.mediumEmphasis,
                    fontSize: isTV ? 15 : isLargeTablet ? 14 : isTablet ? 13 : 12,
                  },
                ]}
                numberOfLines={1}
              >
                {item.episodeTitle}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text
            style={[
              styles.yearText,
              {
                color: currentTheme.colors.mediumEmphasis,
                fontSize: isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 13,
              },
            ]}
          >
            {item.year} • {item.type === 'movie' ? t('home.movie') : t('home.series')}
          </Text>
        )}

        {item.progress > 0 ? (
          <View style={styles.wideProgressContainer}>
            <View
              style={[
                styles.wideProgressTrack,
                {
                  height: isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 4,
                },
              ]}
            >
              <View
                style={[
                  styles.wideProgressBar,
                  {
                    width: `${item.progress}%`,
                    backgroundColor: currentTheme.colors.primary,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.progressLabel,
                {
                  color: currentTheme.colors.textMuted,
                  fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 11,
                },
              ]}
            >
              {t('home.percent_watched', { percent: Math.round(item.progress) })}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

ContinueWatchingWideCard.displayName = 'ContinueWatchingWideCard';

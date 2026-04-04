import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FastImage from '@d11/react-native-fast-image';
import { TFunction } from 'i18next';

import { Theme } from '../../../contexts/ThemeContext';

import { styles } from './styles';
import { ContinueWatchingItem } from './types';

interface ContinueWatchingPosterCardProps {
  item: ContinueWatchingItem;
  currentTheme: Theme;
  deletingItemId: string | null;
  computedPosterWidth: number;
  computedPosterHeight: number;
  isTV: boolean;
  isLargeTablet: boolean;
  posterBorderRadius: number;
  onPress: (item: ContinueWatchingItem) => void;
  onLongPress: (item: ContinueWatchingItem) => void;
  t: TFunction;
}

export const ContinueWatchingPosterCard = React.memo(({
  item,
  currentTheme,
  deletingItemId,
  computedPosterWidth,
  computedPosterHeight,
  isTV,
  isLargeTablet,
  posterBorderRadius,
  onPress,
  onLongPress,
  t,
}: ContinueWatchingPosterCardProps) => (
  <TouchableOpacity
    style={[
      styles.posterContentItem,
      {
        width: computedPosterWidth,
      },
    ]}
    activeOpacity={0.8}
    onPress={() => onPress(item)}
    onLongPress={() => onLongPress(item)}
    delayLongPress={800}
  >
    <View
      style={[
        styles.posterImageContainer,
        {
          height: computedPosterHeight,
          borderRadius: posterBorderRadius,
        },
      ]}
    >
      <FastImage
        source={{
          uri: item.poster || 'https://via.placeholder.com/300x450',
          priority: FastImage.priority.high,
          cache: FastImage.cacheControl.immutable,
        }}
        style={[styles.posterImage, { borderRadius: posterBorderRadius }]}
        resizeMode={FastImage.resizeMode.cover}
      />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={[styles.posterGradient, { borderRadius: posterBorderRadius }]}
      />

      {item.type === 'series' && item.season && item.episode ? (
        <View style={styles.posterEpisodeOverlay}>
          <Text
            style={[
              styles.posterEpisodeText,
              { fontSize: isTV ? 14 : isLargeTablet ? 13 : 12 },
            ]}
          >
            S{item.season} E{item.episode}
          </Text>
        </View>
      ) : null}

      {item.type === 'series' && item.progress === 0 ? (
        <View
          style={[
            styles.posterUpNextBadge,
            { backgroundColor: currentTheme.colors.primary },
          ]}
        >
          <Text
            style={[
              styles.posterUpNextText,
              { fontSize: isTV ? 12 : 10 },
            ]}
          >
            {t('home.up_next_caps')}
          </Text>
        </View>
      ) : null}

      {item.progress > 0 ? (
        <View style={styles.posterProgressContainer}>
          <View
            style={[
              styles.posterProgressTrack,
              { backgroundColor: 'rgba(255,255,255,0.3)' },
            ]}
          >
            <View
              style={[
                styles.posterProgressBar,
                {
                  width: `${item.progress}%`,
                  backgroundColor: currentTheme.colors.primary,
                },
              ]}
            />
          </View>
        </View>
      ) : null}

      {deletingItemId === item.id ? (
        <View style={[styles.deletingOverlay, { borderRadius: posterBorderRadius }]}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      ) : null}
    </View>

    <View style={styles.posterTitleContainer}>
      <Text
        style={[
          styles.posterTitle,
          {
            color: currentTheme.colors.highEmphasis,
            fontSize: isTV ? 16 : isLargeTablet ? 15 : 14,
          },
        ]}
        numberOfLines={2}
      >
        {item.name}
      </Text>
      {item.progress > 0 ? (
        <Text
          style={[
            styles.posterProgressLabel,
            {
              color: currentTheme.colors.textMuted,
              fontSize: isTV ? 13 : 11,
            },
          ]}
        >
          {Math.round(item.progress)}%
        </Text>
      ) : null}
    </View>
  </TouchableOpacity>
));

ContinueWatchingPosterCard.displayName = 'ContinueWatchingPosterCard';

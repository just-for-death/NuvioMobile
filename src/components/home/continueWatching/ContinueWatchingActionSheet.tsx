import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import FastImage from '@d11/react-native-fast-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { EdgeInsets } from 'react-native-safe-area-context';

import { Theme } from '../../../contexts/ThemeContext';

import { styles } from './styles';
import { ContinueWatchingItem } from './types';

interface ContinueWatchingActionSheetProps {
  actionSheetRef: React.RefObject<BottomSheetModal | null>;
  currentTheme: Theme;
  insets: EdgeInsets;
  selectedItem: ContinueWatchingItem | null;
  onDismiss: () => void;
  onChange: (index: number) => void;
  onViewDetails: () => void;
  onRemoveItem: () => void;
}

export function ContinueWatchingActionSheet({
  actionSheetRef,
  currentTheme,
  insets,
  selectedItem,
  onDismiss,
  onChange,
  onViewDetails,
  onRemoveItem,
}: ContinueWatchingActionSheetProps) {
  const { t } = useTranslation();

  return (
    <BottomSheetModal
      ref={actionSheetRef}
      index={0}
      snapPoints={['35%']}
      enablePanDownToClose={true}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
        />
      )}
      backgroundStyle={{
        backgroundColor: currentTheme.colors.darkGray || '#0A0C0C',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }}
      handleIndicatorStyle={{
        backgroundColor: currentTheme.colors.mediumGray,
        width: 40,
      }}
      onDismiss={onDismiss}
      onChange={onChange}
    >
      <BottomSheetView
        style={[styles.actionSheetContent, { paddingBottom: insets.bottom + 16 }]}
      >
        {selectedItem ? (
          <>
            <View style={styles.actionSheetHeader}>
              <FastImage
                source={{
                  uri: selectedItem.poster || 'https://via.placeholder.com/100x150',
                  priority: FastImage.priority.high,
                }}
                style={styles.actionSheetPoster}
                resizeMode={FastImage.resizeMode.cover}
              />

              <View style={styles.actionSheetInfo}>
                <Text
                  style={[styles.actionSheetTitle, { color: currentTheme.colors.text }]}
                  numberOfLines={2}
                >
                  {selectedItem.name}
                </Text>

                {selectedItem.type === 'series' && selectedItem.season && selectedItem.episode ? (
                  <Text
                    style={[
                      styles.actionSheetSubtitle,
                      { color: currentTheme.colors.textMuted },
                    ]}
                  >
                    {t('home.season', { season: selectedItem.season })} ·{' '}
                    {t('home.episode', { episode: selectedItem.episode })}
                    {selectedItem.episodeTitle &&
                    selectedItem.episodeTitle !== `Episode ${selectedItem.episode}`
                      ? `\n${selectedItem.episodeTitle}`
                      : ''}
                  </Text>
                ) : (
                  <Text
                    style={[
                      styles.actionSheetSubtitle,
                      { color: currentTheme.colors.textMuted },
                    ]}
                  >
                    {selectedItem.year
                      ? `${selectedItem.type === 'movie' ? t('home.movie') : t('home.series')} · ${selectedItem.year}`
                      : selectedItem.type === 'movie'
                        ? t('home.movie')
                        : t('home.series')}
                  </Text>
                )}

                {selectedItem.progress > 0 ? (
                  <View style={styles.actionSheetProgressContainer}>
                    <View
                      style={[
                        styles.actionSheetProgressTrack,
                        { backgroundColor: currentTheme.colors.elevation1 },
                      ]}
                    >
                      <View
                        style={[
                          styles.actionSheetProgressBar,
                          {
                            width: `${selectedItem.progress}%`,
                            backgroundColor: currentTheme.colors.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.actionSheetProgressText,
                        { color: currentTheme.colors.textMuted },
                      ]}
                    >
                      {t('home.percent_watched', {
                        percent: Math.round(selectedItem.progress),
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.actionSheetButtons}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={onViewDetails}
                activeOpacity={0.8}
              >
                <Ionicons name="information-circle-outline" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>{t('home.view_details')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.actionButtonSecondary,
                  { backgroundColor: currentTheme.colors.elevation1 },
                ]}
                onPress={onRemoveItem}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="trash-outline"
                  size={22}
                  color={currentTheme.colors.error}
                />
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: currentTheme.colors.error },
                  ]}
                >
                  {t('home.remove')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

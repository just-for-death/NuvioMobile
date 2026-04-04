import React, { useCallback, useImperativeHandle, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../contexts/ThemeContext';
import { useBottomSheetBackHandler } from '../../hooks/useBottomSheetBackHandler';
import { useSettings } from '../../hooks/useSettings';
import { RootStackParamList } from '../../navigation/AppNavigator';

import { ContinueWatchingActionSheet } from './continueWatching/ContinueWatchingActionSheet';
import { ContinueWatchingPosterCard } from './continueWatching/ContinueWatchingPosterCard';
import { ContinueWatchingWideCard } from './continueWatching/ContinueWatchingWideCard';
import { styles } from './continueWatching/styles';
import { ContinueWatchingItem, ContinueWatchingRef } from './continueWatching/types';
import { useContinueWatchingData } from './continueWatching/useContinueWatchingData';
import { useContinueWatchingLayout } from './continueWatching/useContinueWatchingLayout';
import { useContinueWatchingNavigation } from './continueWatching/useContinueWatchingNavigation';

const ContinueWatchingSection = React.forwardRef<ContinueWatchingRef>((_, ref) => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const { onChange, onDismiss } = useBottomSheetBackHandler();

  const actionSheetRef = useRef<BottomSheetModal>(null);
  const [selectedItem, setSelectedItem] = useState<ContinueWatchingItem | null>(null);

  const {
    continueWatchingItems,
    deletingItemId,
    refresh,
    removeItem,
  } = useContinueWatchingData();

  const {
    isTablet,
    isLargeTablet,
    isTV,
    horizontalPadding,
    itemSpacing,
    computedItemWidth,
    computedItemHeight,
    computedPosterWidth,
    computedPosterHeight,
  } = useContinueWatchingLayout();

  const { handleContentPress, navigateToMetadata } = useContinueWatchingNavigation({
    navigation,
    settings,
  });

  useImperativeHandle(ref, () => ({
    refresh,
  }), [refresh]);

  const handleLongPress = useCallback((item: ContinueWatchingItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Ignore haptic failures.
    }

    setSelectedItem(item);
    actionSheetRef.current?.present();
  }, []);

  const handleViewDetails = useCallback(() => {
    if (!selectedItem) return;

    actionSheetRef.current?.dismiss();
    setTimeout(() => {
      navigateToMetadata(selectedItem);
    }, 150);
  }, [navigateToMetadata, selectedItem]);

  const handleRemoveItem = useCallback(async () => {
    if (!selectedItem) return;

    actionSheetRef.current?.dismiss();

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Ignore haptic failures.
    }

    await removeItem(selectedItem);
    setSelectedItem(null);
  }, [removeItem, selectedItem]);

  const renderContinueWatchingItem = useCallback(({ item }: { item: ContinueWatchingItem }) => {
    if (settings.continueWatchingCardStyle === 'poster') {
      return (
        <ContinueWatchingPosterCard
          item={item}
          currentTheme={currentTheme}
          deletingItemId={deletingItemId}
          computedPosterWidth={computedPosterWidth}
          computedPosterHeight={computedPosterHeight}
          isTV={isTV}
          isLargeTablet={isLargeTablet}
          posterBorderRadius={settings.posterBorderRadius ?? 12}
          onPress={handleContentPress}
          onLongPress={handleLongPress}
          t={t}
        />
      );
    }

    return (
      <ContinueWatchingWideCard
        item={item}
        currentTheme={currentTheme}
        deletingItemId={deletingItemId}
        computedItemWidth={computedItemWidth}
        computedItemHeight={computedItemHeight}
        isTV={isTV}
        isLargeTablet={isLargeTablet}
        isTablet={isTablet}
        posterBorderRadius={settings.posterBorderRadius ?? 12}
        onPress={handleContentPress}
        onLongPress={handleLongPress}
        t={t}
      />
    );
  }, [
    computedItemHeight,
    computedItemWidth,
    computedPosterHeight,
    computedPosterWidth,
    currentTheme,
    deletingItemId,
    handleContentPress,
    handleLongPress,
    isLargeTablet,
    isTV,
    isTablet,
    settings.continueWatchingCardStyle,
    settings.posterBorderRadius,
    t,
  ]);

  const keyExtractor = useCallback(
    (item: ContinueWatchingItem) => `continue-${item.id}-${item.type}`,
    []
  );

  const itemSeparator = useCallback(
    () => <View style={{ width: itemSpacing }} />,
    [itemSpacing]
  );

  if (continueWatchingItems.length === 0) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.titleContainer}>
          <Text
            style={[
              styles.title,
              {
                color: currentTheme.colors.text,
                fontSize: isTV ? 32 : isLargeTablet ? 28 : isTablet ? 26 : 24,
              },
            ]}
          >
            {t('home.continue_watching')}
          </Text>
          <View
            style={[
              styles.titleUnderline,
              {
                backgroundColor: currentTheme.colors.primary,
                width: isTV ? 50 : isLargeTablet ? 45 : isTablet ? 40 : 40,
                height: isTV ? 4 : isLargeTablet ? 3.5 : isTablet ? 3 : 3,
              },
            ]}
          />
        </View>
      </View>

      <FlatList
        data={continueWatchingItems}
        renderItem={renderContinueWatchingItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.wideList,
          {
            paddingLeft: horizontalPadding,
            paddingRight: horizontalPadding,
          },
        ]}
        ItemSeparatorComponent={itemSeparator}
        onEndReachedThreshold={0.7}
        onEndReached={() => {}}
        removeClippedSubviews={true}
      />

      <ContinueWatchingActionSheet
        actionSheetRef={actionSheetRef}
        currentTheme={currentTheme}
        insets={insets}
        selectedItem={selectedItem}
        onDismiss={() => {
          setSelectedItem(null);
          onDismiss(actionSheetRef)();
        }}
        onChange={onChange(actionSheetRef)}
        onViewDetails={handleViewDetails}
        onRemoveItem={handleRemoveItem}
      />
    </Animated.View>
  );
});

export default React.memo(ContinueWatchingSection, () => true);

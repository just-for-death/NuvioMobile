import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { NavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../contexts/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { supabaseSyncService, SupabaseUser, RemoteSyncStats } from '../services/supabaseSyncService';
import { useAccount } from '../contexts/AccountContext';
import { useTraktContext } from '../contexts/TraktContext';
import { useSimklContext } from '../contexts/SimklContext';
import { useTranslation } from 'react-i18next';

const SyncSettingsScreen: React.FC = () => {
  const { currentTheme } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { signOut } = useAccount();
  const { isAuthenticated: traktAuthenticated } = useTraktContext();
  const { isAuthenticated: simklAuthenticated } = useSimklContext();

  const [loading, setLoading] = useState(false);
  const [syncCodeLoading, setSyncCodeLoading] = useState(false);
  const [sessionUser, setSessionUser] = useState<SupabaseUser | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [remoteStats, setRemoteStats] = useState<RemoteSyncStats | null>(null);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertActions, setAlertActions] = useState<Array<{ label: string; onPress: () => void; style?: object }>>([]);
  const cloudConfigured = supabaseSyncService.isConfigured();

  const openAlert = useCallback(
    (title: string, message: string, actions?: Array<{ label: string; onPress: () => void; style?: object }>) => {
      setAlertTitle(title);
      setAlertMessage(message);
      setAlertActions(actions && actions.length > 0 ? actions : [{ label: 'OK', onPress: () => { } }]);
      setAlertVisible(true);
    },
    []
  );

  const loadSyncState = useCallback(async () => {
    setLoading(true);
    try {
      await supabaseSyncService.initialize();
      setSessionUser(supabaseSyncService.getCurrentSessionUser());
      const owner = await supabaseSyncService.getEffectiveOwnerId();
      setOwnerId(owner);
      const stats = await supabaseSyncService.getRemoteStats();
      setRemoteStats(stats);
    } catch (error: any) {
      openAlert(t('common.error'), error?.message || t('settings.cloud_sync.auth.not_authenticated'));
    } finally {
      setLoading(false);
    }
  }, [openAlert, t]);

  useFocusEffect(
    useCallback(() => {
      loadSyncState();
    }, [loadSyncState])
  );

  const authLabel = useMemo(() => {
    if (!cloudConfigured) return t('settings.cloud_sync.auth.not_configured');
    if (!sessionUser) return t('settings.cloud_sync.auth.not_authenticated');
    return `${t('settings.cloud_sync.auth.email_session')} ${sessionUser.email ? `(${sessionUser.email})` : ''}`;
  }, [cloudConfigured, sessionUser, t]);

  const statItems = useMemo(() => {
    if (!remoteStats) return [];
    return [
      { label: t('settings.cloud_sync.stats.plugins'), value: remoteStats.plugins },
      { label: t('settings.cloud_sync.stats.addons'), value: remoteStats.addons },
      { label: t('settings.cloud_sync.stats.watch_progress'), value: remoteStats.watchProgress },
      { label: t('settings.cloud_sync.stats.library_items'), value: remoteStats.libraryItems },
      { label: t('settings.cloud_sync.stats.watched_items'), value: remoteStats.watchedItems },
    ];
  }, [remoteStats, t]);
  const isSignedIn = Boolean(sessionUser);
  const externalSyncServices = useMemo(
    () => [
      traktAuthenticated ? 'Trakt' : null,
      simklAuthenticated ? 'Simkl' : null,
    ].filter(Boolean) as string[],
    [traktAuthenticated, simklAuthenticated]
  );
  const externalSyncActive = externalSyncServices.length > 0;

  const handleManualSync = async () => {
    setSyncCodeLoading(true);
    try {
      await supabaseSyncService.pullAllToLocal();
      openAlert(t('settings.cloud_sync.alerts.pull_success_title'), t('settings.cloud_sync.alerts.pull_success_msg'));
      await loadSyncState();
    } catch (error: any) {
      openAlert(t('settings.cloud_sync.alerts.pull_failed_title'), error?.message || t('settings.cloud_sync.alerts.pull_failed_msg'));
    } finally {
      setSyncCodeLoading(false);
    }
  };

  const handleUploadLocalData = async () => {
    setSyncCodeLoading(true);
    try {
      await supabaseSyncService.pushAllLocalData();
      openAlert(t('settings.cloud_sync.alerts.push_success_title'), t('settings.cloud_sync.alerts.push_success_msg'));
      await loadSyncState();
    } catch (error: any) {
      openAlert(t('settings.cloud_sync.alerts.push_failed_title'), error?.message || t('settings.cloud_sync.alerts.push_failed_msg'));
    } finally {
      setSyncCodeLoading(false);
    }
  };

  const handleSignOut = async () => {
    setSyncCodeLoading(true);
    try {
      await signOut();
      await loadSyncState();
    } catch (error: any) {
      openAlert(t('settings.cloud_sync.alerts.sign_out_failed_title'), error?.message || t('settings.cloud_sync.alerts.sign_out_failed'));
    } finally {
      setSyncCodeLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.highEmphasis} />
          <Text style={[styles.backText, { color: currentTheme.colors.highEmphasis }]}>{t('settings.title')}</Text>
        </TouchableOpacity>
        <View style={styles.headerActions} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={currentTheme.colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, isTablet ? styles.contentTablet : null, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.summaryCard, { backgroundColor: currentTheme.colors.elevation1, borderColor: currentTheme.colors.elevation2 }]}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="cloud-done" size={18} color={currentTheme.colors.highEmphasis} />
              <Text style={[styles.cardTitle, { color: currentTheme.colors.highEmphasis }]}>{t('settings.cloud_sync.title')}</Text>
            </View>
            <Text style={[styles.summaryTitle, { color: currentTheme.colors.highEmphasis }]}>{t('settings.cloud_sync.hero_title')}</Text>
            <Text style={[styles.cardText, { color: currentTheme.colors.mediumEmphasis }]}>
              {t('settings.cloud_sync.hero_subtitle')}
            </Text>

            <View style={styles.summaryStack}>
              <View style={[styles.infoRow, { backgroundColor: currentTheme.colors.darkBackground, borderColor: currentTheme.colors.elevation2 }]}>
                <MaterialIcons
                  name={externalSyncActive ? 'info-outline' : 'sync'}
                  size={18}
                  color={currentTheme.colors.highEmphasis}
                />
                <Text style={[styles.infoText, { color: currentTheme.colors.mediumEmphasis }]}>
                  {externalSyncActive
                    ? t('settings.cloud_sync.external_sync.active_msg', {
                      services: externalSyncServices.join(' + ')
                    })
                    : t('settings.cloud_sync.external_sync.inactive_msg')}
                </Text>
              </View>
            </View>

            {!cloudConfigured && (
              <Text style={[styles.warning, { color: '#ffb454' }]}>
                {t('settings.cloud_sync.pre_auth.env_warning')}
              </Text>
            )}
          </View>

          {!isSignedIn ? (
            <View style={[styles.card, styles.preAuthCard, { backgroundColor: currentTheme.colors.elevation1, borderColor: currentTheme.colors.elevation2 }]}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="sync-lock" size={18} color={currentTheme.colors.highEmphasis} />
                <Text style={[styles.cardTitle, { color: currentTheme.colors.highEmphasis }]}>{t('settings.cloud_sync.pre_auth.title')}</Text>
              </View>
              <Text style={[styles.cardText, { color: currentTheme.colors.mediumEmphasis }]}>
                {t('settings.cloud_sync.pre_auth.description')}
              </Text>
              <View style={styles.preAuthList}>
                <Text style={[styles.preAuthItem, { color: currentTheme.colors.mediumEmphasis }]}>{t('settings.cloud_sync.pre_auth.point_1')}</Text>
                <Text style={[styles.preAuthItem, { color: currentTheme.colors.mediumEmphasis }]}>{t('settings.cloud_sync.pre_auth.point_2')}</Text>
              </View>
              <TouchableOpacity
                style={[styles.button, styles.fullWidthButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => navigation.navigate('Account')}
              >
                <Text style={styles.buttonText}>{t('settings.cloud_sync.actions.sign_in_up')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.sectionGrid, isTablet ? styles.sectionGridTablet : null]}>
                <View style={[styles.card, styles.gridCard, { backgroundColor: currentTheme.colors.elevation1, borderColor: currentTheme.colors.elevation2 }]}>
                  <View style={styles.sectionHeader}>
                    <MaterialIcons name="person-outline" size={18} color={currentTheme.colors.highEmphasis} />
                    <Text style={[styles.cardTitle, { color: currentTheme.colors.highEmphasis }]}>{t('settings.cloud_sync.auth.account')}</Text>
                  </View>
                  <Text style={[styles.cardText, { color: currentTheme.colors.mediumEmphasis }]}>{authLabel}</Text>
                  <Text style={[styles.cardText, { color: currentTheme.colors.mediumEmphasis }]}>
                    {t('settings.cloud_sync.auth.effective_owner', { id: ownerId || 'Unavailable' })}
                  </Text>
                  <View style={[styles.buttonRow, isTablet ? styles.buttonRowTablet : styles.buttonColumn]}>
                    <TouchableOpacity
                      style={[styles.button, isTablet && styles.buttonFlex, { backgroundColor: currentTheme.colors.primary }]}
                      onPress={() => navigation.navigate('AccountManage')}
                    >
                      <Text style={styles.buttonText}>{t('settings.cloud_sync.actions.manage_account')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={syncCodeLoading}
                      style={[
                        styles.button,
                        isTablet && styles.buttonFlex,
                        { backgroundColor: currentTheme.colors.elevation2 },
                        syncCodeLoading && styles.buttonDisabled,
                      ]}
                      onPress={handleSignOut}
                    >
                      <Text style={styles.buttonText}>{t('settings.cloud_sync.actions.sign_out')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.card, styles.gridCard, { backgroundColor: currentTheme.colors.elevation1, borderColor: currentTheme.colors.elevation2 }]}>
                  <View style={styles.sectionHeader}>
                    <MaterialIcons name="sync" size={18} color={currentTheme.colors.highEmphasis} />
                    <Text style={[styles.cardTitle, { color: currentTheme.colors.highEmphasis }]}>{t('settings.cloud_sync.actions.title')}</Text>
                  </View>
                  <Text style={[styles.cardText, { color: currentTheme.colors.mediumEmphasis }]}>
                    {t('settings.cloud_sync.actions.description')}
                  </Text>
                  <View style={styles.buttonColumn}>
                    <TouchableOpacity
                      disabled={syncCodeLoading || !cloudConfigured}
                      style={[
                        styles.button,
                        styles.primaryButton,
                        { backgroundColor: currentTheme.colors.primary },
                        (syncCodeLoading || !cloudConfigured) && styles.buttonDisabled,
                      ]}
                      onPress={handleManualSync}
                    >
                      {syncCodeLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>{t('settings.cloud_sync.actions.pull_btn')}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={syncCodeLoading || !cloudConfigured}
                      style={[
                        styles.button,
                        styles.secondaryButton,
                        { backgroundColor: currentTheme.colors.elevation2, borderColor: currentTheme.colors.elevation2 },
                        (syncCodeLoading || !cloudConfigured) && styles.buttonDisabled,
                      ]}
                      onPress={handleUploadLocalData}
                    >
                      <Text style={styles.buttonText}>{t('settings.cloud_sync.actions.push_btn')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: currentTheme.colors.elevation1, borderColor: currentTheme.colors.elevation2 }]}>
                <View style={styles.sectionHeader}>
                  <MaterialIcons name="storage" size={18} color={currentTheme.colors.highEmphasis} />
                  <Text style={[styles.cardTitle, { color: currentTheme.colors.highEmphasis }]}>{t('settings.cloud_sync.stats.title')}</Text>
                </View>
                {!remoteStats ? (
                  <Text style={[styles.cardText, { color: currentTheme.colors.mediumEmphasis }]}>
                    {t('settings.cloud_sync.stats.signin_required')}
                  </Text>
                ) : (
                  <View style={styles.statsGrid}>
                    {statItems.map((item) => (
                      <View
                        key={item.label}
                        style={[styles.statTile, { backgroundColor: currentTheme.colors.darkBackground, borderColor: currentTheme.colors.elevation2 }]}
                      >
                        <Text style={[styles.statValue, { color: currentTheme.colors.highEmphasis }]}>{item.value}</Text>
                        <Text style={[styles.statLabel, { color: currentTheme.colors.mediumEmphasis }]}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        actions={alertActions}
        onClose={() => setAlertVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  backText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  headerActions: {
    minWidth: 32,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  contentTablet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 980,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  summaryTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  preAuthCard: {
    gap: 12,
  },
  sectionGrid: {
    gap: 14,
  },
  sectionGridTablet: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  gridCard: {
    flex: 1,
  },
  preAuthList: {
    gap: 6,
    marginTop: 2,
  },
  preAuthItem: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardText: {
    fontSize: 13,
    lineHeight: 18,
  },
  summaryStack: {
    gap: 10,
  },
  infoRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    fontSize: 12,
    lineHeight: 18,
  },
  statsGrid: {
    marginTop: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statTile: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  buttonRowTablet: {
    flexDirection: 'row',
  },
  buttonColumn: {
    flexDirection: 'column',
    gap: 10,
  },
  button: {
    borderRadius: 10,
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  buttonFlex: {
    flex: 1,
  },
  fullWidthButton: {
    width: '100%',
  },
  primaryButton: {
    borderWidth: 0,
  },
  secondaryButton: {
    borderWidth: 1,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default SyncSettingsScreen;

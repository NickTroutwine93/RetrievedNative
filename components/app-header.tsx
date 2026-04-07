import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { auth, db } from '@/src/services/firebaseClient';
import { getUserData, UserRole } from '@/src/services/userService';

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const headerBackground = useThemeColor({}, 'primary');
  const avatarBackground = useThemeColor({}, 'primaryStrong');
  const dropdownBackground = useThemeColor({}, 'surface');
  const dropdownBorder = useThemeColor({}, 'border');
  const dropdownNameColor = useThemeColor({}, 'text');
  const dropdownSecondaryTextColor = useThemeColor({}, 'textSecondary');
  const dangerColor = useThemeColor({}, 'danger');
  const overlayColor = useThemeColor({}, 'overlay');
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');
  const [avatarInitial, setAvatarInitial] = useState('U');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUserName('User');
        setUserEmail('');
        setAvatarInitial('U');
        setIsAdmin(false);
        return;
      }

      const email = firebaseUser.email || '';
      setUserEmail(email);

      try {
        const account = email ? await getUserData(db, email) : null;
        const accountRecord = (account || {}) as Record<string, any>;
        const firstName = accountRecord.firstName ?? accountRecord.FirstName ?? '';
        const lastName = accountRecord.lastName ?? accountRecord.LastName ?? '';
        const accountRole = Number(accountRecord.role ?? accountRecord.Role ?? UserRole.USER);
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        setUserName(fullName || 'User');
        setAvatarInitial((firstName?.[0] || email?.[0] || 'U').toUpperCase());
        setIsAdmin(accountRole === UserRole.ADMIN);
      } catch {
        setUserName('User');
        setAvatarInitial((email?.[0] || 'U').toUpperCase());
        setIsAdmin(false);
      }
    });

    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    setDropdownVisible(false);
    await signOut(auth);
    router.replace('/auth' as any);
  };

  return (
    <>
      <View style={[styles.appHeader, { backgroundColor: headerBackground, paddingTop: Math.max(insets.top, 8) }]}>
        <ThemedText style={styles.logoText}>Retrieved</ThemedText>
        <TouchableOpacity
          style={[styles.avatarCircle, { backgroundColor: avatarBackground }]}
          onPress={() => setDropdownVisible((v) => !v)}
          activeOpacity={0.8}>
          <ThemedText style={styles.avatarText}>{avatarInitial}</ThemedText>
        </TouchableOpacity>
      </View>

      <Modal
        transparent
        visible={dropdownVisible}
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}>
        <Pressable style={[styles.dropdownBackdrop, { backgroundColor: overlayColor }]} onPress={() => setDropdownVisible(false)}>
          <View style={[styles.dropdownPanel, { backgroundColor: dropdownBackground, borderColor: dropdownBorder }]}>
            <Pressable>
              <ThemedText style={[styles.dropdownName, { color: dropdownNameColor }]} numberOfLines={1}>{userName}</ThemedText>
              {isAdmin ? (
                <View style={styles.adminBadgeRow}>
                  <View style={styles.adminBadgeDot} />
                  <ThemedText style={styles.adminBadgeText}>Admin</ThemedText>
                </View>
              ) : null}
              <ThemedText style={[styles.dropdownEmail, { color: dropdownSecondaryTextColor }]} numberOfLines={1}>{userEmail}</ThemedText>
              <View style={[styles.dropdownDivider, { backgroundColor: dropdownBorder }]} />
              <TouchableOpacity style={[styles.dropdownLogoutBtn, { backgroundColor: dangerColor }]} onPress={handleLogout}>
                <ThemedText style={styles.dropdownLogoutText}>Log Out</ThemedText>
              </TouchableOpacity>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  appHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  dropdownBackdrop: {
    flex: 1,
  },
  dropdownPanel: {
    position: 'absolute',
    top: 62,
    right: 14,
    minWidth: 210,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  dropdownEmail: {
    fontSize: 12,
    marginBottom: 10,
  },
  adminBadgeRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4E8C1',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  adminBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8A5D00',
    marginRight: 6,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B4700',
  },
  dropdownDivider: {
    height: 1,
    marginBottom: 10,
  },
  dropdownLogoutBtn: {
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  dropdownLogoutText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

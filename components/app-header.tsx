import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { auth, db } from '@/src/services/firebaseClient';
import { getUserData } from '@/src/services/userService';

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');
  const [avatarInitial, setAvatarInitial] = useState('U');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUserName('User');
        setUserEmail('');
        setAvatarInitial('U');
        return;
      }

      const email = firebaseUser.email || '';
      setUserEmail(email);

      try {
        const account = email ? await getUserData(db, email) : null;
        const accountRecord = (account || {}) as Record<string, any>;
        const firstName = accountRecord.firstName ?? accountRecord.FirstName ?? '';
        const lastName = accountRecord.lastName ?? accountRecord.LastName ?? '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        setUserName(fullName || 'User');
        setAvatarInitial((firstName?.[0] || email?.[0] || 'U').toUpperCase());
      } catch {
        setUserName('User');
        setAvatarInitial((email?.[0] || 'U').toUpperCase());
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
      <View style={[styles.appHeader, { paddingTop: Math.max(insets.top, 8) }]}>
        <ThemedText style={styles.logoText}>Retrieved</ThemedText>
        <TouchableOpacity
          style={styles.avatarCircle}
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
        <Pressable style={styles.dropdownBackdrop} onPress={() => setDropdownVisible(false)}>
          <View style={styles.dropdownPanel}>
            <Pressable>
              <ThemedText style={styles.dropdownName} numberOfLines={1}>{userName}</ThemedText>
              <ThemedText style={styles.dropdownEmail} numberOfLines={1}>{userEmail}</ThemedText>
              <View style={styles.dropdownDivider} />
              <TouchableOpacity style={styles.dropdownLogoutBtn} onPress={handleLogout}>
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
    backgroundColor: '#0076C0',
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
    width: 38,
    height: 38,
    backgroundColor: '#003E7A',
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  dropdownPanel: {
    position: 'absolute',
    top: 62,
    right: 14,
    minWidth: 210,
    backgroundColor: '#FFF8ED',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D2BFA3',
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
    color: '#3E2010',
    marginBottom: 2,
  },
  dropdownEmail: {
    fontSize: 12,
    color: '#7B6A58',
    marginBottom: 10,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#D2BFA3',
    marginBottom: 10,
  },
  dropdownLogoutBtn: {
    backgroundColor: '#9B1C1C',
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

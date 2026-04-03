import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from '@/src/services/firebaseClient';

export default function EntryGate() {
  const [loading, setLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsVerified(false);
        setLoading(false);
        return;
      }

      await user.reload();
      setIsVerified(user.emailVerified);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isVerified) {
    return <Redirect href={('/auth' as any)} />;
  }

  return <Redirect href={('/(tabs)' as any)} />;
}

import { Redirect } from 'expo-router';

// Route slot reserved for Phase 3 (reward disclaimer / terms acceptance modal).
// Redirect home until that feature is implemented.
export default function ModalScreen() {
  return <Redirect href={'/(tabs)' as any} />;
}

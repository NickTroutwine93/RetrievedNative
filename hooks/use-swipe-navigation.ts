import { useCallback, useRef } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS } from 'react-native-reanimated';
import { useNavigation, useRoute } from '@react-navigation/native';

type TabName = 'index' | 'searches' | 'map' | 'notifications';

const TAB_ORDER: TabName[] = ['index', 'searches', 'map', 'notifications'];

export const useSwipeNavigation = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const currentTabIndex = TAB_ORDER.indexOf(route.name as TabName);
  const startX = useRef(0);

  const navigateToTab = useCallback(
    (tabName: TabName) => {
      (navigation as any).navigate(tabName);
    },
    [navigation]
  );

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      let nextIndex: number;

      if (direction === 'left') {
        // Swiping left moves to next tab
        nextIndex = Math.min(currentTabIndex + 1, TAB_ORDER.length - 1);
      } else {
        // Swiping right moves to previous tab
        nextIndex = Math.max(currentTabIndex - 1, 0);
      }

      if (nextIndex !== currentTabIndex) {
        navigateToTab(TAB_ORDER[nextIndex]);
      }
    },
    [currentTabIndex, navigateToTab]
  );

  const gesture = Gesture.Pan()
    .onStart(() => {
      startX.current = 0;
    })
    .onUpdate((event) => {
      if (startX.current === 0) {
        startX.current = event.absoluteX;
      }
    })
    .onEnd((event) => {
      const deltaX = event.absoluteX - startX.current;
      const threshold = 50; // minimum swipe distance in pixels

      if (Math.abs(deltaX) > threshold) {
        const direction = deltaX > 0 ? 'right' : 'left';
        runOnJS(handleSwipe)(direction);
      }
    });

  return { gesture, navigateToTab };
};

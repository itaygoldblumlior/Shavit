// Native-first touches for the iPhone app. On the web every function is a no-op.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

export const isApp = Capacitor.isNativePlatform();
const quietly = (promise) => promise?.catch?.(() => {});

/** A light tap: ticking a set or a task. */
export const tapFeel = () => isApp && quietly(Haptics.impact({ style: ImpactStyle.Light }));
/** A success buzz: finishing a workout. */
export const successFeel = () =>
  isApp && quietly(Haptics.notification({ type: NotificationType.Success }));
/** A tick: changing a choice, like a theme. */
export const selectFeel = () => isApp && quietly(Haptics.selectionChanged());

/** Status bar text: dark on the light Paper theme, light everywhere else. */
export function nativeTheme(theme) {
  if (!isApp) return;
  quietly(StatusBar.setStyle({ style: theme === 'paper' ? Style.Light : Style.Dark }));
}
export function hideSplash() {
  if (isApp) quietly(SplashScreen.hide({ fadeOutDuration: 200 }));
}

/**
 * iPhone-style "swipe from the left edge to go back". When a screen has a
 * back button (class "back"), a swipe that starts within 24px of the left
 * edge and travels 80px to the right presses it.
 */
export function enableEdgeSwipeBack(root = document) {
  if (!isApp) return;
  let start = null;
  root.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      start = t.clientX <= 24 ? { x: t.clientX, y: t.clientY } : null;
    },
    { passive: true },
  );
  root.addEventListener(
    'touchend',
    (e) => {
      if (!start) return;
      const t = e.changedTouches[0],
        dx = t.clientX - start.x,
        dy = Math.abs(t.clientY - start.y);
      start = null;
      if (dx > 80 && dy < 60 && !document.querySelector('dialog[open]')) {
        const back = document.querySelector('.back');
        if (back) {
          tapFeel();
          back.click();
        }
      }
    },
    { passive: true },
  );
}

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';

export interface PlayIntegrityBridgeResult {
  supported: boolean;
  token?: string;
}

export interface NativeLifecycleHandlers {
  onPause: () => void;
  onResume: () => void;
  onBackButton: () => boolean; // return true if handled by closing an open modal/sheet
}

/**
 * Unified native bridge for Capacitor Android + graceful PWA web fallback.
 * Handles:
 *  - App lifecycle (pause -> immediate atomic save, resume -> offline earnings calculation)
 *  - Hardware back button modal stack
 *  - Portrait orientation lock & edge-to-edge bright sky status bar
 *  - Optional tactile haptics
 *  - Google Play Integrity attestation hook for verified Android competitive leaderboards
 */
export class CapacitorBridge {
  private hapticsEnabled = true;
  private initialized = false;

  isNativeAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  async init(handlers: NativeLifecycleHandlers): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Web & PWA visibility lifecycle
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) handlers.onPause();
        else handlers.onResume();
      });
      window.addEventListener('pagehide', () => handlers.onPause());
    }

    // Lock screen orientation to portrait where supported
    try {
      const orientation = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
      if (orientation?.lock) {
        await orientation.lock('portrait').catch(() => {});
      }
    } catch {
      // Ignore unsupported desktop browsers
    }

    if (!Capacitor.isNativePlatform()) return;

    try {
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#5CC8FF' });
    } catch {
      // Safe no-op if unavailable
    }

    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handlers.onResume();
      else handlers.onPause();
    });

    await App.addListener('backButton', ({ canGoBack }) => {
      const handled = handlers.onBackButton();
      if (!handled && !canGoBack) {
        handlers.onPause();
        void App.minimizeApp().catch(() => {});
      }
    });
  }

  async impact(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
    if (!this.hapticsEnabled) return;
    if (Capacitor.isNativePlatform()) {
      const mapped =
        style === 'heavy'
          ? ImpactStyle.Heavy
          : style === 'medium'
            ? ImpactStyle.Medium
            : ImpactStyle.Light;
      await Haptics.impact({ style: mapped }).catch(() => {});
      return;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(style === 'heavy' ? 24 : style === 'medium' ? 14 : 8);
      } catch {
        // Ignore browser vibration restrictions
      }
    }
  }

  /**
   * Native Google Play Integrity integration point for Android builds.
   * When paired with a custom Capacitor Play Integrity plugin on Android, requests
   * a signed integrity verdict bound to the server's challengeNonce.
   */
  async requestPlayIntegrityToken(challengeNonce: string): Promise<PlayIntegrityBridgeResult> {
    if (!this.isNativeAndroid()) {
      return { supported: false };
    }
    const nativePlugin = (
      window as unknown as {
        Capacitor?: {
          Plugins?: {
            PlayIntegrity?: { requestToken: (opts: { nonce: string }) => Promise<{ token: string }> };
          };
        };
      }
    ).Capacitor?.Plugins?.PlayIntegrity;

    if (!nativePlugin) {
      return { supported: false };
    }
    try {
      const res = await nativePlugin.requestToken({ nonce: challengeNonce });
      return { supported: true, token: res.token };
    } catch {
      return { supported: true };
    }
  }
}

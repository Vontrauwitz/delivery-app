import { Platform, Share } from 'react-native';

// Native (iOS/Android): the OS share sheet — WhatsApp/SMS/Messages/etc. are whatever the user has
// installed and picks themselves; nothing here targets a specific app. Web: the Web Share API
// where the browser offers one, otherwise falling back to clipboard — a reasonable "still useful"
// outcome rather than a dead end. Never marks the ticket SENT itself: opening the share sheet is
// not a confirmed-delivery signal (native share sheets generally don't report whether the user
// actually completed a send), so that stays an explicit separate manager action.
export async function shareReplenishmentTicket(text) {
  if (Platform.OS === 'web') {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return { method: 'web-share' };
      } catch (err) {
        if (err && err.name === 'AbortError') {
          return { method: 'web-share', cancelled: true };
        }
        throw err;
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return { method: 'clipboard' };
    }

    throw new Error('Compartir no está disponible en este navegador');
  }

  const result = await Share.share({ message: text });
  if (result.action === Share.dismissedAction) {
    return { method: 'native-share', cancelled: true };
  }
  return { method: 'native-share' };
}

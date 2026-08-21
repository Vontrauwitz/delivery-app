import * as Linking from 'expo-linking';

export async function openInMaps(url) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch (err) {
    // Nothing sensible to do if the platform can't open it — the link itself is still shown.
  }
}

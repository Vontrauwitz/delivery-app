import { useState } from 'react';
import { Platform, View, Text, Pressable, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { neoColors, neoSpacing, neoRadii } from './neoTheme';

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDisplay(mode, value) {
  if (mode === 'date') {
    return value.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return value.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Cross-platform date/time input — the one thing every ScheduledShift/exception form in the app
// should use instead of a raw ISO-string TextInput. Web renders a native <input type="date"|
// "time">; iOS/Android render the community DateTimePicker behind a tappable field, matching
// each platform's own picker UX rather than a custom-built one.
//
// `value`/`onChange` always deal in full Date objects — for mode="time" only the hours/minutes
// of the edited Date change, the caller decides what to do with the date portion (see
// admin/schedule.js, which keeps one shared calendar date and two time-of-day Dates).
export default function DateTimeField({ mode, value, onChange, style }) {
  if (Platform.OS === 'web') {
    return <WebField mode={mode} value={value} onChange={onChange} style={style} />;
  }
  return <NativeField mode={mode} value={value} onChange={onChange} style={style} />;
}

function WebField({ mode, value, onChange, style }) {
  const inputValue =
    mode === 'date'
      ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
      : `${pad(value.getHours())}:${pad(value.getMinutes())}`;

  function handleChange(e) {
    const raw = e.target.value;
    if (!raw) return;
    const next = new Date(value);
    if (mode === 'date') {
      const [y, m, d] = raw.split('-').map(Number);
      if (!y || !m || !d) return;
      next.setFullYear(y, m - 1, d);
    } else {
      const [h, min] = raw.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(min)) return;
      next.setHours(h, min, 0, 0);
    }
    onChange(next);
  }

  return <input type={mode} value={inputValue} onChange={handleChange} style={{ ...webInputStyle, ...style }} />;
}

function NativeField({ mode, value, onChange, style }) {
  const [show, setShow] = useState(false);

  function handleChange(event, selected) {
    // Android's picker is a one-shot dialog — close it as soon as it reports back, whether the
    // user picked a value or dismissed it. iOS's default display keeps its own popover open
    // until the field is tapped again, so it does not need to be force-closed here.
    if (Platform.OS === 'android') setShow(false);
    if (event.type === 'dismissed') return;
    if (selected) onChange(selected);
  }

  return (
    <View>
      <Pressable style={[styles.nativeField, style]} onPress={() => setShow(true)}>
        <Text style={styles.nativeFieldText}>{formatDisplay(mode, value)}</Text>
      </Pressable>
      {show && <DateTimePicker value={value} mode={mode} display="default" onChange={handleChange} />}
    </View>
  );
}

const webInputStyle = {
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: neoColors.ink,
  borderRadius: `${neoRadii.md}px`,
  paddingTop: `${neoSpacing.md}px`,
  paddingBottom: `${neoSpacing.md}px`,
  paddingLeft: `${neoSpacing.md}px`,
  paddingRight: `${neoSpacing.md}px`,
  fontSize: '14px',
  fontWeight: '600',
  backgroundColor: neoColors.surface,
  color: neoColors.ink,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};

const styles = StyleSheet.create({
  nativeField: {
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.md,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.md,
    backgroundColor: neoColors.surface,
  },
  nativeFieldText: { fontSize: 15, fontWeight: '600', color: neoColors.ink },
});

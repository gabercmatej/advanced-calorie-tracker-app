import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/types';

/**
 * One turn in the Ask transcript. The user's own words sit right and tinted;
 * answers sit left on a plain surface, because they're the thing being read.
 */
export function ChatBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: theme.tintSoft, borderColor: theme.tint }
            : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        {/* `text` in both bubbles — emerald on the tinted fill is ~3:1, below
            the 4.5:1 floor. The fill and border already signal authorship. */}
        <ThemedText
          type="small"
          accessibilityLabel={`${isUser ? 'You asked' : 'Answer'}: ${message.text}`}>
          {message.text}
        </ThemedText>
      </View>
    </View>
  );
}

/** Three-dot placeholder while an answer is in flight. */
export function ChatPending() {
  const theme = useTheme();
  return (
    <View style={[styles.row, styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <ThemedText type="small" themeColor="textSecondary" accessibilityLabel="Thinking">
          Thinking…
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

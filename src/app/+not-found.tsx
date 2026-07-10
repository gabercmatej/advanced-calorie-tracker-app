import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export default function NotFoundScreen() {
  const theme = useTheme();
  return (
    <Screen title="Not found">
      <ThemedText type="default" themeColor="textSecondary">
        This screen doesn’t exist.
      </ThemedText>
      <Link href="/" style={[styles.link, { color: theme.tint }]}>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          Go to Today
        </ThemedText>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: {
    marginTop: 8,
  },
});

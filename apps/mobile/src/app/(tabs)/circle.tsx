import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function Circle() {
  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.title}>司机圈</Text>
      <Text>暂无动态</Text>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF', padding: 24, gap: 24 },
  title: { fontSize: 28, fontWeight: '700' },
});

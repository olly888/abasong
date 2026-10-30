import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function Profile() { return <SafeAreaView style={styles.page}><Text style={styles.title}>我的</Text><Text>尚未登录</Text></SafeAreaView>; }
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#FFFFFF', padding: 24, gap: 24 }, title: { fontSize: 28, fontWeight: '700' } });

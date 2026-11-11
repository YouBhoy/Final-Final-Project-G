import { useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_PRIVACY_POLICY } from '../../security/policy-default';
import { lightColors } from '@spartan-g/shared-ui';

export type LoginLegalDocumentKind = 'privacy' | 'terms';

/** Public, bundled copy only. Does not read Firebase or create agreement records. */
export function LoginLegalDocument({ document, onClose }: { document: LoginLegalDocumentKind | null; onClose(): void }) {
  const close = useRef<View>(null);
  const privacy = document === 'privacy';
  return <Modal visible={document !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} onShow={() => {
    const handle = findNodeHandle(close.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }}>
    <SafeAreaView style={styles.screen} accessibilityViewIsModal>
      <View style={styles.header}>
        <View style={styles.heading}><Text style={styles.brand}>SPARTAN-G</Text><Text accessibilityRole="header" style={styles.title}>{privacy ? DEFAULT_PRIVACY_POLICY.title : 'Terms of Use'}</Text></View>
        <Pressable ref={close} testID="login-document-close" accessibilityRole="button" accessibilityLabel={privacy ? 'Close Privacy Policy' : 'Close Terms of Use information'} onPress={onClose} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      <ScrollView key={document} testID="login-document-scroll" contentContainerStyle={styles.content}>
        {privacy ? <>
          <Text style={styles.caption}>Bundled policy · version {DEFAULT_PRIVACY_POLICY.version}. The current portal policy is verified after sign-in; changes require a new review.</Text>
          <Text testID="login-privacy-body" selectable style={styles.body}>{DEFAULT_PRIVACY_POLICY.body}</Text>
        </> : <>
          <Text accessibilityRole="header" style={styles.noticeTitle}>Pending approval</Text>
          <Text selectable style={styles.body}>Terms of Use have not yet been approved. They are not part of this sign-in agreement, and you can sign in without accepting them. This link will show the approved document when it is available.</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: lightColors.border },
  heading: { flex: 1, gap: 5 }, brand: { color: lightColors.primary, fontWeight: '800', fontSize: 12, letterSpacing: 2 },
  title: { color: lightColors.text, fontWeight: '700', fontSize: 23 },
  close: { minWidth: 64, minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF1F3' },
  closeText: { color: lightColors.primary, fontWeight: '700', fontSize: 15 },
  content: { padding: 24, gap: 20, width: '100%', maxWidth: 680, alignSelf: 'center', paddingBottom: 40 },
  caption: { fontSize: 13, lineHeight: 20, color: lightColors.textSecondary },
  body: { fontSize: 16, lineHeight: 26, color: lightColors.text },
  noticeTitle: { color: lightColors.primary, fontSize: 18, fontWeight: '700' },
});

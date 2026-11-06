import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@spartan-g/shared-services';
import type { StudentMobileTabParamList } from '@spartan-g/shared-types';
import { StudentPageBackground, StudentPageHeader, StudentPageNotice, StudentSearchField, studentPageColors as c } from '../../components/StudentPageDesign';
import { appLock, currentLockActor, useAppLock } from '../../security/app-lock';
import { filterResources, guidanceServices, inspiration, offlineGuides, resourceCategories, safeResourceUrl, type StudentResource } from './resources-model';
import { readStudentResources } from './resources-reader';

export function ResourcesScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<StudentMobileTabParamList>>(), focused = useIsFocused(), lock = useAppLock();
  const session = useAuthStore(s => s.session), status = useAuthStore(s => s.status), { width } = useWindowDimensions();
  const [library, setLibrary] = useState<{ session: unknown; rows: StudentResource[] }>({ session: null, rows: [] }), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(''), [category, setCategory] = useState<typeof resourceCategories[number]>('all'), [expanded, setExpanded] = useState<string | null>(null), [attempt, setAttempt] = useState(0);
  const live = useRef(false), request = useRef(0);
  const owner = status === 'authenticated' && session?.role === 'student' ? session.uid : null;
  live.current = focused && !!owner;
  const authorized = () => {
    const auth = useAuthStore.getState(), actor = currentLockActor(), state = appLock.getSnapshot();
    return live.current && AppState.currentState === 'active' && auth.status === 'authenticated' && auth.session === session && auth.session?.uid === owner && auth.session.role === 'student'
      && !!actor && actor.owner === state.owner && actor.session === session && actor.session === state.session && state.phase === 'ready' && !state.background;
  };
  useEffect(() => {
    const revision = ++request.current; let alive = true;
    setLibrary({ session: null, rows: [] }); setError(null); setLoading(false);
    if (!authorized()) return;
    setLoading(true);
    const timer = setTimeout(() => { if (alive && revision === request.current) { alive = false; setLoading(false); setError('The published library is taking too long to respond. Offline guides remain available.'); } }, 10_000);
    void readStudentResources(authorized).then(data => { if (alive && revision === request.current && authorized()) setLibrary({ session, rows: data }); }).catch(() => {
      if (alive && revision === request.current && authorized()) setError('The published library is unavailable. It may require a connection or existing access permission. Offline guides remain available.');
    }).finally(() => { clearTimeout(timer); if (alive && revision === request.current) setLoading(false); });
    return () => { alive = false; clearTimeout(timer); };
  }, [owner, session, focused, lock.phase, lock.background, attempt]);
  useEffect(() => () => { live.current = false; request.current++; }, []);
  const open = (value: string, title: string) => {
    const url = safeResourceUrl(value); if (!url || !authorized()) return;
    Alert.alert('Open external resource?', `${title}\n\nOpens ${new URL(url).hostname} outside Spartan-G. No account credentials are attached.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Open', onPress: () => {
      if (!authorized()) return;
      void Linking.openURL(url).catch(() => { if (authorized()) Alert.alert('Resource unavailable', 'No compatible app could open this link. Check your connection and try again.'); });
    } }]);
  };
  if (!owner) return null;
  const rows = library.session === session ? library.rows : [];
  const visible = filterResources(rows, search, category), term = search.trim().toLowerCase();
  const guides = offlineGuides.filter(g => (category === 'all' || category === 'guide') && (!term || [g.title, g.topic, g.description, ...g.steps].join(' ').toLowerCase().includes(term)));
  const services = guidanceServices.filter(g => !term || `${g.title} ${g.description}`.toLowerCase().includes(term));
  return <View testID="student-resources" style={s.screen}><StudentPageBackground /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <StudentPageHeader title="Resources" subtitle="Take a moment for yourself. Learn, reflect and find your next step." />
    <View style={[s.body, { maxWidth: 760, alignSelf: 'center', width: '100%' }]}>
      <View style={s.search}><StudentSearchField value={search} onChangeText={setSearch} placeholder="Search resources, guides, services..." label="Search resources" /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{resourceCategories.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} accessibilityLabel={`Filter ${item} resources`} onPress={() => setCategory(item)} style={[s.chip, category === item && s.selected]}><Text style={[s.chipText, category === item && s.selectedText]}>{item === 'all' ? 'All resources' : item[0].toUpperCase() + item.slice(1) + 's'}</Text></Pressable>)}</ScrollView>
      <View style={s.sectionHeading}><Feather name="book-open" color={c.crimson} size={22} /><Text accessibilityRole="header" style={s.heading}>Everyday guides</Text><Text style={s.offline}>OFFLINE</Text></View>
      <Text style={s.copy}>General educational guidance, available on your phone. These guides support learning and do not replace individual professional care.</Text>
      {guides.map(guide => <View key={guide.id} style={s.card}>
        <Pressable testID={`guide-${guide.id}`} accessibilityRole="button" accessibilityState={{ expanded: expanded === guide.id }} accessibilityLabel={`${guide.title}. ${expanded === guide.id ? 'Close' : 'Read'} guide`} onPress={() => setExpanded(expanded === guide.id ? null : guide.id)} style={s.cardRow}>
          <View style={s.icon}><Feather name={guide.icon} color={c.crimson} size={24} /></View><View style={s.flex}><Text style={s.eyebrow}>{guide.topic}</Text><Text style={s.title}>{guide.title}</Text><Text style={s.copy}>{guide.description}</Text></View><Feather name={expanded === guide.id ? 'chevron-up' : 'chevron-down'} color={c.slate} size={20} />
        </Pressable>
        {expanded === guide.id && <View testID={`guide-body-${guide.id}`} style={s.steps}>{guide.steps.map((step, index) => <Text key={step} style={s.step}>{index + 1}. {step}</Text>)}</View>}
      </View>)}
      {!guides.length && <Text style={s.copy}>No offline guides match this filter.</Text>}
      <View style={s.sectionHeading}><Feather name="play-circle" color={c.crimson} size={22} /><Text accessibilityRole="header" style={s.heading}>Published library</Text></View>
      <Text style={s.copy}>Student materials from the website’s Resources library, including videos and uploaded files when published and accessible. External resources open only with your permission.</Text>
      {loading ? <StudentPageNotice loading title="Loading published resources" /> : error ? <StudentPageNotice title="Published library unavailable" message={error} onRetry={() => setAttempt(x => x + 1)} /> : !visible.length ? <StudentPageNotice title={rows.length ? 'No matching resources' : 'No published resources available'} message="Try another filter or use the offline guides. No uploaded videos are claimed until the library returns them." /> : visible.map(row => <View key={row.id} style={s.card}>
        {row.category === 'video' && <View testID={`video-preview-${row.id}`} accessible accessibilityLabel={`Video: ${row.title}. External playback.`} style={s.video}><Feather name="play-circle" color={c.crimson} size={48} /><Text style={s.videoLabel}>VIDEO · EXTERNAL PLAYBACK</Text></View>}
        <View style={s.resourceBody}><Text style={s.eyebrow}>{row.category.toUpperCase()}</Text><Text style={s.title}>{row.title}</Text>{!!row.description && <Text style={s.copy}>{row.description}</Text>}
          <View style={s.actions}>{row.url && <Pressable accessibilityRole="link" style={s.action} onPress={() => open(row.url!, row.title)}><Text style={s.actionText}>{row.category === 'video' ? 'Watch video' : 'Open resource'} ↗</Text></Pressable>}{row.fileUrl && row.fileUrl !== row.url && <Pressable accessibilityRole="link" style={s.action} onPress={() => open(row.fileUrl!, row.title)}><Text style={s.actionText}>Open uploaded file ↗</Text></Pressable>}{!row.url && !row.fileUrl && <Text style={s.copy}>No supported link is available for this item.</Text>}</View>
        </View>
      </View>)}
      {(search || category !== 'all') && <Pressable style={s.action} accessibilityRole="button" onPress={() => { setSearch(''); setCategory('all'); }}><Text style={s.actionText}>Clear filters</Text></Pressable>}
      {!term && <View style={s.inspiration}><Feather name="sun" size={26} color={c.crimson} /><Text accessibilityRole="header" style={s.heading}>A little encouragement</Text>{inspiration.map(line => <Text key={line} style={s.quote}>{line}</Text>)}</View>}
      <View style={s.sectionHeading}><Feather name="compass" color={c.crimson} size={22} /><Text accessibilityRole="header" style={s.heading}>Guidance Office services</Text></View>
      <Text style={s.copy}>Learn about six areas of support. Ask your campus Guidance Office about its current services and arrangements; availability is not guaranteed by this page.</Text>
      <View style={s.serviceGrid}>{services.map(service => <View key={service.title} style={[s.service, { width: width >= 540 ? '48%' : '100%' }]}><View style={s.icon}><Feather name={service.icon} color={c.crimson} size={24} /></View><Text style={s.title}>{service.title}</Text><Text style={s.copy}>{service.description}</Text></View>)}</View>
      <Pressable accessibilityRole="button" style={s.primary} onPress={() => { if (authorized()) navigation.navigate('StudentCourses'); }}><Text style={s.primaryText}>Find a campus facilitator</Text><Feather name="arrow-right" color="#FFF" size={20} /></Pressable>
      <Text style={s.footer}>Resources are for education and general support. This page does not provide live counseling or emergency response.</Text>
      <Pressable accessibilityRole="link" style={s.action} onPress={() => open('https://www.who.int/westernpacific/publications/i/item/9789240003927', 'WHO — Doing What Matters in Times of Stress')}><Text style={s.actionText}>Further reading: WHO stress guide ↗</Text></Pressable>
    </View>
  </ScrollView></View>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background }, content: { paddingBottom: 160 }, body: { paddingHorizontal: 18, gap: 14, marginTop: -36 }, search: { minHeight: 52 }, flex: { flex: 1, minWidth: 0 }, chips: { gap: 8, paddingVertical: 4 }, chip: { minHeight: 46, paddingHorizontal: 17, justifyContent: 'center', borderRadius: 24, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EEDDE1' }, selected: { backgroundColor: c.crimson, borderColor: c.crimson }, chipText: { color: c.ink, fontSize: 13, fontWeight: '600' }, selectedText: { color: '#FFF' }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 13 }, heading: { color: c.ink, fontSize: 21, fontWeight: '800', flexShrink: 1 }, offline: { color: '#246348', backgroundColor: '#E4F2E9', fontSize: 10, fontWeight: '800', padding: 6, borderRadius: 8 }, card: { borderRadius: 23, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F0E3E7', shadowColor: '#6E263A', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2, overflow: 'hidden' }, cardRow: { flexDirection: 'row', gap: 12, padding: 17, alignItems: 'center', minHeight: 88 }, icon: { height: 48, width: 48, borderRadius: 16, backgroundColor: '#FCE8EA', alignItems: 'center', justifyContent: 'center' }, eyebrow: { fontSize: 11, lineHeight: 17, color: c.crimson, fontWeight: '700', marginBottom: 3 }, title: { color: c.ink, fontSize: 17, lineHeight: 24, fontWeight: '700' }, copy: { color: c.slate, fontSize: 14, lineHeight: 22 }, steps: { borderTopWidth: 1, borderColor: '#F0E3E7', padding: 18, gap: 12 }, step: { color: c.ink, fontSize: 14, lineHeight: 23 }, resourceBody: { padding: 18, gap: 9 }, video: { height: 130, backgroundColor: '#FCE8EA', alignItems: 'center', justifyContent: 'center', gap: 8 }, videoLabel: { color: c.crimson, fontSize: 10, fontWeight: '700', letterSpacing: 1 }, actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, action: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', borderRadius: 15, backgroundColor: '#FCE8EA', alignSelf: 'flex-start' }, actionText: { color: c.crimson, fontSize: 13, fontWeight: '700' }, inspiration: { padding: 23, borderRadius: 25, backgroundColor: '#FBE4E8', gap: 12, marginTop: 14 }, quote: { color: '#794053', fontSize: 16, lineHeight: 25, fontStyle: 'italic' }, serviceGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, service: { backgroundColor: '#FFF', borderRadius: 22, padding: 18, gap: 9, borderWidth: 1, borderColor: '#F0E3E7' }, primary: { minHeight: 54, borderRadius: 18, backgroundColor: c.crimson, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 10 }, primaryText: { color: '#FFF', fontSize: 15, fontWeight: '700', flexShrink: 1 }, footer: { color: c.slate, fontSize: 12, lineHeight: 19, textAlign: 'center', paddingHorizontal: 8 },
});

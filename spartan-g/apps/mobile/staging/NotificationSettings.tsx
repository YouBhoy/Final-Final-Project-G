import { Text, View } from 'react-native';
import { profileStyles as styles } from '../src/screens/profile/ProfileDesign';
function Unavailable(){return <View style={styles.notice}><Text style={styles.noticeText}>Automatic device setup requires phone notification permission, your notification preferences, and an active approved staging service. Private token copying is unavailable.</Text></View>;}
export const PrivateFcmTest=Unavailable;
export const PhoneNotificationPreparation=Unavailable;

import { Text, View } from 'react-native';
import { profileStyles as styles } from '../src/screens/profile/ProfileDesign';
function Unavailable(){return <View style={styles.notice}><Text style={styles.noticeText}>Notifications and native push-token registration are disabled in this staging test application.</Text></View>;}
export const PrivateFcmTest=Unavailable;
export const PhoneNotificationPreparation=Unavailable;

import type { MessagingAdapter } from '@spartan-g/shared-services';
export const expoMessagingAdapter:MessagingAdapter={managesRegistration:true,async registerForPushNotifications(){return null;},onMessageReceived(){return()=>{};}};

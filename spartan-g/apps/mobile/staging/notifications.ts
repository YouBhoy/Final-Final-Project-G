// No Expo native notification module is imported or registered by this profile.
export async function getPermissionsAsync(){return {granted:false,status:'denied' as const,canAskAgain:false,expires:'never' as const};}

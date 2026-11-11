export function registrationCopy(project: string, installed: boolean) {
  const production = installed && project === 'spartan-g-a2d80';
  return {
    production,
    heading: production ? 'PHONE NOTIFICATIONS' : installed ? 'STAGING PHONE NOTIFICATIONS' : 'PHONE NOTIFICATIONS — PREPARATION',
    description: production
      ? 'Secure phone registration requires your permission and consent. The approved pilot enables generic message alerts only. Registration alone does not prove receipt; Android and the server test window still control delivery.'
      : 'Synthetic staging test only. Android permission and an acknowledged device registration are both required. The server test window and each category must also allow delivery; a registration is not proof of phone receipt.',
    title: production ? 'Allow phone notifications' : 'Allow staging phone notifications',
    subtitle: production ? 'Check permission and securely register this phone for the message pilot.' : 'Check permission and request a secure staging registration.',
    error: production ? 'Phone registration is not confirmed. Check permission, connection and the approved test window.' : 'Staging registration is not confirmed. Check Android permission, connection and the approved staging test window.',
    binding: production ? 'Phone registration acknowledged. Receipt is not verified; Android and the server test window still control delivery.' : 'Staging device registration acknowledged. Delivery is still controlled by the server test window and Android.',
    missing: production ? 'No current phone registration confirmed.' : 'No current staging device registration confirmed.',
    registrationStatus: production ? 'Device registration: consult the acknowledged binding above. Android permission or a binding alone does not confirm server delivery.' : 'Device registration: consult the acknowledged staging binding above. Server delivery: not confirmed by Android permission or a binding alone.',
    deliveryStatus: production ? 'Automatic message delivery: limited to the separately approved pilot. Phone receipt is not verified here.' : 'Automatic server delivery: controlled by the separately approved staging service; not verified here.',
  };
}

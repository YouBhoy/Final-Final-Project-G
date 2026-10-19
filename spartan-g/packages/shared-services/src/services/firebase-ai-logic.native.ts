import { localEmulators } from '../config/local-emulators';
import { aiLogicReleaseConfig as config } from '../config/firebase-ai-release';
import { assertLocalEmulatorsReady } from '../firebase/local-emulator-state';
import { getFirebaseAuth } from '../firebase/auth';
import { getNativeAppCheck } from '../firebase/app-check.native';
import { createAiLogicClient, AiLogicError } from './firebase-ai-logic.client';
import { createAiLogicFacade } from './firebase-ai-facade';
import { createNativeAiPorts } from './firebase-ai-ports.native';

let client: ReturnType<typeof createAiLogicClient> | undefined;
function assertRequestAllowed() {
  assertLocalEmulatorsReady();
  if (!config.enabled || localEmulators.enabled || config.dataMode !== 'synthetic-only'
      || config.projectId !== 'spartan-g-a2d80' || !config.syntheticAccountUids.length
      || !/^1:\d+:android:[a-f\d]+$/i.test(config.androidAppId)) throw new AiLogicError('configuration_missing');
}
function resolveClient() {
  // No Auth, Firestore, attestation or AI initialization while the source gate is disabled.
  if (!config.enabled) return undefined;
  assertRequestAllowed();
  const auth = getFirebaseAuth();
  if (!auth.currentUser || !config.syntheticAccountUids.includes(auth.currentUser.uid)) throw new AiLogicError('unauthorized');
  if (!client) {
    const appCheck = getNativeAppCheck(auth.app, { provider: 'play-integrity', projectId: config.projectId, androidAppId: config.androidAppId });
    client = createAiLogicClient(auth.app, { projectId: config.projectId, androidAppId: config.androidAppId,
      aiLogicConfigured: true, appCheckConfigured: true }, createNativeAiPorts(auth, appCheck, config, assertRequestAllowed));
  }
  return client;
}
export const { geminiService, assistantGeminiClient } = createAiLogicFacade(resolveClient);
export type { AssistantChatMessage, AssistantChatResult } from './gemini.service';

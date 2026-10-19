import { NativeModules, Platform } from 'react-native';
import { GardenHttpError, type NativeGardenBridge } from './externalGardenClient';

/** No fetch fallback, URL setter, headers API or global networking hook. */
export function getNativeGardenBridge(): NativeGardenBridge {
  const module: unknown = Platform.OS === 'android' ? NativeModules.SpartanGardenHttp : undefined;
  if (!module || typeof module !== 'object' || !('getConfiguration' in module) || typeof module.getConfiguration !== 'function'
    || !('request' in module) || typeof module.request !== 'function' || !('cancel' in module) || typeof module.cancel !== 'function') {
    throw new GardenHttpError('unavailable','native_transport_unavailable',true);
  }
  return module as NativeGardenBridge;
}

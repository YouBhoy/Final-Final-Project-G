import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

const ExpandableNavigationContext = createContext({ expanded: false, setExpanded: (_expanded: boolean) => {} });

export function ExpandableNavigationProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const value = useMemo(() => ({ expanded, setExpanded }), [expanded]);
  return <ExpandableNavigationContext.Provider value={value}>{children}</ExpandableNavigationContext.Provider>;
}

export const useExpandableNavigation = () => useContext(ExpandableNavigationContext);

/** Hide only the floating layer while navigation is expanded. Keep chat state mounted. */
export function NavigationAssistantLayer({ children }: { children: ReactNode }) {
  const { expanded } = useExpandableNavigation();
  return <View testID="navigation-assistant-layer" pointerEvents={expanded ? 'none' : 'box-none'} accessibilityElementsHidden={expanded} importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'} style={[StyleSheet.absoluteFillObject, { opacity: expanded ? 0 : 1 }]}>{children}</View>;
}

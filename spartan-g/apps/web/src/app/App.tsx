import React from 'react';
import { View, Text } from 'react-native';

export default function App() {
  console.log('[SPARTAN] Diagnostic App rendered');

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#C62828',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          color: 'white',
          fontSize: 28,
          fontWeight: 'bold',
        }}
      >
        SPARTAN-G
      </Text>

      <Text
        style={{
          color: 'white',
          fontSize: 16,
          marginTop: 10,
        }}
      >
        React Native is working!
      </Text>
    </View>
  );
}
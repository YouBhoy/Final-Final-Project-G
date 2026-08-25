import { useCallback, useEffect, useRef, useState } from 'react';
import { messagingService, userService } from '@spartan-g/shared-services';
import { ConversationDocument, Role } from '@spartan-g/shared-types';
import { useAuth } from './useAuth';

export type ConversationWithId = ConversationDocument & { id: string };

export function useConversationList() {
  const { user } = useAuth();
  const userId = user?.uid;
  const userRole = user?.role;
  const [conversations, setConversations] = useState<ConversationWithId[]>([]);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const participantNamesRef = useRef<Record<string, string>>({});
  const pendingParticipantIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    participantNamesRef.current = participantNames;
  }, [participantNames]);

  const retry = useCallback(() => {
    if (!userId) {
      return;
    }

    setError(null);
    setIsLoading(true);
    setRetryKey((current) => current + 1);
  }, [userId]);

  useEffect(() => {
    let isActive = true;

    if (!userId || !userRole) {
      setConversations([]);
      setParticipantNames({});
      pendingParticipantIdsRef.current.clear();
      setError(null);
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    setIsLoading(true);
    setError(null);
    pendingParticipantIdsRef.current.clear();

    const syncParticipantNames = async (nextConversations: ConversationWithId[]) => {
      const cachedNames = participantNamesRef.current;
      const missingParticipantIds = Array.from(
        new Set(
          nextConversations.flatMap((conversation) =>
            conversation.participantIds.filter(
              (participantId) =>
                participantId !== userId &&
                !cachedNames[participantId] &&
                !pendingParticipantIdsRef.current.has(participantId),
            ),
          ),
        ),
      );

      if (missingParticipantIds.length === 0) {
        return;
      }

      missingParticipantIds.forEach((participantId) => {
        pendingParticipantIdsRef.current.add(participantId);
      });

      try {
        const resolvedNames = await Promise.all(
          missingParticipantIds.map(async (participantId) => {
            try {
              const userDocument = await userService.getUser(participantId);
              return userDocument ? [participantId, userDocument.displayName || 'Unknown User'] as const : null;
            } catch (fetchError) {
              console.error('[useConversationList] Failed to load participant profile:', fetchError);
              return null;
            }
          }),
        );

        if (!isActive) {
          return;
        }

        const nextNames = Object.fromEntries(
          resolvedNames.filter((entry): entry is readonly [string, string] => entry !== null),
        );

        if (Object.keys(nextNames).length > 0) {
          setParticipantNames((currentNames) => ({
            ...currentNames,
            ...nextNames,
          }));
        }
      } finally {
        missingParticipantIds.forEach((participantId) => {
          pendingParticipantIdsRef.current.delete(participantId);
        });
      }
    };

    const unsubscribe = messagingService.subscribeToConversations(
      userId,
      userRole as Role,
      (nextConversations) => {
        if (!isActive) {
          return;
        }

        setConversations(nextConversations);
        setIsLoading(false);
        void syncParticipantNames(nextConversations);
      },
      (listenerError) => {
        if (!isActive) {
          return;
        }

        console.error('[useConversationList] Conversation listener error:', listenerError);
        setError(listenerError.message || 'Failed to load conversations');
        setIsLoading(false);
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [retryKey, userId, userRole]);

  return {
    conversations,
    participantNames,
    isLoading,
    error,
    retry,
  };
}
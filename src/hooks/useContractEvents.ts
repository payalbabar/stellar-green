import { useEffect, useRef } from 'react';

export interface ContractEvent {
  type: 'RECORD_UPLOADED' | 'ACCESS_GRANTED' | 'ACCESS_REVOKED' | 'APPOINTMENT_BOOKED' | 'APPOINTMENT_COMPLETED' | 'REWARD_EARNED';
  timestamp: number;
  data: Record<string, any>;
}

export function useContractEvents(callback: (event: ContractEvent) => void) {
  const listenerRef = useRef<any>(null);

  useEffect(() => {
    // Listen for contract events from localStorage (mock implementation for dev)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'medichain_event' && e.newValue) {
        try {
          const event = JSON.parse(e.newValue);
          callback(event);
          // Clean up after processing
          localStorage.removeItem('medichain_event');
        } catch (err) {
          console.error('Error parsing contract event:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    listenerRef.current = handleStorageChange;

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [callback]);

  return {
    emitEvent: (event: ContractEvent) => {
      localStorage.setItem('medichain_event', JSON.stringify(event));
      // Immediately call the callback for same-tab events
      callback(event);
    },
  };
}

export function createRecordUploadedEvent(recordName: string, recordType: string): ContractEvent {
  return {
    type: 'RECORD_UPLOADED',
    timestamp: Date.now(),
    data: {
      recordName,
      recordType,
      hash: `ipfs_${Date.now()}`,
    },
  };
}

export function createAccessGrantedEvent(doctorName: string, doctorAddr: string): ContractEvent {
  return {
    type: 'ACCESS_GRANTED',
    timestamp: Date.now(),
    data: {
      doctorName,
      doctorAddr,
    },
  };
}

export function createAccessRevokedEvent(doctorName: string, doctorAddr: string): ContractEvent {
  return {
    type: 'ACCESS_REVOKED',
    timestamp: Date.now(),
    data: {
      doctorName,
      doctorAddr,
    },
  };
}

export function createRewardEarnedEvent(amount: number, reason: string): ContractEvent {
  return {
    type: 'REWARD_EARNED',
    timestamp: Date.now(),
    data: {
      amount,
      reason,
    },
  };
}

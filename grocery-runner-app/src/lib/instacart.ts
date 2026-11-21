// "Shop on Instacart": sends the unchecked list to Instacart (official Developer Platform, through the
// grocery-runner function so the key stays off the phone). The shopper picks a nearby store on Instacart
// and orders pickup or delivery there. The button only shows once the server has an Instacart key.
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { backendConfigured, backendStatus, callBackend } from './api';
import { ListItem } from './types';

let ready: Promise<boolean> | null = null;

export function useInstacartReady(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!backendConfigured) return;
    ready ??= backendStatus()
      .then((s) => !!s.instacart)
      .catch(() => {
        ready = null;
        return false;
      });
    let live = true;
    ready.then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, []);
  return on;
}

export async function openInstacart(items: ListItem[]): Promise<void> {
  const lines = items.filter((i) => !i.checked).map((i) => ({ name: i.name, amount: i.amount }));
  const { url } = await callBackend<{ url: string }>({ body: { action: 'instacart', items: lines } });
  if (!/^https:\/\//.test(url)) throw new Error('Instacart sent back a bad link.');
  await Linking.openURL(url);
}

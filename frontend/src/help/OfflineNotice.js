import React from 'react';
import useOnline from '../offline/useOnline';
import { NoInternetHelp } from './draftHelp';
import NearbyJoin from './NearbyJoin';
import { useAuth } from '../AuthContext';
import { nearbySupported } from '../offline/nearbyDraft';
import './InfoTip.css';

/** Card shown when the device has no internet, with the steps for drafting offline. */
const OfflineNotice = ({ action }) => {
  const online = useOnline();
  const { user } = useAuth() || {};
  if (online) return null;
  return (
    <section className="offline-notice" role="status">
      <strong>No internet right now</strong>
      <p>{action} Try an offline draft instead:</p>
      <NoInternetHelp />
      {nearbySupported() && (
        <>
          <p><strong>Join a nearby draft with the commissioner's room code</strong></p>
          <NearbyJoin user={user?.guest ? null : user} />
        </>
      )}
    </section>
  );
};

export default OfflineNotice;

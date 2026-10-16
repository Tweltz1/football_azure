import React from 'react';
import useOnline from '../offline/useOnline';
import { NoInternetHelp } from './draftHelp';
import OfflineDraftStart from './OfflineDraftStart';
import { useAuth } from '../AuthContext';
import { nearbySupported } from '../offline/nearbyDraft';
import './InfoTip.css';

/** Card shown when the device has no internet, with the steps for drafting offline. */
const OfflineNotice = ({ action, joinOnly = false }) => {
  const online = useOnline();
  const { user } = useAuth() || {};
  if (online) return null;
  return (
    <section className="offline-notice" role="status">
      <strong>No internet right now</strong>
      <p>{action} Try an offline draft instead:</p>
      <NoInternetHelp />
      {nearbySupported() && (
        <OfflineDraftStart user={user?.guest ? null : user} joinOnly={joinOnly} />
      )}
    </section>
  );
};

export default OfflineNotice;

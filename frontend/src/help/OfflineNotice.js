import React from 'react';
import useOnline from '../offline/useOnline';
import { NoInternetHelp } from './draftHelp';
import './InfoTip.css';

/** Card shown when the device has no internet, with the steps for drafting offline. */
const OfflineNotice = ({ action }) => {
  const online = useOnline();
  if (online) return null;
  return (
    <section className="offline-notice" role="status">
      <strong>No internet right now</strong>
      <p>{action} Try an offline draft instead:</p>
      <NoInternetHelp />
    </section>
  );
};

export default OfflineNotice;

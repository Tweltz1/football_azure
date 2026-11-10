import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SignInPrompt, useJunk } from './JunkApp';
import { blockUser, getChat, inbox, sendMessage } from './junkApi';
import { ContactSheet, TermsSheet } from './Safety';
import { timeAgo } from './device';
import { BackButton } from './ItemPage';
import { IconBox, IconChat, IconFlag, IconSend } from './icons';

export function Inbox() {
  const { me, authLoading, refreshUnread } = useJunk();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me) return undefined;
    let live = true;
    const load = () => inbox().then((l) => { if (live) setList(l); }).catch((err) => { if (live) setError(err.message); });
    load();
    refreshUnread();
    const t = window.setInterval(load, 15000);
    return () => { live = false; window.clearInterval(t); };
  }, [me, refreshUnread]);

  return (
    <main className="jk-page">
      <header className="jk-page-head"><h1>Messages</h1></header>
      {!me && !authLoading && <SignInPrompt title="Your messages" text="Sign in to message people about their free stuff." />}
      {me && error && <p className="jk-error">{error}</p>}
      {me && list === null && !error && <div className="jk-thread-list">{[0, 1, 2].map((i) => <div key={i} className="jk-thread jk-skeleton" />)}</div>}
      {me && list && list.length === 0 && (
        <div className="jk-empty">
          <div className="jk-empty-art" aria-hidden="true"><IconChat size={34} /></div>
          <h2>No messages yet</h2>
          <p className="jk-muted">Tap “I want it” on something you like to message the person giving it away.</p>
          <Link to="/junk" className="jk-btn jk-btn-primary">Browse free stuff</Link>
        </div>
      )}
      {me && list && list.length > 0 && (
        <div className="jk-thread-list">
          {list.map((t) => (
            <Link key={`${t.itemId}/${t.otherId}`} to={`/junk/chat/${t.itemId}/${t.otherId}`} className={`jk-thread${t.unread ? ' is-unread' : ''}`}>
              <div className="jk-thread-photo">
                {t.item && t.item.photo ? <img src={t.item.photo} alt="" /> : <IconBox size={22} />}
              </div>
              <div className="jk-thread-text">
                <p className="jk-thread-top">
                  <strong>{t.otherName}</strong>
                  <span>{timeAgo(t.last.createdAt)}</span>
                </p>
                <p className="jk-thread-item">{t.item ? `${t.item.mine ? 'Your ' : ''}${t.item.title}` : 'Listing removed'}</p>
                <p className="jk-thread-last">{t.last.mine ? 'You: ' : ''}{t.last.body}</p>
              </div>
              {t.unread > 0 && <b className="jk-badge">{t.unread}</b>}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

const QUICK_ASKS = ['Is this still available?', 'I can pick it up today.', 'When works for pickup?'];

export function Chat() {
  const { itemId, otherId } = useParams();
  const navigate = useNavigate();
  const { me, authLoading, refreshUnread } = useJunk();
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const [askTerms, setAskTerms] = useState(false);
  const retryAfterTerms = useRef(null);
  const [menu, setMenu] = useState(false);
  const [contact, setContact] = useState(false);

  const load = useCallback(async () => {
    try {
      setChat(await getChat(itemId, otherId));
      refreshUnread();
    } catch (err) {
      setError(err.message);
    }
  }, [itemId, otherId, refreshUnread]);

  useEffect(() => {
    if (!me) return undefined;
    load();
    const t = window.setInterval(load, 8000);
    return () => window.clearInterval(t);
  }, [me, load]);

  const count = chat ? chat.messages.length : 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [count]);

  const send = async (body) => {
    const msg = (body ?? text).trim();
    if (!msg || sending) return;
    setSending(true);
    setError('');
    try {
      const sent = await sendMessage(itemId, otherId, msg);
      setChat((c) => ({ ...c, messages: [...(c?.messages || []), sent] }));
      setText('');
      if (sent.offApp) setError('Tip: keep chatting in Curbsy. If something goes wrong, we can only help with messages sent here.');
    } catch (err) {
      if (err.status === 428) {
        retryAfterTerms.current = () => send(msg);
        setAskTerms(true);
      } else {
        setError(err.message);
      }
    } finally {
      setSending(false);
    }
  };

  const block = async () => {
    setMenu(false);
    try {
      await blockUser(otherId);
      navigate('/junk/inbox', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  if (!me) {
    return (
      <main className="jk-page">
        <div className="jk-topbar"><BackButton to="/junk/inbox" /></div>
        {!authLoading && <SignInPrompt title="Messages" text="Sign in to message people about their free stuff." />}
      </main>
    );
  }

  const item = chat && chat.item;
  return (
    <main className="jk-page jk-chat">
      <div className="jk-topbar jk-chat-head">
        <BackButton to="/junk/inbox" />
        <div className="jk-chat-who">
          <strong>{chat ? chat.otherName : ' '}</strong>
          {item && <Link to={`/junk/item/${item.id}`}>{item.title}{item.status === 'gone' ? ' · taken' : ''}</Link>}
        </div>
        {item && item.photos[0] && <Link to={`/junk/item/${item.id}`} className="jk-chat-thumb"><img src={item.photos[0]} alt="" /></Link>}
        <button type="button" className="jk-icon-btn" onClick={() => setMenu(true)} aria-label="Report or block"><IconFlag size={20} /></button>
      </div>

      <div className="jk-bubbles">
        {chat && chat.messages.length === 0 && (
          <div className="jk-chat-start">
            <p className="jk-muted">Say hi and set up a pickup time. Tap one to send:</p>
            <div className="jk-choice-row">
              {QUICK_ASKS.map((q) => <button key={q} type="button" className="jk-chip" onClick={() => send(q)}>{q}</button>)}
            </div>
          </div>
        )}
        {chat && chat.messages.map((m) => (
          <div key={m.id} className={`jk-bubble${m.mine ? ' is-mine' : ''}`}>
            <p>{m.body}</p>
            {m.offApp && !m.mine && <small className="jk-bubble-warn">Careful moving off Curbsy. Never send money or codes.</small>}
            <time dateTime={m.createdAt}>{timeAgo(m.createdAt)}</time>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && <p className="jk-error jk-chat-error">{error}</p>}
      <form className="jk-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message"
          rows={1}
          maxLength={1000}
          aria-label="Message"
        />
        <button type="submit" className="jk-send" disabled={!text.trim() || sending} aria-label="Send"><IconSend size={20} /></button>
      </form>

      {menu && (
        <div className="jk-sheet-backdrop" role="presentation" onClick={() => setMenu(false)}>
          <div className="jk-sheet" role="dialog" aria-modal="true" aria-label="Report or block" onClick={(e) => e.stopPropagation()}>
            <h2>{chat ? chat.otherName : 'This person'}</h2>
            <div className="jk-sheet-list">
              <button type="button" onClick={() => { setMenu(false); setContact(true); }}>Report this person to Curbsy</button>
              <button type="button" className="jk-danger-text" onClick={block}>Block (hide all their posts and messages)</button>
              <button type="button" onClick={() => setMenu(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {contact && <ContactSheet onClose={() => setContact(false)} />}
      {askTerms && (
        <TermsSheet
          onDone={() => {
            setAskTerms(false);
            const retry = retryAfterTerms.current;
            retryAfterTerms.current = null;
            if (retry) retry();
          }}
          onCancel={() => { setAskTerms(false); retryAfterTerms.current = null; }}
        />
      )}
    </main>
  );
}

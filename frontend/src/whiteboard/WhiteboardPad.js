import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { encodeBoard } from './boardCodec';
import { readNumber } from './recognizer';
import { BoardSketch } from './BoardViews';
import { usePersonalHandwriting } from './personalHandwriting';
import './whiteboard.css';

const MAX_STROKES = 30;

/**
 * A little dry-erase board for whiteboard bidding. Draw with a finger, pen or mouse, then "Lock in board".
 * In the auto-read style it shows what the reader sees ("Reads as $34"); the bidder can redraw, but the
 * commissioner decides the award once the boards are revealed.
 *
 * onLockIn(amount, board) should return a promise; reject with a message to show it under the pad.
 * userId loads the bidder's own past digits so the reader learns their handwriting; maxAmount (their
 * max bid) lets it prefer a reading they could actually bid.
 */
const WhiteboardPad = ({
  autoRead = false,
  activeBid = null,
  disabled = false,
  disabledReason = '',
  onLockIn,
  onWithdraw,
  compact = false,
  showLocked = true,
  userId = null,
  maxAmount = null,
}) => {
  const canvasRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const drawingRef = useRef(null);
  const [strokes, setStrokes] = useState([]);
  const [read, setRead] = useState(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const personal = usePersonalHandwriting(userId, autoRead);

  const paint = useCallback((list = strokes) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = sizeRef.current;
    const ratio = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c2440';
    ctx.fillStyle = '#1c2440';
    ctx.lineWidth = Math.max(3, width * (compact ? 0.02 : 0.016));
    const all = drawingRef.current ? [...list, drawingRef.current.points] : list;
    all.forEach((stroke) => {
      if (stroke.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * width, stroke[0].y * width);
      if (stroke.length === 1) {
        ctx.arc(stroke[0].x * width, stroke[0].y * width, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      stroke.slice(1).forEach((p) => ctx.lineTo(p.x * width, p.y * width));
      ctx.stroke();
    });
  }, [strokes, compact]);

  // Keep the canvas sharp and the right size; strokes are stored as fractions of the width.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      sizeRef.current = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      paint();
    };
    resize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paint]);

  useEffect(() => { paint(); }, [paint]);

  // Auto-read: re-read shortly after each stroke.
  useEffect(() => {
    if (!autoRead) return undefined;
    if (strokes.length === 0) {
      setRead(null);
      return undefined;
    }
    const max = Number(maxAmount) > 0 ? Number(maxAmount) : null;
    const timer = window.setTimeout(() => setRead(readNumber(strokes, { personal, max }).amount), 120);
    return () => window.clearTimeout(timer);
  }, [autoRead, strokes, personal, maxAmount]);

  const pointFrom = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.width };
  };

  const handlePointerDown = (event) => {
    if (event.button !== undefined && event.button > 0) return;
    if (strokes.length >= MAX_STROKES) {
      setMessage('The board is full. Undo or clear to keep writing.');
      return;
    }
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawingRef.current = { id: event.pointerId, points: [pointFrom(event)] };
    setMessage('');
    paint();
  };

  const handlePointerMove = (event) => {
    const drawing = drawingRef.current;
    if (!drawing || drawing.id !== event.pointerId) return;
    event.preventDefault();
    const events = event.nativeEvent.getCoalescedEvents ? event.nativeEvent.getCoalescedEvents() : [];
    (events.length ? events : [event]).forEach((e) => drawing.points.push(pointFrom(e)));
    paint();
  };

  const finishStroke = (event) => {
    const drawing = drawingRef.current;
    if (!drawing || drawing.id !== event.pointerId) return;
    drawingRef.current = null;
    setStrokes((current) => [...current, drawing.points]);
  };

  const board = useMemo(() => encodeBoard(strokes), [strokes]);
  const boardKey = board ? JSON.stringify(board) : '';
  const lockedKey = activeBid?.board ? JSON.stringify(activeBid.board) : '';
  const isLockedIn = Boolean(boardKey) && boardKey === lockedKey;
  const hasActiveBoard = Boolean(activeBid?.board);

  const handleLockIn = async () => {
    if (!board || disabled || sending) return;
    setSending(true);
    setMessage('');
    try {
      await onLockIn(autoRead ? (read || 0) : 0, board);
    } catch (error) {
      setMessage(String(error?.message || error || 'Could not lock in your board.'));
    } finally {
      setSending(false);
    }
  };

  const lockLabel = sending ? 'Locking in...' : isLockedIn ? 'Locked in' : hasActiveBoard ? 'Lock in again' : 'Lock in board';

  return (
    <div className={`wb-pad${compact ? ' is-compact' : ''}${disabled ? ' is-disabled' : ''}`}>
      <div className="wb-frame">
        <div className="wb-surface">
          <canvas
            ref={canvasRef}
            className="wb-canvas"
            aria-label="Whiteboard: draw your bid"
            role="img"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
          />
          {strokes.length === 0 && <span className="wb-placeholder" aria-hidden="true">Write your bid</span>}
          {isLockedIn && <span className="wb-stamp">Locked in</span>}
        </div>
        <div className="wb-ledge">
          <span className="wb-marker" aria-hidden="true" />
          <button type="button" className="wb-tool" onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={strokes.length === 0}>
            Undo
          </button>
          <button type="button" className="wb-tool" onClick={() => { setStrokes([]); setMessage(''); }} disabled={strokes.length === 0}>
            Clear
          </button>
          {autoRead && (
            <span className={`wb-read${read == null ? ' is-empty' : ''}`} aria-live="polite">
              {read == null ? (strokes.length ? 'Can’t read it yet' : 'Auto-read on') : <>Reads as <strong>${read}</strong></>}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        className={`wb-lock${isLockedIn ? ' is-locked' : ''}`}
        onClick={handleLockIn}
        disabled={!board || disabled || sending || isLockedIn}
      >
        {lockLabel}
      </button>

      {disabled && disabledReason && <p className="wb-note">{disabledReason}</p>}
      {message && <p className="wb-error" role="alert">{message}</p>}

      {showLocked && hasActiveBoard && (
        <div className="wb-mine">
          <BoardSketch board={activeBid.board} className="wb-mine-thumb" strokeWidth={2.5} />
          <div className="wb-mine-text">
            <span>Your board is in</span>
            {autoRead && activeBid.amount > 0 && <strong>Reads ${activeBid.amount}</strong>}
          </div>
          {onWithdraw && (
            <button type="button" className="wb-tool wb-withdraw" onClick={onWithdraw} disabled={disabled}>Withdraw</button>
          )}
        </div>
      )}
    </div>
  );
};

export default WhiteboardPad;

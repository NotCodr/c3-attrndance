import { useEffect, useRef } from 'react';

/**
 * A floating pill in place of the page's native scrollbar.
 *
 * While mounted it hides the browser's scrollbar (the page still scrolls
 * normally by wheel, touch and keyboard) and draws a glass pill at the right
 * edge that tracks the scroll position. It shows while scrolling or when the
 * pointer comes near the edge, fades out when idle, can be dragged, and a click
 * on its track jumps there. It is decoration over native scrolling, so it is
 * hidden from assistive tech.
 *
 * Positions update through refs and transforms, never React state, so scrolling
 * does not re-render the page.
 */
export default function FloatingScrollbar({ bottomInset = 0 }) {
  const trackRef = useRef(null);
  const thumbRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return undefined;
    root.classList.add('c3-no-scrollbar');

    let frame = 0;
    let hideTimer = 0;
    let hovering = false;
    let drag = null;

    const metrics = () => {
      const view = window.innerHeight;
      const full = Math.max(root.scrollHeight, document.body.scrollHeight);
      const trackH = track.clientHeight;
      const thumbH = Math.max(44, Math.round((trackH * view) / Math.max(full, 1)));
      return { maxScroll: Math.max(full - view, 0), maxTop: Math.max(trackH - thumbH, 1), thumbH };
    };

    const paint = () => {
      frame = 0;
      const m = metrics();
      const scrollable = m.maxScroll > 2;
      track.dataset.scrollable = String(scrollable);
      if (!scrollable) return;
      const top = m.maxTop * Math.min(1, Math.max(0, window.scrollY / m.maxScroll));
      thumb.style.height = `${m.thumbH}px`;
      thumb.style.transform = `translate3d(0, ${top}px, 0)`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

    const show = () => {
      track.dataset.active = 'true';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!drag && !hovering) track.dataset.active = 'false';
      }, 1200);
    };

    const onScroll = () => { schedule(); show(); };
    const onWindowPointer = (e) => { if (window.innerWidth - e.clientX < 36) show(); };

    const onThumbDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      drag = { y: e.clientY, scroll: window.scrollY };
      thumb.setPointerCapture(e.pointerId);
      track.dataset.dragging = 'true';
      show();
    };
    const onThumbMove = (e) => {
      if (!drag) return;
      const m = metrics();
      window.scrollTo(0, drag.scroll + (e.clientY - drag.y) * (m.maxScroll / m.maxTop));
    };
    const onThumbUp = () => {
      drag = null;
      track.dataset.dragging = 'false';
      show();
    };
    const onTrackDown = (e) => {
      if (e.target === thumb) return;
      const rect = track.getBoundingClientRect();
      const m = metrics();
      const ratio = (e.clientY - rect.top - m.thumbH / 2) / m.maxTop;
      window.scrollTo({ top: Math.max(0, Math.min(1, ratio)) * m.maxScroll, behavior: 'smooth' });
    };
    const onEnter = () => { hovering = true; show(); };
    const onLeave = () => { hovering = false; show(); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pointermove', onWindowPointer, { passive: true });
    thumb.addEventListener('pointerdown', onThumbDown);
    thumb.addEventListener('pointermove', onThumbMove);
    thumb.addEventListener('pointerup', onThumbUp);
    thumb.addEventListener('pointercancel', onThumbUp);
    track.addEventListener('pointerdown', onTrackDown);
    track.addEventListener('pointerenter', onEnter);
    track.addEventListener('pointerleave', onLeave);
    // Content grows after load: images, a form section opening, fonts.
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    paint();

    return () => {
      root.classList.remove('c3-no-scrollbar');
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
      ro.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', onWindowPointer);
      thumb.removeEventListener('pointerdown', onThumbDown);
      thumb.removeEventListener('pointermove', onThumbMove);
      thumb.removeEventListener('pointerup', onThumbUp);
      thumb.removeEventListener('pointercancel', onThumbUp);
      track.removeEventListener('pointerdown', onTrackDown);
      track.removeEventListener('pointerenter', onEnter);
      track.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div
      ref={trackRef}
      aria-hidden="true"
      className="c3-scrollbar"
      data-active="false"
      data-scrollable="false"
      data-dragging="false"
      style={{ bottom: `${10 + bottomInset}px` }}
    >
      <div ref={thumbRef} className="c3-scrollbar-thumb" />
    </div>
  );
}

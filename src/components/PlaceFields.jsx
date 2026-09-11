import React, { useEffect, useId, useMemo, useState } from 'react';
import { History, Loader2, MapPin } from 'lucide-react';
import { searchPlaces, suggestAddress } from '@/lib/places';

function useDebounced(value, ms) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Venue and address, with help that stays out of the way: venues the club has
 * used before, address search as you type, and a suggested address for
 * well-known places once you have moved on from the venue box. The only thing
 * filled in without asking is the address of a venue the club has used before,
 * and only while the address box is empty.
 */
export default function PlaceFields({ name, address, onChange, venues = [], disabled = false }) {
  const [focus, setFocus] = useState(null);
  const [active, setActive] = useState(-1);
  const [places, setPlaces] = useState([]);
  const [searching, setSearching] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const listId = useId();

  const typed = name.trim().toLowerCase();
  const known = venues.some((v) => v.name.toLowerCase() === typed);
  const hasAddress = !!address.trim();

  const venueMatches = useMemo(
    () => venues.filter((v) => v.name.toLowerCase() !== typed && (!typed || v.name.toLowerCase().includes(typed))).slice(0, 5),
    [venues, typed],
  );

  // Address search, only while the address box has focus.
  const addressQuery = useDebounced(focus === 'address' ? address : '', 300);
  useEffect(() => {
    if (addressQuery.trim().length < 3) {
      setPlaces([]);
      return undefined;
    }
    const ctl = new AbortController();
    setSearching(true);
    searchPlaces(addressQuery, { signal: ctl.signal }).then((found) => {
      if (ctl.signal.aborted) return;
      setPlaces(found);
      setSearching(false);
    });
    return () => {
      ctl.abort();
      setSearching(false);
    };
  }, [addressQuery]);

  // A suggested address for a venue we recognise, offered but never applied.
  // Not while a venue the club has used before still fits what is typed: that
  // is almost always the one meant.
  const pastFits = !!typed && venues.some((v) => v.name.toLowerCase().includes(typed));
  const venueQuery = useDebounced(name, 500);
  useEffect(() => {
    setSuggestion(null);
    if (hasAddress || known || pastFits || venueQuery.trim().length < 4) return undefined;
    const ctl = new AbortController();
    suggestAddress(venueQuery, { signal: ctl.signal }).then((place) => {
      if (!ctl.signal.aborted) setSuggestion(place);
    });
    return () => ctl.abort();
  }, [venueQuery, known, hasAddress, pastFits]);

  const setName = (value) => {
    const hit = venues.find((v) => v.name.toLowerCase() === value.trim().toLowerCase());
    onChange({ locationName: value, ...(hit?.address && !hasAddress ? { locationAddress: hit.address } : {}) });
  };

  const close = () => { setFocus(null); setActive(-1); };
  const pickVenue = (v) => { onChange({ locationName: v.name, locationAddress: v.address || address }); close(); };
  const pickPlace = (p) => { onChange({ locationAddress: p.address, ...(name.trim() ? {} : { locationName: p.name }) }); close(); };

  const offerSuggestion = focus === 'address' && !hasAddress && suggestion;
  const items = focus === 'name'
    ? venueMatches.map((v) => ({ key: v.name, title: v.name, sub: v.address, icon: History, pick: () => pickVenue(v) }))
    : offerSuggestion
      ? [{ key: 'suggested', title: suggestion.name, sub: suggestion.address, icon: MapPin, pick: () => pickPlace(suggestion) }]
      : focus === 'address'
        ? places.map((p) => ({ key: p.name + p.address, title: p.name || p.address, sub: p.name ? p.address : '', icon: MapPin, pick: () => pickPlace(p) }))
        : [];

  useEffect(() => { setActive(-1); }, [focus, items.length]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return close();
    if (!items.length) return undefined;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
    if (e.key === 'Enter' && active >= 0) { e.preventDefault(); items[active].pick(); }
    return undefined;
  };

  const inputProps = (which) => ({
    disabled,
    autoComplete: 'off',
    role: 'combobox',
    'aria-expanded': focus === which && items.length > 0,
    'aria-controls': listId,
    onFocus: () => setFocus(which),
    onBlur: close,
    onKeyDown,
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <label className="c3-label" htmlFor="ev-loc">venue</label>
        <input id="ev-loc" className="c3-input" value={name} placeholder="Building and room, or a venue name"
          onChange={(e) => setName(e.target.value)} {...inputProps('name')} />
        {focus === 'name' && (
          <Suggestions id={listId} items={items} active={active} heading={venueMatches.length ? 'used before' : ''} />
        )}
      </div>

      <div className="relative">
        <label className="c3-label" htmlFor="ev-addr">
          address <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <div className="relative">
          <input id="ev-addr" className="c3-input pr-10" value={address} placeholder="Start typing a street or building"
            onChange={(e) => onChange({ locationAddress: e.target.value })} {...inputProps('address')} />
          {searching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground absolute right-4 top-1/2 -translate-y-1/2" />}
        </div>
        {focus === 'address' && (
          <Suggestions id={listId} items={items} active={active} heading={offerSuggestion ? 'suggested for this venue' : ''}
            footer="Search by Photon · © OpenStreetMap contributors" />
        )}
        {suggestion && !hasAddress && !focus && (
          <button type="button" disabled={disabled} onClick={() => onChange({ locationAddress: suggestion.address })}
            className="mt-2 w-full text-left flex items-center gap-2 rounded-xl border-2 border-dashed border-border px-3 py-2 text-xs hover:bg-secondary/60 transition">
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">Suggested: </span>
              <span className="font-medium">{suggestion.name}</span>, {suggestion.address}
            </span>
            <span className="ml-auto pl-2 font-semibold text-primary shrink-0">use</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Suggestions({ id, items, active, heading, footer }) {
  if (!items.length) return null;
  return (
    // mousedown is cancelled so picking an option does not blur the input first
    <div id={id} role="listbox" onMouseDown={(e) => e.preventDefault()}
      className="absolute z-30 left-0 right-0 mt-1.5 rounded-2xl border-2 border-border bg-white shadow-[0_4px_0_0_hsl(var(--border))] overflow-hidden">
      {heading && <p className="px-3.5 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground">{heading}</p>}
      {items.map((it, i) => (
        <button key={it.key} type="button" role="option" aria-selected={i === active} onClick={it.pick}
          className={`w-full text-left px-3.5 py-2 flex items-start gap-2.5 transition ${i === active ? 'bg-secondary' : 'hover:bg-secondary/60'}`}>
          <it.icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-sm truncate">{it.title}</span>
            {it.sub && <span className="block text-xs text-muted-foreground truncate">{it.sub}</span>}
          </span>
        </button>
      ))}
      {footer && <p className="px-3.5 py-1.5 text-[10px] text-muted-foreground border-t border-border">{footer}</p>}
    </div>
  );
}

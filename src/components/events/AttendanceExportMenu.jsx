import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { generateAttendancePdf } from '@/lib/pdf';
import { generateAttendanceCsv, downloadCsv } from '@/lib/csv';

export default function AttendanceExportMenu({ event, club, rsvps, checkIns }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const total = (rsvps?.length || 0) + (checkIns?.filter((c) => !c.rsvp_id).length || 0);
  const disabled = total === 0;

  const handleCsv = async () => {
    setBusy('csv'); setOpen(false);
    try {
      const { csv, filename } = generateAttendanceCsv({ event, club, rsvps, checkIns });
      downloadCsv(filename, csv);
      toast.success('CSV downloaded');
    } catch (e) {
      toast.error('CSV export failed');
    } finally { setBusy(null); }
  };

  const handlePdf = async () => {
    setBusy('pdf'); setOpen(false);
    try {
      await generateAttendancePdf({ event, club, checkIns });
      toast.success('PDF downloaded');
    } catch (e) {
      toast.error('PDF export failed');
    } finally { setBusy(null); }
  };

  return (
    <div className="c3-card p-4 hover:bg-secondary/30 transition relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center justify-between mb-2">
          <Download className="w-5 h-5 text-primary" />
          {busy ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <p className="font-medium text-sm">export attendance</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {disabled ? 'no data yet' : `${total} attendee${total === 1 ? '' : 's'} · CSV or PDF`}
        </p>
      </button>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 c3-card p-1 z-20 shadow-xl">
            <button
              onClick={handleCsv}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary text-sm flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              <div>
                <p className="font-medium">CSV file</p>
                <p className="text-xs text-muted-foreground">spreadsheet — RSVPs + check-ins</p>
              </div>
            </button>
            <button
              onClick={handlePdf}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary text-sm flex items-center gap-2"
            >
              <FileText className="w-4 h-4 text-primary" />
              <div>
                <p className="font-medium">PDF report</p>
                <p className="text-xs text-muted-foreground">UMSU-compliant green sheet</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
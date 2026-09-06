import React, { useState, useRef, useEffect } from 'react';
import { api } from '@/api/client';
import { format } from 'date-fns';
import { Info } from 'lucide-react';

export default function CellInfoButton({ projectId, date, cellInfos, onCellInfosChange }) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showInPdf, setShowInPdf] = useState(false);
  const inputRef = useRef(null);

  const dateStr = format(date, 'yyyy-MM-dd');
  const existing = cellInfos?.find(ci => ci.project_id === projectId && ci.date === dateStr);
  const hasInfo = !!existing;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleOpen = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setInputValue(existing?.info || '');
    setShowInPdf(existing?.show_in_pdf || false);
    setEditing(true);
  };

  const handleSave = async (e) => {
    e?.stopPropagation();
    const trimmed = inputValue.trim();
    if (existing) {
      if (trimmed) {
        await api.entities.CellInfo.update(existing.id, { info: trimmed, show_in_pdf: showInPdf });
        onCellInfosChange(cellInfos.map(ci => ci.id === existing.id ? { ...ci, info: trimmed, show_in_pdf: showInPdf } : ci));
      } else {
        await api.entities.CellInfo.delete(existing.id);
        onCellInfosChange(cellInfos.filter(ci => ci.id !== existing.id));
      }
    } else if (trimmed) {
      const created = await api.entities.CellInfo.create({ project_id: projectId, date: dateStr, info: trimmed, show_in_pdf: showInPdf });
      onCellInfosChange([...cellInfos, created]);
    }
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 no-print"
        onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setEditing(false); }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="bg-white border border-gray-300 rounded-lg shadow-xl p-3 flex flex-col gap-2"
          style={{ minWidth: 220 }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div className="text-xs font-medium text-gray-600 mb-1">Tagesinfo</div>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Info eingeben... (leer = löschen)"
            className="text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 w-full"
          />
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 select-none" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={showInPdf}
              onChange={e => setShowInPdf(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-500"
            />
            Im PDF anzeigen
          </label>
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="text-xs bg-blue-500 text-white rounded px-2 py-1 hover:bg-blue-600"
            >
              Speichern
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="no-print flex items-center gap-1 flex-shrink-0">
      {hasInfo && (
        <span className="text-[8px] text-red-700 font-medium leading-tight max-w-[60px] truncate" title={existing.info}>
          {existing.info}
        </span>
      )}
      <button
        onClick={handleOpen}
        className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[8px] leading-none transition-colors ${
          hasInfo
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-green-500 text-white hover:bg-green-600'
        }`}
        title={hasInfo ? existing.info : 'Info hinzufügen'}
      >
        i
      </button>
    </div>
  );
}
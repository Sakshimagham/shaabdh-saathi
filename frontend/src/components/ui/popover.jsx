// src/components/ui/popover.jsx
import React, { useState } from 'react';

export const Popover = ({ children }) => {
  return <div className="relative inline-block">{children}</div>;
};

export const PopoverTrigger = ({ children, onClick, ...props }) => {
  return (
    <div onClick={onClick} className="cursor-pointer inline-block" {...props}>
      {children}
    </div>
  );
};

export const PopoverContent = ({ children, className = '' }) => {
  return (
    <div className={`absolute z-50 mt-2 p-3 bg-white border border-slate-200 rounded-lg shadow-lg text-sm text-slate-700 ${className}`}>
      {children}
    </div>
  );
};
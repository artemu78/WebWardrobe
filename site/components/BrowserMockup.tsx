import React from 'react';
import { BrowserMockupProps } from '../types';

export const BrowserMockup: React.FC<BrowserMockupProps> = ({ children, url = "chrome://extensions", active = false }) => {
  return (
    <div className={`rounded-lg overflow-hidden border shadow-lg transition-all duration-500 bg-white ${active ? 'border-brand-500 shadow-brand-500/20 scale-[1.02]' : 'border-gray-200'}`}>
      <div className="relative bg-gray-50 aspect-video flex items-center justify-center overflow-hidden group">
        {children}
      </div>
    </div>
  );
};
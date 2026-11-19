import React, { useState } from 'react';

export const BrandLogo = ({
  className = 'h-10 w-auto',
  variant = 'light',
  showSubtitle = true,
  showText = true
}) => {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    if (!showText) {
      return (
        <div className="flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#001F44] text-[#D4AF37] font-black border-2 border-[#D4AF37]/40 shadow-sm text-xl">
            SP
          </div>
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-2.5 font-bold ${variant === 'light' ? 'text-white' : 'text-[#001F44]'}`}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#001F44] text-[#D4AF37] font-black border border-[#D4AF37]/40 shadow-sm">
          SP
        </div>
        <div>
          <div className="text-base font-extrabold tracking-tight flex items-center gap-1.5">
            <span>SPMS</span>
            <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-[#D4AF37] text-[#001F44]">
              Portal
            </span>
          </div>
          {showSubtitle && (
            <p className="text-[10px] text-slate-400 font-medium tracking-wide">IIT Madras Campus</p>
          )}
        </div>
      </div>
    );
  }

  if (!showText) {
    return (
      <div className="flex items-center justify-center">
        <img
          src="/iitm-logo.png"
          alt="IIT Madras SPMS Logo"
          className={`${className} object-contain rounded-full shadow-md bg-white p-1 border border-slate-200/50`}
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <img
        src="/iitm-logo.png"
        alt="IIT Madras SPMS Logo"
        className={`${className} object-contain rounded-full shadow-sm bg-white p-0.5 border border-slate-200/20`}
        onError={() => setImageError(true)}
      />
      <div>
        <div className={`flex items-center gap-1.5 font-extrabold text-base tracking-tight leading-none ${variant === 'light' ? 'text-white' : 'text-[#001F44]'}`}>
          <span>SPMS</span>
          <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-[#D4AF37] text-[#001F44] font-mono">
            v4.0
          </span>
        </div>
        {showSubtitle && (
          <p className={`text-[10px] mt-1 font-medium tracking-wide ${variant === 'light' ? 'text-slate-300' : 'text-slate-500'}`}>
            IIT Madras Placement Automation
          </p>
        )}
      </div>
    </div>
  );
};

export default BrandLogo;

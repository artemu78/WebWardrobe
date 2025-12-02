import React from "react";
import { ArrowDown, PackageOpen } from "lucide-react";
import { ZIP_FILE_NAME } from "../constants";

export const Hero: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  return (
    <div className="bg-gradient-to-br from-gray-900 to-brand-900 text-white pt-24 pb-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-1.5 rounded-full text-sm font-medium mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
          </span>
          v2.11.2 Released
        </div>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          Setting up{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-300 via-brand-100 to-white drop-shadow-lg">
            WebWardrobe
          </span>
        </h1>

        <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-4 leading-relaxed">
          AI-powered Chrome extension that lets you virtually try on any clothes
          from any website using your selfie.
        </p>

        <a
          href="https://web-wardrobe.netlify.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-brand-300 hover:text-brand-200 underline text-sm mb-8 transition-colors"
        >
          Learn more about WebWardrobe →
        </a>

        <p className="text-base text-gray-400 max-w-2xl mx-auto mb-10">
          Follow this guide to install the extension manually while it's under
          review by Google.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={`/assets/${ZIP_FILE_NAME}`}
            download={ZIP_FILE_NAME}
            className="flex items-center gap-3 bg-gray-800/50 border border-gray-700 px-6 py-4 rounded-xl text-left hover:bg-gray-800 hover:border-brand-500 transition-all cursor-pointer"
          >
            <PackageOpen className="text-brand-400" size={32} />
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                Download File
              </p>
              <p className="font-mono text-sm font-semibold text-white">
                {ZIP_FILE_NAME}
              </p>
            </div>
          </a>
        </div>

        <button
          onClick={onStart}
          className="mt-12 flex items-center gap-2 mx-auto text-gray-400 hover:text-white transition-colors text-sm font-medium"
        >
          Scroll to start
          <ArrowDown size={16} className="animate-bounce" />
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { InstructionStep } from '../types';
import { BrowserMockup } from './BrowserMockup';

interface StepCardProps {
  step: InstructionStep;
  isCompleted: boolean;
  isActive: boolean;
  onComplete: () => void;
  isLast: boolean;
}

export const StepCard: React.FC<StepCardProps> = ({ step, isCompleted, isActive, onComplete, isLast }) => {
  const Icon = step.icon;
  
  // Use actual image if provided, otherwise fallback to placeholder
  const imageUrl = step.imageSrc || `https://placehold.co/800x500/f1f5f9/334155.png?text=${encodeURIComponent(step.imageAlt.split(' ').slice(0, 4).join(' ') + '...')}&font=roboto`;

  return (
    <div className={`relative pl-8 md:pl-0 flex flex-col md:flex-row gap-8 py-12 ${!isLast && 'border-b border-gray-100'}`}>
      {/* Mobile Timeline Line */}
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-100 md:hidden"></div>
      
      {/* Status Indicator (Mobile) */}
      <div className={`absolute left-0 top-12 w-6 h-6 rounded-full border-2 z-10 md:hidden flex items-center justify-center bg-white
        ${isCompleted ? 'border-green-500 bg-green-50' : isActive ? 'border-brand-500' : 'border-gray-200'}`}>
        {isCompleted && <div className="w-2.5 h-2.5 rounded-full bg-green-500" />}
        {isActive && !isCompleted && <div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />}
      </div>

      {/* Content Section */}
      <div className="flex-1 md:max-w-md flex flex-col justify-center">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2.5 rounded-xl ${isActive || isCompleted ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
            <Icon size={24} />
          </div>
          <span className="text-sm font-bold tracking-wider text-gray-400 uppercase">Step {step.id}</span>
        </div>
        
        <h3 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h3>
        <p className="text-gray-600 leading-relaxed mb-6">{step.description}</p>
        
        {step.notes && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-lg">
             <ul className="list-disc list-inside space-y-1">
               {step.notes.map((note, idx) => {
                 // Convert chrome:// URLs to clickable links
                 const parts = note.split(/(chrome:\/\/[^\s]+)/g);
                 return (
                   <li key={idx} className="text-sm text-yellow-800">
                     {parts.map((part, i) => 
                       part.startsWith('chrome://') ? (
                         <a 
                           key={i} 
                           href={part} 
                           className="underline hover:text-yellow-900 font-medium"
                           target="_blank"
                           rel="noopener noreferrer"
                         >
                           {part}
                         </a>
                       ) : (
                         <span key={i}>{part}</span>
                       )
                     )}
                   </li>
                 );
               })}
             </ul>
          </div>
        )}

        <button
          onClick={onComplete}
          disabled={isCompleted}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all w-fit
            ${isCompleted 
              ? 'bg-green-100 text-green-700 cursor-default' 
              : 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg hover:shadow-brand-500/30'
            }`}
        >
          {isCompleted ? (
            <>
              <CheckCircle2 size={18} />
              Completed
            </>
          ) : (
            "Mark as Done"
          )}
        </button>
      </div>

      {/* Visual Section */}
      <div className="flex-1 md:pl-8">
        <BrowserMockup active={isActive} url={step.id < 4 ? 'chrome://extensions' : 'Full Browser'}>
           <img 
             src={imageUrl} 
             alt={step.imageAlt}
             className="w-full h-full object-contain bg-gray-50"
             loading="lazy"
           />
           {/* Overlay hint if needed */}
           {isActive && (
             <div className="absolute inset-0 ring-1 ring-inset ring-black/5 pointer-events-none rounded-b-lg" />
           )}
        </BrowserMockup>
      </div>
    </div>
  );
};
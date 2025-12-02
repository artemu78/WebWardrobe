import React, { useState, useRef } from 'react';
import { Hero } from '../components/Hero';
import { StepCard } from '../components/StepCard';
import { STEPS } from '../constants';
import { HelpCircle, CheckCheck } from 'lucide-react';

const InstallationGuide: React.FC = () => {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  const toggleStep = (id: number) => {
    setCompletedSteps(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const scrollToSteps = () => {
    stepsContainerRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const allCompleted = STEPS.every(step => completedSteps.includes(step.id));

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800">
      <Hero onStart={scrollToSteps} />

      <main ref={stepsContainerRef} className="max-w-5xl mx-auto px-6 py-16">
        {/* Sticky Progress Bar - All Screens */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-gray-100 py-4 mb-8 -mx-6 px-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Installation Steps</h2>
              <p className="text-gray-500 text-sm mt-1 hidden sm:block">Complete each step to ensure proper setup.</p>
            </div>
            <div className="text-right">
              <div className="text-2xl sm:text-3xl font-bold text-brand-600">
                {Math.round((completedSteps.length / STEPS.length) * 100)}%
              </div>
              <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">Progress</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {STEPS.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              isLast={index === STEPS.length - 1}
              isCompleted={completedSteps.includes(step.id)}
              isActive={
                // Active if it's the first incomplete step, or if all are done and this is the last one
                (!completedSteps.includes(step.id) && 
                 STEPS.slice(0, index).every(s => completedSteps.includes(s.id))) ||
                (allCompleted && index === STEPS.length - 1)
              }
              onComplete={() => toggleStep(step.id)}
            />
          ))}
        </div>

        {allCompleted && (
          <div className="mt-16 bg-green-50 border border-green-100 rounded-2xl p-8 text-center animate-fade-in-up">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCheck size={32} />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">You're All Set!</h3>
            <p className="text-gray-600 max-w-lg mx-auto">
              WebWardrobe is installed and configured. Go to your favorite fashion retailer and start trying on looks!
            </p>
          </div>
        )}
      </main>

      <footer className="bg-gray-50 border-t border-gray-100 py-12 mt-12">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
             <HelpCircle size={16} />
             <span>Need help? Contact support at help@webwardrobe.com</span>
          </div>
          <p className="text-gray-400 text-sm">© 2024 WebWardrobe. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default InstallationGuide;
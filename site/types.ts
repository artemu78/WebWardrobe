import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface InstructionStep {
  id: number;
  title: string;
  description: string;
  icon: LucideIcon;
  imageAlt: string;
  imageSrc?: string;
  isImportant?: boolean;
  notes?: string[];
}

export interface BrowserMockupProps {
  children: React.ReactNode;
  url?: string;
  active?: boolean;
}

export interface User {
    name: string;
    picture: string;
    email?: string;
    userId?: string;
}
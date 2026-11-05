import React, { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showClose?: boolean;
}

export const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  description, 
  children, 
  size = 'md',
  showClose = true 
}: ModalProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl',
  };

  return (
    <div className='fixed inset-0 z-50 overflow-y-auto'>
      <div 
        ref={overlayRef}
        className='fixed inset-0 bg-black/50 transition-opacity'
        onClick={onClose}
        aria-hidden='true'
      />
      <div className='flex min-h-full items-center justify-center p-4'>
        <div
          ref={contentRef}
          className={clsx(
            'relative w-full bg-white rounded-2xl shadow-xl transform transition-all',
            sizes[size]
          )}
          role='dialog'
          aria-modal='true'
          aria-labelledby={title ? 'modal-title' : undefined}
          aria-describedby={description ? 'modal-description' : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {(title || showClose) && (
            <div className='flex items-start justify-between p-6 border-b border-gray-100'>
              <div>
                {title && (
                  <h2 id='modal-title' className='text-lg font-semibold text-gray-900'>
                    {title}
                  </h2>
                )}
                {description && (
                  <p id='modal-description' className='mt-1 text-sm text-gray-500'>
                    {description}
                  </p>
                )}
              </div>
              {showClose && (
                <button
                  onClick={onClose}
                  className='p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'
                  aria-label='Fechar'
                >
                  <X className='h-5 w-5' />
                </button>
              )}
            </div>
          )}
          <div className='p-6'>{children}</div>
        </div>
      </div>
    </div>
  );
};

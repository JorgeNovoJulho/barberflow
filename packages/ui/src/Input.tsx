import React from 'react';
import { clsx } from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    
    return (
      <div className='w-full'>
        {label && (
          <label htmlFor={inputId} className='block text-sm font-medium text-gray-700 mb-1'>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full px-4 py-3 rounded-lg border transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500',
            error
              ? 'border-red-300 text-red-900 placeholder-red-300'
              : 'border-gray-300 hover:border-gray-400',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className='mt-1 text-sm text-red-600' role='alert'>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className='mt-1 text-sm text-gray-500'>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

import React from 'react';
import { clsx } from 'clsx';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, placeholder, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    
    return (
      <div className='w-full'>
        {label && (
          <label htmlFor={selectId} className='block text-sm font-medium text-gray-700 mb-1'>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={clsx(
            'w-full px-4 py-3 rounded-lg border transition-colors appearance-none',
            'focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500',
            error
              ? 'border-red-300 text-red-900'
              : 'border-gray-300 hover:border-gray-400 bg-white',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          {...props}
        >
          {placeholder && <option value='' disabled>{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && (
          <p id={`${selectId}-error`} className='mt-1 text-sm text-red-600' role='alert'>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${selectId}-helper`} className='mt-1 text-sm text-gray-500'>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

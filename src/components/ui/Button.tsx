import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost';
    isLoading?: boolean;
}

export function Button({ 
    children, 
    variant = 'primary', 
    className = '', 
    isLoading = false,
    disabled,
    ...props 
}: ButtonProps) {
    const baseClass = `btn-${variant}`;
    
    return (
        <button 
            className={`${baseClass} flex items-center justify-center gap-2 ${className}`} 
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && (
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }} />
            )}
            {children}
        </button>
    );
}
